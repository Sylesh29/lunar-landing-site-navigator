"""Connecting Ridge pilot. Run with the app's science requirements and cached NASA inputs."""

import csv
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import spiceypy as spice
from pyproj import Geod

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from benchmark_ridge import LOCAL, RIDGE, elevation_sampler, intervals, unit_vector
from generate_data import DEM, FRAME, KERNELS, RADIUS_M, REACH_M

CACHE = ROOT / ".data-cache"
DATES = (date(2027, 8, 27), *(date(2027, 8, 30) + timedelta(days=i) for i in range(29)))
HEIGHTS = np.array([1.0, 2.0, 5.0])
BEARINGS = np.arange(0.0, 360.0, 0.5)
WEEK_S = 7 * 24 * 3600
ELAPSED = np.arange(0, WEEK_S + 60, 60)
GEOD = Geod(a=RADIUS_M, b=RADIUS_M)


def look_vectors(dates=DATES, cadence=60):
    vectors = {}
    try:
        for kernel in KERNELS:
            spice.furnsh(str(CACHE / kernel))
        last_second = (dates[-1] - dates[0]).days * 86400 + WEEK_S
        epochs = spice.str2et(f"{dates[0]}T00:00:00") + np.arange(0, last_second + cadence, cadence)
        series = [spice.spkpos(body, epochs, FRAME, "NONE", "MOON")[0] * 1000 for body in ("SUN", "EARTH")]
        for landing in dates:
            first = (landing - dates[0]).days * 86400 // cadence
            vectors[landing] = [body[first:first + WEEK_S // cadence + 1] for body in series]
    finally:
        spice.kclear()
    return vectors


def positions():
    center = (RIDGE["lon"], RIDGE["lat"])
    yield 0, 0, *center
    for distance in (50, 100):
        for bearing in range(0, 360, 45):
            lon, lat, _ = GEOD.fwd(*center, bearing, distance)
            yield distance, bearing, lon % 360, lat


def local_skyline(lon, lat, local, regional, bearings=BEARINGS):
    site_height = float(local(lon, lat)[0])
    radii = RADIUS_M + site_height + HEIGHTS
    skyline = np.full((len(HEIGHTS), len(bearings)), -90.0)
    for elevation, distances in (
        (local, np.arange(2.5, 5000.1, 2.5)),
        (regional, np.arange(5040, REACH_M + 1, 40)),
    ):
        arc = distances / RADIUS_M
        cos_arc, sin_arc = np.cos(arc), np.sin(arc)
        for index in range(0, len(bearings), 32):
            az, ds = np.meshgrid(bearings[index:index + 32], distances, indexing="ij")
            target_lon, target_lat, _ = GEOD.fwd(
                np.full(az.size, lon), np.full(az.size, lat), az.ravel(), ds.ravel()
            )
            target_radii = (RADIUS_M + elevation(target_lon, target_lat)).reshape(az.shape)
            vertical = target_radii * cos_arc
            horizontal = target_radii * sin_arc
            angles = np.degrees(np.arctan2(vertical - radii[:, None, None], horizontal)).max(axis=2)
            subset = skyline[:, index:index + len(az)]
            np.maximum(subset, angles, out=subset)
    up = unit_vector(lon, lat)
    east = unit_vector(lon + 90, 0)
    basis = np.column_stack((east, np.cross(up, east), up))
    return radii, skyline, basis


def body_windows(vectors, radii, skyline, basis, solar, bearings=BEARINGS, elapsed=ELAPSED):
    e, n, up = (vectors @ basis).T
    azimuth = np.degrees(np.arctan2(e, n)) % 360
    horizontal = np.hypot(e, n)
    for radius, profile in zip(radii, skyline, strict=True):
        elevation = np.degrees(np.arctan2(up - radius, horizontal))
        clearance = elevation - np.interp(azimuth, bearings, profile, period=360)
        yield intervals(np.minimum(clearance, elevation) if solar else clearance, elapsed)


def longest_gap(windows):
    end = 0
    longest = 0
    for start, stop in windows:
        longest = max(longest, start - end)
        end = stop
    return max(longest, WEEK_S - end) / 3600


def longest_overlap(sun, earth):
    return max((min(b, d) - max(a, c) for a, b in sun for c, d in earth), default=0) / 3600


def main():
    local = elevation_sampler(CACHE / LOCAL, 5)
    regional = elevation_sampler(CACHE / DEM, 80)
    vectors = look_vectors()
    output = []
    for distance, bearing, lon, lat in positions():
        radii, skyline, basis = local_skyline(lon, lat, local, regional)
        for date, (sun_vectors, earth_vectors) in vectors.items():
            solar = list(body_windows(sun_vectors, radii, skyline, basis, True))
            earth = list(body_windows(earth_vectors, radii, skyline, basis, False))
            for panel, sun in zip(HEIGHTS, solar, strict=True):
                sun_gap = longest_gap(sun)
                for antenna, earth_view in zip(HEIGHTS, earth, strict=True):
                    earth_gap = longest_gap(earth_view)
                    overlap = max(0.0, longest_overlap(sun, earth_view))
                    output.append({
                        "landing_utc": f"{date}T00:00:00Z",
                        "radius_m": distance,
                        "bearing_deg": bearing,
                        "latitude_deg": f"{lat:.8f}",
                        "longitude_east_deg": f"{lon:.8f}",
                        "panel_height_m": int(panel),
                        "antenna_height_m": int(antenna),
                        "longest_overlap_h": round(overlap, 5),
                        "longest_sun_gap_h": round(sun_gap, 5),
                        "longest_earth_gap_h": round(earth_gap, 5),
                        "meets_demo_limits": overlap >= 4 and sun_gap <= 72 and earth_gap <= 120,
                    })
        print(f"Completed {distance:>3} m at {bearing:>3}°", flush=True)
    with (HERE / "Connecting Ridge sensitivity.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=output[0].keys())
        writer.writeheader()
        writer.writerows(output)


if __name__ == "__main__":
    main()
