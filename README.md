# Lunar Landing Site Navigator

AstroSpace’s entry for the 2026 NASA Space Apps Challenge, New York. The navigator compares how lunar terrain and landing dates affect sunlight and direct-to-Earth visibility. Use it to inspect two landing plans, see which mission limits a delay would miss, and find a date that meets them.

[**Open the live navigator**](https://sylesh29.github.io/lunar-landing-site-navigator/) · [**Download the seven-slide PowerPoint**](https://sylesh29.github.io/lunar-landing-site-navigator/astrospace-lunar-landing-site-navigator.pptx) · [**Watch the narrated demo (29.8 s)**](https://sylesh29.github.io/lunar-landing-site-navigator/walkthrough.mp4)

**Team** — Venkata Sylesh Kona, Vamsi Muppana, and Hemanth Sai Chalumuru. The PowerPoint includes speaker notes for the five-minute New York pitch. [Challenge brief](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/)

## Try the Connecting Ridge example

A three-day delay adds **48.4 hours of modeled sunlight** and removes all **59.3 hours of Earth visibility** in the first week after landing.

| Connecting Ridge landing | First-week Sun | First-week Earth | First-week overlap |
|---|---:|---:|---:|
| August 27, 2027 at 00:00 UTC | 119.6 h | 59.3 h | 10.9 h |
| August 30, 2027 at 00:00 UTC | 168.0 h | 0.0 h | 0.0 h |

1. Open the live navigator. The default compares both dates at the same site. Select **Copy A to B**, then **Delay B by 72 hours** to replay the change.
2. Move the time cursor to see the Sun and Earth relative to both skylines. Expand **Window start and end times (UTC)** to see the underlying intervals.
3. Open **Mission limits and point date search**, choose **On or after B**, and select **Find nearby dates for B**. September 13 is the first qualifying date at the reference point, with **113.8 hours** of continuous overlap at the fixed 2 m observer height.

You can also compare IM-2 Athena or custom coordinates on the LOLA south-pole map, use landing dates from **2026 through 2030 UTC**, and compare equivalent full-sun hours for a horizontal panel. Share the exact inputs with a link or export the UTC windows as CSV.

### Check the landing footprint

Keep Scenario B at **August 30, 2027 at 00:00 UTC**. In **Landing footprint search**, set the solar panel and antenna to **5 m** and select **Search from B**. The search checks up to 29 daily dates at the same UTC time. Each date must meet all three demo limits at all 17 sampled positions on both terrain models. The first-week limits are at least 4 hours of continuous Sun and Earth overlap, at most 72 hours without usable Sun, and at most 120 hours without Earth in view.

| Landing at 00:00 UTC | Panel and antenna height | LOLA positions passing | LROC positions passing | Result |
|---|---:|---:|---:|---|
| September 12, 2027 | 5 m | 17/17 | 15/17 | The Sun gap reaches 94 h at the sample 50 m south, exceeding the limit by 22 h. |
| September 13, 2027 | 5 m | 17/17 | 17/17 | Earliest qualifying date, with 2 h of margin against the Sun-gap limit. |

At **2 m** for both heights, none of the 29 dates passes at every sampled position on both terrains. Select **Use earliest date for B** to apply the 5 m result, then **Copy footprint comparison** to share the date, settings, and search range. The footprint CSV includes every checked case. [Terrain cross-check and source data](docs/validation/Terrain%20cross-check.md)

Three simulated first-time visitors recovered and reopened the shared result using mobile, desktop, and keyboard-only workflows. The review records where they hesitated and the interface changes that followed. [Simulated usability review](docs/validation/Agent%20usability%20review.md) · [First-time usability study kit](docs/validation/Usability%20study%20kit.md)

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

## Use of Super Intelligence

OpenAI Codex assisted with research, code and tests, interpretation of validation results, simulated usability checks, and preparation of the submission and PowerPoint. Codex also helped script, caption, and edit the walkthrough. Kokoro synthesized the English narration. The video uses captures of the running navigator. The PowerPoint’s cover credits the NASA Scientific Visualization Studio source. [Cover visualization](https://svs.gsfc.nasa.gov/5228/)

The app computes its results from NASA/JPL ephemerides and NASA lunar terrain using deterministic geometry. The source datasets are NASA products. The repository contains the scripts used to compute the derived data.

## Data and model

- **Ephemeris.** NASA/JPL NAIF SPICE supplies hourly geometric Sun-center and Earth-center vectors relative to the Moon in `MOON_ME_DE440_ME421`. The bundled manifest records kernel filenames, URLs, SHA-256 digests, time coverage, and units. The browser interpolates vectors in Cartesian space and projects them into each observer’s local east, north, and up axes. [NAIF SPICE](https://naif.jpl.nasa.gov/naif/) · [Lunar reference frames](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/Tutorials/pdf/individual_docs/23_lunar-earth_pck-fk.pdf)
- **Terrain.** Both presets use a 2 m observer and terrain out to 125 km. IM-2 Athena uses the 80 m regional grid and 1° bearings. Connecting Ridge uses a 5 m grid within 5 km of the reference point, the 80 m grid beyond that distance, and 0.25° bearings. The regional grid can smooth features such as Athena’s 20 m crater. The header relief uses the regional elevation raster. [NASA regional LOLA DEM](https://pgda.gsfc.nasa.gov/products/90) · [NASA 5 m LOLA terrain](https://pgda.gsfc.nasa.gov/products/78) · [LROC Athena landing point](https://www.lroc.im-ldi.com/featured_sites/im2/flip-book) · [NASA Connecting Ridge reference](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)
- **Shared fallback.** If either scenario has no terrain profile, both use a 1,737.4 km smooth sphere with a 2 m observer and geometric horizon dip.
- **Custom polar terrain.** Points from 84.5°S to the pole use a 160 m overview of the regional LOLA grid. The browser downloads the tiles near a selected point and traces 360 bearings out to 125 km in a background worker. Outside terrain coverage, custom coordinates still support a smooth-sphere comparison.
- **Connecting Ridge footprint.** The footprint uses the 5 m LOLA surface and a second 5 m surface enhanced using LROC narrow-angle images. Both share the same regional terrain beyond 5 km. The 30-second clearance scan and 0.25° skyline grid support geometric screening at the sampled locations and at 1, 2 or 5 m above the surface. [NASA LROC shape-from-shading model](https://pgda.gsfc.nasa.gov/products/104)
- **Window meaning.** Each target counts as visible when its disk center clears the model horizon. The five-minute scan refines bracketed transitions to one minute and can miss short grazing windows. Geometry estimates lighting and Earth visibility. Eclipses, electrical power, ground-station access, and link budgets require separate models.

## Validation

| Check | Result |
|---|---|
| JPL Horizons airless apparent sky positions, both bodies at three locations and six times spanning 2026–2030 | 36 checked, maximum angular separation **0.005923°** |
| Hourly interpolation against direct SPICE midpoint calculations | 36 checked, maximum angular separation **0.000127°** |
| Terrain | Synthetic sphere and ridge checks passed. Both presets have full ray coverage. Sampled terrain heights were 5,321.50 m at Athena and 1,942.16 m at Connecting Ridge. |
| Custom terrain | 24 bearings at four sites, including the pole and coverage edge, agreed with a separate PROJ calculation to within 0.00001° on the same 160 m grid. |
| Geometry and windows | Tests cover bounds, projection, horizon wrap, transition refinement, endpoint clipping, overlap, and recovery of the nearest qualifying Connecting Ridge date. |
| Terrain-product cross-check | 1,020 paired cases. 80 pass/fail changes between LOLA and LROC. The browser fixtures reproduce the two models’ decisive 2 m and 5 m results. |

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

For browser checks, install Python Playwright and run `python tests/browser_smoke.py` with Chrome available. Set `NAVIGATOR_BASE_URL` to check the public site or a local preview. The walkthrough is in `public/walkthrough.mp4`. To regenerate the narrated walkthrough from a running preview, install the Python packages `playwright`, `imageio-ffmpeg`, and `kokoro-onnx`. Place `kokoro-v1.0.int8.onnx` and `voices-v1.0.bin` from the [Kokoro ONNX release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0) in `.data-cache/voice/`, then run `python scripts/record_demo.py`. The English narration is synthesized locally.
