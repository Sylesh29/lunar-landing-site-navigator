"""Package the LOLA polar overview for local custom-site skyline calculations."""

import json
import hashlib
import zlib

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

from generate_data import DEM, DEM_URL, OUTPUT, ROOT, digest

GRID_M = 160
MAP_EXTENT_M = 170_000
MAP_PIXELS = 720
TILE_SIZE = 380
SCALE_M = 0.5
MISSING = -32768


def main():
    source = ROOT / ".data-cache" / DEM
    with rasterio.open(source) as raster:
        if raster.res != (80, 80) or raster.transform.b or raster.transform.d:
            raise ValueError("Unexpected regional DEM grid")
        grid = raster.read(1, out_shape=(raster.height // 2, raster.width // 2), resampling=Resampling.average)
        view = raster.read(
            1,
            window=from_bounds(-MAP_EXTENT_M, -MAP_EXTENT_M, MAP_EXTENT_M, MAP_EXTENT_M, raster.transform),
            out_shape=(MAP_PIXELS, MAP_PIXELS),
            resampling=Resampling.average,
        )
        transform = raster.transform
    tiles = OUTPUT / "polar"
    tiles.mkdir(parents=True, exist_ok=True)
    content_hash = hashlib.sha256()
    size = 0
    for row in range(0, grid.shape[0], TILE_SIZE):
        for col in range(0, grid.shape[1], TILE_SIZE):
            tile = grid[row:row + TILE_SIZE, col:col + TILE_SIZE]
            valid = np.isfinite(tile)
            values = np.zeros(tile.shape, dtype=np.int32)
            values[valid] = np.rint(tile[valid] / SCALE_M)
            previous = np.pad(values[:, :-1], ((0, 0), (1, 0)))
            deltas = values - previous
            if values.min() <= MISSING or values.max() > 32767 or deltas.min() <= MISSING or deltas.max() > 32767:
                raise ValueError("DEM cannot be represented as signed 16-bit elevations")
            deltas[~valid] = MISSING
            asset = zlib.compress(deltas.astype("<i2").tobytes(), level=9)
            (tiles / f"{row // TILE_SIZE}-{col // TILE_SIZE}.bin").write_bytes(asset)
            content_hash.update(asset)
            size += len(asset)
    metadata = {
        "tileDirectory": tiles.name, "tileSize": TILE_SIZE,
        "sha256": content_hash.hexdigest(), "source": DEM_URL, "sourceSha256": digest(source),
        "frame": "MOON_ME", "projection": "south-polar-stereographic", "radiusM": 1_737_400,
        "width": grid.shape[1], "height": grid.shape[0], "gridM": GRID_M,
        "xMinM": transform.c, "yMaxM": transform.f, "scaleM": SCALE_M, "missing": MISSING,
        "minSouthLatitude": -84.5, "reachM": 125_000, "mapExtentM": MAP_EXTENT_M,
    }
    (OUTPUT / "polar.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n"
    )

    slope_y, slope_x = np.gradient(view, 2 * MAP_EXTENT_M / MAP_PIXELS)
    normal_x, normal_y = -2 * slope_x, -2 * slope_y
    lighting = (-0.64 * normal_x - 0.48 * normal_y + 0.60) / np.sqrt(1 + normal_x ** 2 + normal_y ** 2)
    relief = np.clip(lighting, 0, 1)[..., None]
    surface = np.array([16, 24, 42]) + np.array([122, 146, 169]) * relief
    Image.fromarray(surface.astype(np.uint8)).save(OUTPUT / "polar-map.webp", quality=82)
    print(f"Packed {grid.shape[1]} × {grid.shape[0]} cells into {size / 1_000_000:.2f} MB of tiles")


if __name__ == "__main__":
    main()
