"""Build the versioned, self-contained data assets used by the navigator."""

import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import spiceypy as spice

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data"
SITES = json.loads((ROOT / "data" / "sites.json").read_text(encoding="utf-8"))
FRAME = "MOON_ME_DE440_ME421"
KERNELS = {
    "de440s.bsp": "spk/planets",
    "moon_pa_de440_200625.bpc": "pck",
    "moon_de440_250416.tf": "fk/satellites",
    "naif0012.tls": "lsk",
}
KERNEL_ROOT = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
DEM = "LDEM_80S_80MPP_ADJ.TIF"
DEM_URL = f"https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/{DEM}"
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2031, 1, 31, tzinfo=timezone.utc)
STEP_SECONDS = 3600
RADIUS_M = 1_737_400.0
HEIGHT_M = 2.0
STEP_M = 40
REACH_M = 125_000
SAMPLE_DATES = (
    "2026-02-12T07:30:00",
    "2027-01-17T03:30:00",
    "2027-04-08T13:30:00",
    "2027-07-19T20:30:00",
    "2027-10-29T08:30:00",
    "2030-11-08T17:30:00",
)


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def moon_vectors(instant):
    et = spice.str2et(instant)
    return np.concatenate(
        [spice.spkpos(target, et, FRAME, "NONE", "MOON")[0] for target in ("SUN", "EARTH")]
    )


def ephemeris(cache):
    sources = []
    try:
        for filename, directory in KERNELS.items():
            path = cache / filename
            spice.furnsh(str(path))
            sources.append({
                "file": filename,
                "url": f"{KERNEL_ROOT}/{directory}/{filename}",
                "sha256": digest(path),
            })
        count = (END - START) // timedelta(seconds=STEP_SECONDS) + 1
        vectors = np.array(
            [
                moon_vectors((START + timedelta(seconds=i * STEP_SECONDS)).strftime("%Y-%m-%dT%H:%M:%S"))
                for i in range(count)
            ],
            dtype="<f8",
        )
        if not np.isfinite(vectors).all():
            raise ValueError("SPICE returned non-finite coordinates")
        samples = [{"utc": t + "Z", "vectorsKm": moon_vectors(t).tolist()} for t in SAMPLE_DATES]
    finally:
        spice.kclear()
    return vectors, samples, {
        "file": "vectors.bin",
        "frame": FRAME,
        "units": "km",
        "encoding": "float64-le",
        "order": ["sunX", "sunY", "sunZ", "earthX", "earthY", "earthZ"],
        "startUtc": START.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endUtc": END.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stepSeconds": STEP_SECONDS,
        "sampleCount": count,
        "sources": sources,
    }


def ray_coordinates(lat, lon, radius):
    """Return geocentric ray locations for clockwise-from-north bearings."""
    phi, lam = np.radians([lat, lon])
    azimuth = np.radians(np.arange(360))[:, None]
    distances = np.arange(STEP_M, REACH_M + STEP_M, STEP_M)
    arc = distances / radius
    up = np.array([np.cos(phi) * np.cos(lam), np.cos(phi) * np.sin(lam), np.sin(phi)])
    east = np.array([-np.sin(lam), np.cos(lam), 0])
    north = np.cross(up, east)
    direction = np.cos(azimuth) * north + np.sin(azimuth) * east
    points = np.cos(arc)[None, :, None] * up + np.sin(arc)[None, :, None] * direction[:, None, :]
    ray_lon = np.degrees(np.arctan2(points[..., 1], points[..., 0]))
    ray_lat = np.degrees(np.arcsin(points[..., 2].clip(-1, 1)))
    return ray_lon, ray_lat, arc


def horizon_angles(heights, site_height, arcs, radius):
    """Project radial terrain points into the observer's vertical ray plane."""
    target_radius = radius + heights
    horizontal = target_radius * np.sin(arcs)
    vertical = target_radius * np.cos(arcs) - (radius + site_height + HEIGHT_M)
    return np.degrees(np.arctan2(vertical, horizontal)).max(axis=-1)


