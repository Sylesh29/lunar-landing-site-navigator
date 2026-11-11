"""Recompute the Connecting Ridge demo with finer terrain and direct SPICE."""

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
import spiceypy as spice
from pyproj import CRS, Geod, Transformer

from generate_data import DEM, DEM_URL, FRAME, HEIGHT_M, KERNELS, OUTPUT, RADIUS_M, REACH_M, ROOT, SITES, digest

LOCAL = "Site01_final_adj_5mpp_surf.tif"
LOCAL_URL = f"https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/{LOCAL}"
RIDGE = next(site for site in SITES if site["id"] == "ridge")
AZIMUTH_STEP = 0.25
TIME_STEP_S = 15
WEEK_S = 7 * 24 * 3600


def unit_vector(lon, lat):
    lon, lat = np.radians(lon), np.radians(lat)
    return np.stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)), axis=-1)


def projection(raster, spacing):
    crs = CRS.from_wkt(raster.crs.to_wkt())
    if not np.allclose(raster.res, (spacing, spacing)):
        raise ValueError(f"Expected a {spacing} m grid, received {raster.res}")
    if not np.allclose(
        (crs.ellipsoid.semi_major_metre, crs.ellipsoid.semi_minor_metre),
        RADIUS_M,
        rtol=0,
        atol=0.01,
    ):
        raise ValueError("The reference raster uses an unexpected elevation datum")
    return Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)


def elevation_sampler(path, spacing):
    with rasterio.open(path) as raster:
        project = projection(raster, spacing)
        inverse = ~raster.transform
        pixels = raster.read(1)
        nodata, scale, offset = raster.nodata, raster.scales[0], raster.offsets[0]

    def sample(lon, lat):
        x, y = project.transform(np.atleast_1d(lon), np.atleast_1d(lat), errcheck=True)
        col, row = inverse * (x, y)
        col, row = col - 0.5, row - 0.5
        i, j = np.floor(row).astype(int), np.floor(col).astype(int)
        if i.min() < 0 or j.min() < 0 or i.max() + 1 >= pixels.shape[0] or j.max() + 1 >= pixels.shape[1]:
            raise ValueError(f"A reference ray leaves {path.name}")
        result = np.zeros_like(row)
        for dy, dx, weight in (
            (0, 0, (1 - (row - i)) * (1 - (col - j))),
            (0, 1, (1 - (row - i)) * (col - j)),
            (1, 0, (row - i) * (1 - (col - j))),
            (1, 1, (row - i) * (col - j)),
        ):
            values = pixels[i + dy, j + dx]
            if not np.isfinite(values).all() or (nodata is not None and np.any(values == nodata)):
                raise ValueError(f"Missing terrain along a reference ray in {path.name}")
            result += values * weight
        return result * scale + offset

    return sample


def reference_horizon(local_path, regional_path):
    lat, lon = RIDGE["lat"], RIDGE["lon"]
    geod = Geod(a=RADIUS_M, b=RADIUS_M)
    up = unit_vector(lon, lat)
    east = unit_vector(lon + 90, 0)
    basis = np.column_stack((east, np.cross(up, east), up))
    local = elevation_sampler(local_path, 5)
    regional = elevation_sampler(regional_path, 80)
    ground_height = float(local(lon, lat)[0])
    observer = up * (RADIUS_M + ground_height + HEIGHT_M)
    bearings = np.arange(0, 360, AZIMUTH_STEP)
    skyline = np.full(len(bearings), -90.0)
    for sample, distances in (
        (local, np.arange(2.5, 5000 + 2.5, 2.5)),
        (regional, np.arange(5040, REACH_M + 40, 40)),
    ):
        for start in range(0, len(bearings), 24):
            az, distance = np.meshgrid(bearings[start:start + 24], distances, indexing="ij")
            lon_at, lat_at, _ = geod.fwd(
                np.full(az.size, lon), np.full(az.size, lat), az.ravel(), distance.ravel(),
            )
            elevations = sample(lon_at, lat_at)
            targets = unit_vector(lon_at, lat_at) * (RADIUS_M + elevations)[:, None]
            e, n, u = ((targets - observer) @ basis).T
            angles = np.degrees(np.arctan2(u, np.hypot(e, n))).reshape(az.shape)
            end = start + len(angles)
            skyline[start:end] = np.maximum(skyline[start:end], angles.max(axis=1))
    return bearings, skyline, observer, basis, ground_height


