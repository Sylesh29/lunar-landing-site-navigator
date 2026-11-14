"""Compare pilot classifications and crossing times at finer model sampling."""

import json
from datetime import date

import numpy as np

from sensitivity_study import (
    CACHE, DEM, HEIGHTS, LOCAL, WEEK_S, body_windows, elevation_sampler,
    local_skyline, longest_gap, longest_overlap, look_vectors, positions,
)

DATES = tuple(date.fromisoformat(day) for day in (
    "2027-08-27", "2027-08-30", "2027-09-12", "2027-09-13",
))
FINE_BEARINGS = np.arange(0, 360, 0.25)
FINE_ELAPSED = np.arange(0, WEEK_S + 15, 15)


def crossings(windows):
    return [[window[edge] for window in windows if 0 < window[edge] < WEEK_S] for edge in (0, 1)]


def worst_margin(sun, earth):
    overlap = max(0, longest_overlap(sun, earth))
    return min(overlap - 4, 72 - longest_gap(sun), 120 - longest_gap(earth))


def main():
    local = elevation_sampler(CACHE / LOCAL, 5)
    regional = elevation_sampler(CACHE / DEM, 80)
    vectors = look_vectors(DATES, cadence=15)
    checked = 0
    shifts = []
    count_changes = []
    margin_shifts = []
    flips = []
    counts = {str(landing): {height: [0, 0] for height in (2, 5)} for landing in DATES}

    for distance, direction, lon, lat in positions():
        radii, fine_skyline, basis = local_skyline(lon, lat, local, regional, FINE_BEARINGS)
        for landing, (sun, earth) in vectors.items():
            windows = []
            for stride, spacing in ((4, 2), (1, 1)):
                windows.append([
                    list(body_windows(body[::stride], radii, fine_skyline[:, ::spacing], basis,
                                      solar, FINE_BEARINGS[::spacing], FINE_ELAPSED[::stride]))
                    for body, solar in ((sun, True), (earth, False))
                ])
            for i, height in enumerate(HEIGHTS):
                if height == 1:
                    continue
                point = (str(landing), distance, direction, int(height))
                (baseline_sun, baseline_earth), (fine_sun, fine_earth) = [
                    [body[i] for body in model] for model in windows
                ]
                for body, baseline, fine in (
                    ("Sun", baseline_sun, fine_sun), ("Earth", baseline_earth, fine_earth),
                ):
                    old, new = crossings(baseline), crossings(fine)
                    if tuple(map(len, old)) != tuple(map(len, new)):
                        count_changes.append((point, body, list(map(len, old)), list(map(len, new))))
                        continue
                    for old_events, new_events in zip(old, new, strict=True):
                        shifts.extend((abs(b - a), point, body) for a, b in zip(old_events, new_events, strict=True))
                margins = [worst_margin(*window) for window in (
                    (baseline_sun, baseline_earth), (fine_sun, fine_earth),
                )]
                passes = [value >= 0 for value in margins]
                for model, result in enumerate(passes):
                    counts[str(landing)][int(height)][model] += result
                if passes[0] != passes[1]:
                    flips.append((point, margins))
                margin_shifts.append((abs(margins[1] - margins[0]), point))
                checked += 1

    print(json.dumps({
        "cases": checked,
        "pass_counts_baseline_then_fine": counts,
        "matched_crossings_s": {
            "count": len(shifts),
            "median": float(np.median([shift[0] for shift in shifts])),
            "largest": max(shifts),
        },
        "changed_crossing_counts": count_changes,
        "largest_worst_margin_shift_h": max(margin_shifts),
        "classification_flips": flips,
    }, indent=2))


if __name__ == "__main__":
    main()