def sample_dem(dataset, transformer, longitude, latitude):
    from rasterio.windows import Window

    x, y = transformer.transform(longitude, latitude, errcheck=True)
    cols, rows = ~dataset.transform * (x, y)
    cols, rows = np.asarray(cols) - 0.5, np.asarray(rows) - 0.5
    col_idx, row_idx = np.floor(cols).astype(int), np.floor(rows).astype(int)
    left, top = int(col_idx.min()), int(row_idx.min())
    right, bottom = int(col_idx.max()) + 2, int(row_idx.max()) + 2
    if left < 0 or top < 0 or right > dataset.width or bottom > dataset.height:
        raise ValueError("Terrain rays leave the published DEM")
    pixels = dataset.read(1, window=Window(left, top, right - left, bottom - top), masked=True)
    i, j = row_idx - top, col_idx - left
    frac_x, frac_y = cols - col_idx, rows - row_idx
    samples = (
        pixels[i, j] * (1 - frac_x) * (1 - frac_y)
        + pixels[i, j + 1] * frac_x * (1 - frac_y)
        + pixels[i + 1, j] * (1 - frac_x) * frac_y
        + pixels[i + 1, j + 1] * frac_x * frac_y
    )
    if np.ma.getmaskarray(samples).any() or not np.isfinite(samples).all():
        raise ValueError("Terrain rays contain missing elevation samples")
    return np.asarray(samples) * dataset.scales[0] + dataset.offsets[0]


def terrain(cache):
    import rasterio
    from pyproj import CRS, Transformer

    path = cache / DEM
    profiles = {}
    with rasterio.open(path) as dataset:
        crs = CRS.from_wkt(dataset.crs.to_wkt())
        radius = crs.ellipsoid.semi_major_metre
        if abs(radius - RADIUS_M) > 0.01 or abs(crs.ellipsoid.semi_minor_metre - radius) > 0.01:
            raise ValueError(f"Unexpected DEM reference sphere: {crs.to_string()}")
        if not np.allclose(dataset.res, (80, 80)):
            raise ValueError(f"Unexpected DEM pixel scale: {dataset.res}")
        transform = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        for site in SITES:
            lat, lon = site["lat"], site["lon"]
            lon = (lon + 180) % 360 - 180
            site_height = float(sample_dem(dataset, transform, np.array([lon]), np.array([lat]))[0])
            if site["id"] == "athena" and abs(site_height - 5321) > 100:
                raise ValueError(f"Athena DEM height {site_height:.1f} m differs from LROC placement")
            ray_lon, ray_lat, arcs = ray_coordinates(lat, lon, radius)
            heights = sample_dem(dataset, transform, ray_lon, ray_lat)
            angles = horizon_angles(heights, site_height, arcs, radius)
            profiles[site["id"]] = {
                "lat": lat,
                "lon": site["lon"],
                "siteHeightM": round(site_height, 3),
                "anglesDeg": angles.round(6).tolist(),
            }
            print(f"{site['id']}: {site_height:.2f} m surface, skyline {angles.min():.2f}° to {angles.max():.2f}°")
    return {
        "file": DEM,
        "url": DEM_URL,
        "sha256": digest(path),
        "gridM": 80,
        "reachM": REACH_M,
        "rayStepM": STEP_M,
        "azimuthStepDeg": 1,
        "profiles": profiles,
    }


def test_terrain_math():
    _, _, arcs = ray_coordinates(-89.468, 222.6, RADIUS_M)
    flat = np.zeros((360, arcs.size))
    expected_dip = -np.degrees(np.arccos(RADIUS_M / (RADIUS_M + HEIGHT_M)))
    np.testing.assert_allclose(horizon_angles(flat, 0, arcs, RADIUS_M), expected_dip, atol=0.00001)
    flat[90, 24] = 52
    angles = horizon_angles(flat, 0, arcs, RADIUS_M)
    assert int(np.argmax(angles)) == 90
    assert abs(angles[90] - 2.846) < 0.01


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=ROOT / ".data-cache")
    parser.add_argument("--smooth-sphere", action="store_true", help="Skip terrain and ship a labeled sphere model.")
    args = parser.parse_args()
    test_terrain_math()
    vectors, samples, metadata = ephemeris(args.cache.resolve())
    model = {
        "ephemeris": metadata,
        "observerHeightM": HEIGHT_M,
        "referenceRadiusKm": RADIUS_M / 1000,
        "terrain": None if args.smooth_sphere else terrain(args.cache.resolve()),
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    vectors.tofile(OUTPUT / metadata["file"])
    metadata["sha256"] = digest(OUTPUT / metadata["file"])
    (OUTPUT / "model.json").write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8", newline="\n")
    (ROOT / "data" / "spice-checks.json").write_text(
        json.dumps(samples, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"Generated {metadata['sampleCount']} hourly ephemeris samples.")


if __name__ == "__main__":
    main()
