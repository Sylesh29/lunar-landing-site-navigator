"""Refresh the JPL Horizons reference measurements used by verify:science."""

import csv
import json
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

from generate_data import OUTPUT, ROOT, SAMPLE_DATES, SITES

URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


def request_positions(site, altitude_km, body, target):
    times = [datetime.fromisoformat(date).replace(tzinfo=timezone.utc) for date in SAMPLE_DATES]
    julian_dates = " ".join(f"{date.timestamp() / 86400 + 2440587.5:.10f}" for date in times)
    query = urlencode({
        "format": "json",
        "COMMAND": f"'{target}'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site['lon']},{site['lat']},{altitude_km}'",
        "QUANTITIES": "'4'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
        "TIME_TYPE": "'UT'",
        "TIME_DIGITS": "'FRACSEC'",
        "TLIST_TYPE": "'JD'",
        "TLIST": julian_dates,
    })
    with urlopen(f"{URL}?{query}", timeout=45) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    table = payload["result"].split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    rows = list(csv.reader(table.splitlines()))
    if len(rows) != len(times):
        raise RuntimeError(f"Horizons returned {len(rows)} rows for {len(times)} dates")
    samples = []
    for row, utc in zip(rows, times, strict=True):
        reference_time = datetime.strptime(row[0].strip(), "%Y-%b-%d %H:%M:%S.%f").replace(tzinfo=timezone.utc)
        if abs((reference_time - utc).total_seconds()) > 0.01:
            raise RuntimeError(f"Horizons timestamp mismatch: {reference_time} != {utc}")
        samples.append({
            "site": site["id"],
            "lat": site["lat"],
            "lon": site["lon"],
            "altitudeKm": altitude_km,
            "body": body,
            "utc": utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "azimuthDeg": float(row[3]),
            "elevationDeg": float(row[4]),
        })
    return samples


def main():
    model = json.loads((OUTPUT / "model.json").read_text(encoding="utf-8"))
    profiles = (model["terrain"] or {}).get("profiles", {})
    samples = []
    for site in [*SITES, {"id": "equator", "lat": 0, "lon": 0}]:
        height = profiles.get(site["id"], {}).get("siteHeightM", 0)
        for body, target in [("sun", "10"), ("earth", "399")]:
            samples.extend(request_positions(site, (height + model["observerHeightM"]) / 1000, body, target))
            print(f"Validated reference query for {site['id']} / {body}", flush=True)
    result = {"source": URL, "quantity": "4, airless apparent azimuth and elevation", "samples": samples}
    (ROOT / "data" / "horizons-checks.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n"
    )


if __name__ == "__main__":
    main()
