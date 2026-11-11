# Lunar Landing Site Navigator research

Reviewed November 11, 2026. This review covers the challenge brief, published tool capabilities, public challenge projects, and primary technical sources. Tool comparisons describe public documentation and demos.

## Starting score

The version that opened on the validated Connecting Ridge trade-off scored **7.4/10** on an equal-weight assessment. It scored 9 for relevance, 8 for scientific validity, 8 for presentation, 6 for impact, and 6 for creativity. The strongest evidence was the end-to-end ridge case and the published terrain benchmark. The largest gaps were terrain coverage outside the two presets and the number of manual trials required to find a viable schedule adjustment. [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) · [Space Apps judging criteria](https://www.spaceappschallenge.org/2026/local-events/ajmer/)

## Where existing tools set the bar

| Reference | What it offers | Implication for this project |
|---|---|---|
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html) | Topocentric azimuth and elevation for user-defined lunar sites in the Mean Earth frame. | Use it as an external check on sky positions. Make the terrain skyline and elapsed-time comparison directly visible. |
| [LROC QuickMap](https://www.actgate.com/examples/lroc-quickmap) | Lunar data layers, 3D terrain, illumination analysis, and mission context. | Use a simple terrain map to select A or B and keep the comparison on the same screen. |
| [NASA Moon Trek](https://trek.nasa.gov/moon/) | Global and polar maps, elevation profiles, lighting and line-of-sight tools, and share links. Some advanced analysis requires registration. | Keep the compare, search, and share flow available in a signed-out browser. |
| [CLPS Lunar Mission Browser](https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser), [PolarWindow](https://github.com/MdAhbab/PolarWindow), and [SYNEXIS](https://synexiss.site/explorer) | Public projects already demonstrate several combinations of lunar maps, terrain, Sun and Earth timelines, and scenario comparison. | Demonstrate the complete scheduling task. Set an explicit limit, see why the delayed plan misses it, find a nearby date, and hand off the exact comparison. |

## Evidence behind the changes

**Plan around the longest gap.** Two sites with equal total light can have very different battery and thermal demands. NASA authors report longest continuous illumination and shadow, and show that even a few metres of observer height can materially change the estimate. A joint interval also matters if one operation needs sunlight and Earth visibility at the same time. The navigator measures the longest gap in usable Sun, the longest gap in usable Earth view, and the longest simultaneous window over the selected mission period. [Barker et al.](https://ntrs.nasa.gov/citations/20205009660) · [Lunar south-pole site criteria study](https://www.hou.usra.edu/meetings/lpsc2021/pdf/2558.pdf)

**Preserve terrain when a site moves.** The NASA LOLA south-pole data show that illumination changes sharply across nearby ridges and crater floors. The app computes an on-demand skyline for points from 84.5°S to the pole using a 160 m overview of NASA's regional raster. The fixed Connecting Ridge and Athena presets retain their finer models. Each comparison identifies the grid used, and the smooth-sphere fallback uses a common model for both scenarios when terrain is unavailable. [NASA regional LOLA data](https://pgda.gsfc.nasa.gov/products/90) · [NASA high-resolution terrain](https://pgda.gsfc.nasa.gov/products/78)

**Use a solar metric with a defined panel orientation.** For an ideal horizontal panel the direct-beam incidence factor is the sine of the Sun's elevation above the local horizontal, clipped to zero. The app integrates that factor over modeled Sun-center visibility to report equivalent full-sun hours. That makes a week of low grazing Sun distinguishable from a week of higher Sun. The method assumes a fixed horizontal surface, an unobscured solar disk except for the center-based terrain screen, and normalized incident irradiance. Actual energy depends on panel orientation, efficiency, eclipses, and hardware. [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/citations/20230007818) · [NASA lunar south-pole environment](https://www.nasa.gov/reference/moonbase-environment/)

**Keep geometric Earth visibility tied to the decision it supports.** The user can require additional angular clearance of the Earth's center above the modeled skyline. A real contact prediction needs a specific ground antenna or relay, its availability and pointing constraints, and a radio link model. NASA identifies terrain multipath and low elevation as additional communication challenges at the lunar south pole. [NASA Lunar Surface Propagation](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/scan/lunar-surface-propagation/) · [NASA lunar relay program](https://www.nasa.gov/goddard/esc/lcrns/)

**Turn a delay into a search.** The app samples daily landing dates within 14 days of B at the same UTC time, with an option to start the search at B when earlier dates are unavailable. It applies the same post-landing period and user limits, sorts qualifying options by distance from the requested date, and applies a candidate directly to B. The comparison link includes both scenarios and the limits. The CSV contains geometric and threshold-filtered intervals in UTC.

## Evidence still needed for operational use

- Run a first-time viewer study. Give participants a delayed scenario, ask them to identify which limit fails, recover a date, and share the comparison. Record task success, elapsed time, and any confusion about modeled visibility versus a confirmed contact.
- Model height and landing-position sensitivity with finer terrain and report the range across the landing ellipse. The custom map's 160 m overview supports regional screening. A point close to a ridge, crater edge, or mission limit needs more detailed terrain and an estimate of positional uncertainty. [Barker et al.](https://ntrs.nasa.gov/citations/20205009660)
- To estimate solar energy or radio contact, add mission inputs for panel attitude and eclipse timing, and antenna locations, Earth orientation, terrain masks, link margin, and scheduling. The current operating limits apply to geometric screening. [NASA Lunar Surface Data Book](https://ntrs.nasa.gov/citations/20230007818) · [NASA communications architecture](https://www.nasa.gov/communicating-with-missions/scan-enabling-moon-to-mars/)
