# Lunar Landing Site Navigator

Compare the geometric sunlight and direct-to-Earth visibility of two hypothetical lunar landings. Choose IM-2 Athena, the Shackleton–de Gerlache Connecting Ridge reference point, or custom lunar coordinates. Use **Copy A to B** and **Delay B by 72 hours** to isolate a schedule change, then move the time cursor to see the Sun and Earth relative to both skylines.

Select a custom site on the LOLA south-pole map or enter coordinates. Landing dates span **2026–2030 UTC**. Open **Mission limits and date search** to screen continuous overlap and maximum outages, compare modeled horizontal solar exposure, and find nearby dates for B. Share the exact inputs with a link or download the geometric and operating intervals as a CSV. [Research and design decisions](docs/research.md)

## Try the default comparison

| Connecting Ridge landing | First-week Sun | First-week Earth | First-week overlap |
|---|---:|---:|---:|
| August 27, 2027 at 00:00 UTC | 119.6 h | 59.3 h | 10.9 h |
| August 30, 2027 at 00:00 UTC | 168.0 h | 0.0 h | 0.0 h |

The delay adds **48.4 hours of sunlight** and removes the modeled first-week Earth visibility window. Open the window details for absolute UTC intervals.

With the illustrative mission limits, August 27 meets the minimum overlap and maximum gap limits. August 30 misses the Earth-gap and overlap limits. The search finds three qualifying dates out of 29. When earlier dates are unavailable, choose **On or after B** to find September 13, with **113.8 hours** of continuous overlap. Horizontal solar exposure for the original August comparison increases from 2.33 to 2.91 equivalent full-sun hours across the first week.

## Run locally

Use Node.js 24 or later.

```sh
npm ci
npm run dev -- --port 4173
npm test
npm run verify:science
npm run build
npm run preview -- --port 4173
```

The static build is in `dist/`. The application loads its ephemeris and horizon data from the same site. GitHub Actions builds, validates, and deploys `dist/` when `main` changes.

## Data and model

- **Ephemeris.** NASA/JPL NAIF SPICE supplies hourly geometric Sun-center and Earth-center vectors relative to the Moon in `MOON_ME_DE440_ME421`. The bundled manifest records kernel filenames, URLs, SHA-256 digests, time coverage, and units. The browser interpolates vectors in Cartesian space and projects them into each observer’s local east, north, and up axes. [NAIF SPICE](https://naif.jpl.nasa.gov/naif/) · [Lunar reference frames](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/Tutorials/pdf/individual_docs/23_lunar-earth_pck-fk.pdf)
- **Terrain.** Both presets use a 2 m observer and terrain out to 125 km. IM-2 Athena uses the 80 m regional grid and 1° bearings. Connecting Ridge uses a 5 m grid within 5 km of the reference point, the 80 m grid beyond that distance, and 0.25° bearings. The regional grid can smooth features such as Athena’s 20 m crater. The header relief uses the regional elevation raster. [NASA regional LOLA DEM](https://pgda.gsfc.nasa.gov/products/90) · [NASA 5 m LOLA terrain](https://pgda.gsfc.nasa.gov/products/78) · [LROC Athena landing point](https://www.lroc.im-ldi.com/featured_sites/im2/flip-book) · [NASA Connecting Ridge reference](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)
- **Shared fallback.** If either scenario has no terrain profile, both use a 1,737.4 km smooth sphere with a 2 m observer and geometric horizon dip.
- **Custom polar terrain.** Points from 84.5°S to the pole use a 160 m overview of the regional LOLA grid. The browser downloads the tiles near a selected point and traces 360 bearings out to 125 km in a background worker. Outside terrain coverage, custom coordinates still support a smooth-sphere comparison.
- **Window meaning.** Each target counts as visible when its disk center clears the model horizon. The five-minute scan refines bracketed transitions to one minute and can miss short grazing windows. Geometry estimates lighting and Earth visibility. Eclipses, electrical power, ground-station access, and link budgets require separate models.

## Validation

| Check | Result |
|---|---|
| JPL Horizons airless apparent sky positions, both bodies at three locations and six times spanning 2026–2030 | 36 checked, maximum angular separation **0.005923°** |
| Hourly interpolation against direct SPICE midpoint calculations | 36 checked, maximum angular separation **0.000127°** |
| Terrain | Synthetic sphere and ridge checks passed. Both presets have full ray coverage. Sampled terrain heights were 5,321.50 m at Athena and 1,942.16 m at Connecting Ridge. |
| Custom terrain | 24 bearings at four sites, including the pole and coverage edge, agreed with a separate PROJ calculation to within 0.00001° on the same 160 m grid. |
| Geometry and windows | Tests cover bounds, projection, horizon wrap, transition refinement, endpoint clipping, overlap, and recovery of the nearest qualifying Connecting Ridge date. |

The [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) reference and direct SPICE midpoint samples are stored in `data/`. Angular thresholds apply to sky positions. Terrain resolution and visibility sampling also affect the calculated window times.

### Connecting Ridge benchmark

For the August 27 landing, the finer local terrain shifted sunrise **19 h 4 min later** and Earthset **6 h 15 min earlier** than the original 80 m model. The overlap fell from 36.2 h to 10.9 h. Both models give the August 30 landing a full week of modeled sunlight and zero modeled Earth visibility.

| Crossing in the August 27 scenario | Original 80 m profile | Finer terrain reference |
|---|---|---|
| Sun rises | August 28 at 05:21 UTC | August 29 at 00:25 UTC |
| Earth sets | August 29 at 17:33 UTC | August 29 at 11:19 UTC |

The reference calculation traces spherical bearings with PROJ, constructs the local skyline from Cartesian terrain points, and evaluates direct SPICE positions every 15 seconds. Using that same skyline, the browser’s two crossings agree with the reference within **8.3 seconds** at the demo dates. This measures agreement between the two calculations. Both terrain layers derive from LOLA altimetry. [Archived benchmark with input hashes and crossing times](data/ridge-benchmark.json) · [Barker et al. terrain methods](https://doi.org/10.1016/j.pss.2020.105119)

## Rebuild the science assets

Create a Python 3.12 virtual environment and install `requirements-science.txt`. Download the four kernel files and regional DEM listed in `public/data/model.json` and the [5 m Connecting Ridge GeoTIFF](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif) to `.data-cache/`, using their exact filenames. The checked-in assets are sufficient for a normal build.

```sh
python scripts/generate_data.py
python scripts/benchmark_ridge.py --install-profile
python scripts/fetch_horizons.py
python scripts/generate_polar_data.py
python scripts/benchmark_polar.py
npm run verify:science
```

`scripts/generate_data.py --smooth-sphere` generates the labeled smooth-sphere fallback if terrain is unavailable. Install Pillow to rebuild the polar map and tiles, or to regenerate the header relief with `scripts/render_relief.py`.

For browser checks, install Python Playwright and run `python tests/browser_smoke.py` with Chrome available. Set `NAVIGATOR_BASE_URL` to check the public site or a local preview. The walkthrough is in `public/walkthrough.mp4`. Regenerate it from a running preview with `scripts/record_demo.py` and the `imageio-ffmpeg` Python package.
