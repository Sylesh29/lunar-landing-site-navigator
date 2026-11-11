"""Render a shaded illustration of LOLA topography around the south pole."""

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import Window

from generate_data import DEM, ROOT

with rasterio.open(ROOT / ".data-cache" / DEM) as dataset:
    row, col = dataset.index(0, 0)
    terrain = dataset.read(1, window=Window(col - 490, row - 215, 820, 430)).astype(float)
    height = terrain * dataset.scales[0] + dataset.offsets[0]
    dy, dx = np.gradient(height, *dataset.res)

nx, ny = -dx * 2, -dy * 2
lambert = (-0.64 * nx - 0.48 * ny + 0.60) / np.sqrt(nx * nx + ny * ny + 1)
brightness = np.clip(lambert, 0, 1)[..., None]
base, light = np.array([14, 22, 37]), np.array([137, 158, 184])
pixels = (base + (light - base) * brightness).astype(np.uint8)
Image.fromarray(pixels).save(ROOT / "public" / "terrain-relief.webp", quality=83)