def intervals(clearance, times):
    visible = clearance > 0
    indices = np.flatnonzero(visible[:-1] != visible[1:])
    edges = times[indices] - clearance[indices] * (times[indices + 1] - times[indices]) / (
        clearance[indices + 1] - clearance[indices]
    )
    boundaries = [*([0] if visible[0] else []), *edges, *([WEEK_S] if visible[-1] else [])]
    return [
        [round(float(start), 3), round(float(end), 3)]
        for start, end in zip(boundaries[::2], boundaries[1::2], strict=True)
        if end > start
    ]


def reference_windows(start, bearings, skyline, observer, basis):
    elapsed = np.arange(0, WEEK_S + TIME_STEP_S, TIME_STEP_S)
    epochs = spice.str2et(start.rstrip("Z")) + elapsed
    result = {}
    for body in ("sun", "earth"):
        vectors_km, _ = spice.spkpos(body.upper(), epochs, FRAME, "NONE", "MOON")
        e, n, u = ((vectors_km * 1000 - observer) @ basis).T
        az = np.degrees(np.arctan2(e, n)) % 360
        elevation = np.degrees(np.arctan2(u, np.hypot(e, n)))
        clearance = elevation - np.interp(az, bearings, skyline, period=360)
        result[body] = intervals(clearance, elapsed)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".data-cache")
    parser.add_argument("--install-profile", action="store_true", help="Use the finer profile in the app.")
    args = parser.parse_args()
    cache = args.cache.resolve()
    local_path, regional_path = cache / LOCAL, cache / DEM
    bearings, skyline, observer, basis, height = reference_horizon(local_path, regional_path)
    demo = json.loads((OUTPUT / "demo.json").read_text(encoding="utf-8"))
    if demo["site"] != RIDGE["id"]:
        raise ValueError("The default demo must use Connecting Ridge")
    try:
        for kernel in KERNELS:
            spice.furnsh(str(cache / kernel))
        cases = []
        for start in (demo["startA"], demo["startB"]):
            windows = reference_windows(start, bearings, skyline, observer, basis)
            cases.append({"landingUtc": start, "windowsElapsedSeconds": windows})
    finally:
        spice.kclear()
    result = {
        "site": RIDGE["id"],
        "lat": RIDGE["lat"],
        "lon": RIDGE["lon"],
        "durationSeconds": WEEK_S,
        "observerHeightM": HEIGHT_M,
        "groundElevationM": round(height, 3),
        "azimuthStepDeg": AZIMUTH_STEP,
        "timeStepSeconds": TIME_STEP_S,
        "sources": [
            {"url": LOCAL_URL, "gridM": 5, "maxDistanceM": 5000, "sha256": digest(local_path)},
            {"url": DEM_URL, "gridM": 80, "maxDistanceM": REACH_M, "sha256": digest(regional_path)},
        ],
        "cases": cases,
    }
    (ROOT / "data" / "ridge-benchmark.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    if args.install_profile:
        model_path = OUTPUT / "model.json"
        model = json.loads(model_path.read_text(encoding="utf-8"))
        if model["terrain"]["sha256"] != result["sources"][1]["sha256"]:
            raise ValueError("Generate the app model with the same regional DEM before installing the ridge profile")
        model["terrain"]["profiles"][RIDGE["id"]] = {
            "lat": RIDGE["lat"],
            "lon": RIDGE["lon"],
            "siteHeightM": round(height, 3),
            "anglesDeg": skyline.round(6).tolist(),
            "layers": result["sources"],
        }
        model_path.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
