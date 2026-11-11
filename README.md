# Lunar Landing Site Navigator

Compare the geometric sunlight and direct-to-Earth visibility of two hypothetical lunar landings. Choose IM-2 Athena, the Shackleton–de Gerlache Connecting Ridge reference point, or custom lunar coordinates. Use **Copy A to B** and **Delay B by 72 hours** to isolate a schedule change, then move the time cursor to see the Sun and Earth relative to both skylines.

## Try the default comparison

| Scenario | Site | Landing time | First-week Sun–Earth overlap |
|---|---|---|---:|
| A | IM-2 Athena | February 9, 2027 at 00:00 UTC | 74.9 h |
| B | IM-2 Athena | February 12, 2027 at 00:00 UTC | 146.9 h |

The 72-hour delay adds **72.0 hours** of modeled first-week overlap at this point. Earth clears the modeled horizon for all 168 hours in both scenarios. The later landing spends more of its first week in sunlight. Open the window details for absolute UTC intervals.

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
- **Terrain.** NASA LOLA’s 80 m south-pole raster supplies 360 precomputed horizon angles per preset. Rays sample the surface every 40 m out to 125 km from a 2 m observer. The header relief is shaded from the same elevation raster. Regional terrain can smooth features such as Athena’s 20 m crater. [NASA LOLA](https://pgda.gsfc.nasa.gov/products/90) · [LROC Athena landing point](https://www.lroc.im-ldi.com/featured_sites/im2/flip-book) · [NASA Connecting Ridge reference](https://ntrs.nasa.gov/api/citations/20230007818/downloads/ACD-50044%20Lunar%20Surface%20Data%20Book%20Rev%20A.pdf)
- **Shared fallback.** If either scenario has no terrain profile, both use a 1,737.4 km smooth sphere with a 2 m observer and geometric horizon dip.
- **Window meaning.** Each target counts as visible when its disk center clears the model horizon. The five-minute scan refines bracketed transitions to one minute and can miss short grazing windows. Geometry estimates lighting and Earth visibility. Eclipses, electrical power, ground-station access, and link budgets require separate models.

## Validation

| Check | Result |
|---|---|
| JPL Horizons airless apparent sky positions, both bodies at three locations and four times | 24 checked, maximum angular separation **0.005852°** |
| Hourly interpolation against direct SPICE midpoint calculations | 24 checked, maximum angular separation **0.000127°** |
| Terrain | Synthetic sphere and ridge checks passed. Both real profiles contain 360 bearings with full ray coverage. Sampled terrain heights were 5,321.50 m at Athena and 1,942.83 m at Connecting Ridge. |
| Geometry and windows | Tests cover bounds, projection, horizon wrap, transition refinement, endpoint clipping, and overlap. |

The [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) reference and direct SPICE midpoint samples are stored in `data/`. Angular thresholds apply to sky positions. Terrain resolution and visibility sampling also affect the calculated window times.

## Rebuild the science assets

Create a Python 3.12 virtual environment and install `requirements-science.txt`. Download the four kernel files and the DEM listed in `public/data/model.json` to `.data-cache/`, using their exact filenames. The checked-in assets are sufficient for a normal build.

```sh
python scripts/generate_data.py
python scripts/fetch_horizons.py
node --experimental-strip-types scripts/seed-demo.ts
npm run verify:science
```

`scripts/generate_data.py --smooth-sphere` generates the labeled smooth-sphere fallback if terrain is unavailable. Install Pillow to regenerate the header relief with `scripts/render_relief.py`.

For browser checks, install Python Playwright and run `python tests/browser_smoke.py` with Chrome available. Set `NAVIGATOR_BASE_URL` to check the public site or a local preview. The walkthrough is in `public/walkthrough.mp4`. Regenerate it from a running preview with `scripts/record_demo.py` and the `imageio-ffmpeg` Python package.
