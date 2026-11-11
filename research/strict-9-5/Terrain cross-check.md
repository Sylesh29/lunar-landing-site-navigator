# Connecting Ridge terrain cross-check

The 5 m hardware example first clears all three mission limits at all 17 sampled positions on **September 13, 2027 at 00:00 UTC** when both terrain models are required. On September 12 the original LOLA terrain passes at 17 of 17 positions. The LROC shape-from-shading terrain passes at 15. At 50 m south of the reference point, the LROC model gives a 94.0 h Sun gap, 22.0 h beyond the 72 h limit.

| 2027 landing at 00:00 UTC | Both heights | LOLA | LROC SfS | Worst margin across both |
|---|---:|---:|---:|---|
| August 30 | 2 m | 0/17 | 0/17 | −48.0 h Earth gap |
| September 13 | 2 m | 14/17 | 10/17 | −40.6 h Sun gap, 50 m S, LROC |
| September 12 | 5 m | 17/17 | 15/17 | −22.0 h Sun gap, 50 m S, LROC |
| September 13 | 5 m | 17/17 | 17/17 | +2.0 h Sun gap, 50 m S, LROC |
| September 22 | 5 m | 17/17 | 17/17 | +29.5 h Sun gap, 100 m NW, LROC |

The 2 m settings yield no date that passes everywhere in either the 29-date dual-terrain search or the LOLA-only search. At 5 m, September 22 gives the largest worst margin over that search. There were **80 classification changes in 1,020 paired cases** across the two terrain inputs. LOLA alone passed 79 of those cases and LROC alone passed one.

## Inputs and calculation

- Site C1 is 89.468°S, 222.6°E. The 17 samples comprise C1 and eight bearings on each of the 50 m and 100 m rings.
- The baseline uses the 5 m LOLA terrain within 5 km and the 80 m LOLA regional terrain out to 125 km. The alternate uses A306 shape-from-shading elevation where the published mask shows at least one illuminated NAC input, with the original 5 m LOLA elsewhere inside 5 km and common 80 m LOLA beyond it. Every observer falls in illuminated-image coverage. Across the sampled near-field rays, 98.4% of elevation lookups use image-derived cells. Both products use a lunar radius of 1,737,400 m and the same datum. The LROC reconstruction starts from a LOLA prior. [LOLA local product](https://pgda.gsfc.nasa.gov/products/78) · [LOLA regional product](https://pgda.gsfc.nasa.gov/products/90) · [LROC product and method](https://pgda.gsfc.nasa.gov/products/104) · [Bertone et al.](https://doi.org/10.3847/PSJ/ae5b70)
- The check uses direct SPICE vectors at 15 s steps, 0.25° skyline bearings and linear crossing refinement. The app interpolates hourly vectors and scans the same skylines every 30 s in a worker, refining bracketed crossings to within four seconds of the interpolated model. Finer sampling cannot eliminate terrain-model disagreement. [Geometry kernels](https://naif.jpl.nasa.gov/naif/data_generic.html)
- The operating limits are at least 4 h continuous joint visibility, at most 72 h without usable Sun, and at most 120 h without Earth-center visibility over seven days. At the 5 m September 13 case, the longest Sun gap reaches 70.0 h, leaving 2.0 h of margin. Qualification counts sampled locations. They do not estimate landing probability or certify power and communications.

## Reproduce

1. Set up the science environment and baseline raster and kernel files using the [project instructions](../../README.md#rebuild-the-science-assets).
2. From `A3CLR22_6_Connecting_Ridge.zip`, extract `A306_GLDELEV_005.tif` and `A306_GLDMASK_005.tif` into `.data-cache/`. The generator checks the raster projection and datum. SHA-256 hashes of the four source rasters are recorded in the [bundled data](../../public/data/ridge-footprint.json). [Official archive](https://zenodo.org/records/17954508)
3. Run `python scripts/generate_footprint.py` from the repository root. It produces the bundled horizons and the [paired results](terrain-cross-check.csv). Empty crossing-difference fields indicate differing window counts or clipping at an endpoint. The recorded differences pair comparable rise and set sequences by time order.
