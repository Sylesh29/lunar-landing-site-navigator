"""Reference bearings for the browser's 160 m custom skyline calculation."""

import json

import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer
from rasterio.enums import Resampling

from benchmark_ridge import unit_vector
from generate_data import DEM, HEIGHT_M, OUTPUT, ROOT


def main():
    metadata = json.loads((OUTPUT / "polar.json").read_text(encoding="utf-8"))
    width, height = metadata["width"], metadata["height"]
    step = metadata["gridM"]
    radius = metadata["radiusM"]
    scale = metadata["scaleM"]
    distances = np.minimum(
        np.arange(step / 2, metadata["reachM"] + step / 2, step / 2),
        metadata["reachM"],
    )
    with rasterio.open(ROOT / ".data-cache" / DEM) as raster:
        overview = raster.read(1, out_shape=(height, width), resampling=Resampling.average)
        crs = CRS.from_wkt(raster.crs.to_wkt())
        project = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
        grid = np.rint(overview / scale) * scale

    def sample(longitude, latitude):
        x, y = project.transform(longitude, latitude, errcheck=True)
        col = (x - metadata["xMinM"]) / step - 0.5
        row = (metadata["yMaxM"] - y) / step - 0.5
        i, j = np.floor(row).astype(int), np.floor(col).astype(int)
        dx, dy = col - j, row - i
        values = (
            grid[i, j] * (1 - dx) * (1 - dy)
            + grid[i, j + 1] * dx * (1 - dy)
            + grid[i + 1, j] * (1 - dx) * dy
            + grid[i + 1, j + 1] * dx * dy
        )
        if not np.isfinite(values).all():
            raise ValueError("The reference ray crossed missing terrain")
        return values

    geod = Geod(a=radius, b=radius)
    checks = []
    for latitude, longitude in [(-89.51, 222.7), (-84.5, 0), (-84.5, 180), (-90, 190)]:
        ground = float(sample(longitude, latitude))
        up = unit_vector(longitude, latitude)
        east = unit_vector(longitude + 90, 0)
        frame = np.column_stack((east, np.cross(up, east), up))
        observer = (radius + ground + HEIGHT_M) * up
        bearings = []
        for bearing in [0, 23, 90, 180, 270, 287]:
            lon, lat, _ = geod.fwd(
                np.full(len(distances), longitude), np.full(len(distances), latitude),
                np.full(len(distances), bearing), distances,
            )
            points = unit_vector(lon, lat) * (radius + sample(lon, lat))[:, None]
            e, n, u = ((points - observer) @ frame).T
            elevation = float(np.degrees(np.arctan2(u, np.hypot(e, n))).max())
            bearings.append({"azimuth": bearing, "elevation": round(elevation, 8)})
        checks.append({"lat": latitude, "lon": longitude, "siteHeightM": round(ground, 6), "bearings": bearings})
    result = {"gridSha256": metadata["sha256"], "observerHeightM": HEIGHT_M, "checks": checks}
    (ROOT / "data" / "polar-checks.json").write_text(
        json.dumps(result, indent=2) + "\n", encoding="utf-8", newline="\n",
    )
    print(f"Generated {sum(len(check['bearings']) for check in checks)} independent reference bearings.")


if __name__ == "__main__":
    main()
