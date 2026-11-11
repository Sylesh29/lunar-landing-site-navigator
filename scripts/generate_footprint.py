"""Bundle Connecting Ridge horizons and compare LOLA with the LROC NAC SfS product."""

import csv
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from pyproj import CRS, Transformer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "research" / "strict-9-5"))

from sensitivity_study import (
    CACHE, DATES, DEM, HEIGHTS, LOCAL, RADIUS_M, WEEK_S, body_windows,
    elevation_sampler, local_skyline, longest_gap, longest_overlap, look_vectors, positions,
)

SFS = "A306_GLDELEV_005.tif"
COVERAGE = "A306_GLDMASK_005.tif"
BEARINGS = np.arange(0, 360, 0.25)
ELAPSED = np.arange(0, WEEK_S + 15, 15)


def image_terrain(lola):
    sfs = elevation_sampler(CACHE / SFS, 5)
    with rasterio.open(CACHE / COVERAGE) as raster:
        crs = CRS(raster.crs)
        project = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        transform = ~raster.transform
        counts = raster.read(1)
    covered = 0
    tested = 0

    def covered_cells(lon, lat):
        x, y = project.transform(np.atleast_1d(lon), np.atleast_1d(lat), errcheck=True)
        col, row = transform * (x, y)
        i, j = np.floor(row).astype(int), np.floor(col).astype(int)
        valid = (i >= 0) & (j >= 0) & (i < counts.shape[0]) & (j < counts.shape[1])
        valid[valid] = counts[i[valid], j[valid]] > 0
        return valid

    def sample(lon, lat):
        nonlocal covered, tested
        valid = covered_cells(lon, lat)
        values = lola(lon, lat)
        if valid.any():
            values[valid] = sfs(np.atleast_1d(lon)[valid], np.atleast_1d(lat)[valid])
        covered += int(valid.sum())
        tested += valid.size
        return values

    return sample, covered_cells, lambda: covered / tested


def digest(filename):
    with (CACHE / filename).open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def metrics(sun, earth):
    overlap = max(0, longest_overlap(sun, earth))
    sun_gap, earth_gap = longest_gap(sun), longest_gap(earth)
    margin = min(overlap - 4, 72 - sun_gap, 120 - earth_gap)
    return [round(value, 5) for value in (overlap, sun_gap, earth_gap, margin)] + [margin >= 0]


def crossing_comparison(baseline, alternate):
    if len(baseline) != len(alternate) or any(
        (old[0] == 0, old[1] == WEEK_S) != (new[0] == 0, new[1] == WEEK_S)
        for old, new in zip(baseline, alternate)
    ):
        return None
    return max(
        (abs(a - b) for old, new in zip(baseline, alternate) for a, b in zip(old, new)),
        default=0,
    )


def main():
    local = elevation_sampler(CACHE / LOCAL, 5)
    regional = elevation_sampler(CACHE / DEM, 80)
    sfs, covered_cells, coverage_fraction = image_terrain(local)
    vectors = look_vectors(DATES, cadence=15)
    samples, rows = [], []
    for distance, bearing, lon, lat in positions():
        if not covered_cells(lon, lat)[0]:
            raise ValueError(f"Observer at {distance} m and {bearing}° lacks an illuminated LROC image")
        models = [local_skyline(lon, lat, sample, regional, BEARINGS) for sample in (local, sfs)]
        profiles = [
            {
                "siteHeightM": round(float(radii[0] - RADIUS_M - HEIGHTS[0]), 4),
                "angles": skyline.round(4).tolist(),
            }
            for radii, skyline, _ in models
        ]
        samples.append({"radius": distance, "bearing": bearing, "lat": lat, "lon": lon, "models": profiles})
        for date, (sun, earth) in vectors.items():
            windows = [
                [list(body_windows(body, *model, solar, BEARINGS, ELAPSED))
                 for body, solar in ((sun, True), (earth, False))]
                for model in models
            ]
            for i, height in enumerate(HEIGHTS):
                if height == 1:
                    continue
                baseline_sun, baseline_earth = (body[i] for body in windows[0])
                alternate_sun, alternate_earth = (body[i] for body in windows[1])
                rows.append([
                    str(date), distance, bearing, int(height),
                    *metrics(baseline_sun, baseline_earth), *metrics(alternate_sun, alternate_earth),
                    crossing_comparison(baseline_sun, alternate_sun),
                    crossing_comparison(baseline_earth, alternate_earth),
                ])
        print(f"Validated both surfaces at {distance} m and {bearing}°", flush=True)

    output = ROOT / "public" / "data" / "ridge-footprint.json"
    output.write_text(json.dumps({
        "version": 1,
        "site": "ridge",
        "heights": HEIGHTS.astype(int).tolist(),
        "azimuthStepDeg": 0.25,
        "imageRayFraction": round(coverage_fraction(), 5),
        "sha256": {filename: digest(filename) for filename in (LOCAL, DEM, SFS, COVERAGE)},
        "samples": samples,
    }, separators=(",", ":")) + "\n", encoding="utf-8")
    with (ROOT / "research" / "strict-9-5" / "terrain-cross-check.csv").open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow([
            "date_utc", "radius_m", "bearing_deg", "both_heights_m",
            *(f"{model}_{metric}" for model in ("lola", "lroc")
              for metric in ("overlap_h", "sun_gap_h", "earth_gap_h", "worst_margin_h", "pass")),
            "largest_matched_sun_crossing_shift_s", "largest_matched_earth_crossing_shift_s",
        ])
        writer.writerows(rows)


if __name__ == "__main__":
    main()
