# Lunar Landing Site Navigator

This report records the initial LOLA-only pilot and review of build `49c232e`. The subsequent release evaluates both terrain models and changes the 5 m recommendation. [Terrain cross-check](Terrain%20cross-check.md) · [First-time usability study kit](Usability%20study%20kit.md)

## Evidence required for a strict 9.5

Review date: November 11, 2026. Reviewed live build: `49c232e`. The current product remains **8.4/10** on my equal-weight review of relevance, scientific validity, presentation, impact, and creativity. A stronger pitch helps presentation. Reaching 9.5 requires evidence that the proposed landing date holds across the conditions the mission actually needs and that new users can recover that date on their own. [Challenge statement](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) · [Published judging categories](https://www.spaceappschallenge.org/2026/local-events/ajmer/) · [Live build](https://sylesh29.github.io/lunar-landing-site-navigator/)

| Criterion | Current | Evidence that would earn the target |
|---|---:|---|
| Relevance | 9.5 | **9.7.** A user can recover a date at or after a slip and tell whether it meets limits across the sampled landing footprint. |
| Validity | 8.5 | **9.6.** Repeatable position and height sampling, numerical convergence, and a separately derived terrain comparison. Every result exposes the model and assumptions that govern it. |
| Presentation | 8.5 | **9.6.** The pitch shows one real failed date, one concrete alternative, and the boundary between the point estimate and the pilot. A new viewer can explain all three. |
| Impact | 8.0 | **9.4.** A moderated comparison measures unaided completion, time, and interpretation errors on the target task. |
| Creativity | 7.5 | **9.2.** Search ranks dates by performance across plausible landing conditions and identifies the binding constraint. The same result can be inspected and shared. |
| **Equal-weight mean** | **8.4** | **9.5 after the evidence is collected.** These are review targets. |

## The pilot changed the recommendation

The live app screens one point at Connecting Ridge, 89.468°S and 222.6°E, with both instruments 2 m above the terrain. At that point, August 30, 2027 fails the illustrative limits. September 13 is the only qualifying date in the app's 15-date search at or after August 30, and it shows 113.8 hours of continuous overlap. The pilot asks whether that choice holds when the location and hardware heights change. [NASA Lunar Surface Data Book, reference point C1](https://ntrs.nasa.gov/citations/20230007818) · [Live benchmark](https://github.com/Sylesh29/lunar-landing-site-navigator#connecting-ridge-benchmark)

I ran **4,590 deterministic model cases**. They cover August 27 and every UTC midnight from August 30 to September 27, 2027. The 17 positions are the reference point and eight bearings on each of the 50 m and 100 m rings. Panel and antenna heights each take values of 1, 2, and 5 m, giving nine height pairs per position. The 100 m radius is an illustrative test footprint inspired by published site research. It describes the pilot inputs. [Barker et al.](https://ntrs.nasa.gov/citations/20205009660)

| Landing at 00:00 UTC | Both heights 2 m | Both heights 5 m | All nine height pairs |
|---|---:|---:|---:|
| August 27 | 12 / 17 positions meet limits | 17 / 17 | 100 / 153 cases |
| August 30 | 0 / 17 | 0 / 17 | 0 / 153 |
| September 13 | 14 / 17 | 17 / 17 | 120 / 153 |

The September 13 result illustrates why the gap limit matters. At 2 m, all 17 positions have at least 44.4 hours of continuous overlap, yet three exceed the 72-hour limit on the longest gap in usable Sun. The longest Sun gap across those positions reaches 89.0 hours. A score based on overlap alone would miss that failure.

**No date from August 30 through September 27 meets all limits at all 17 sampled positions with both heights at 2 m.** With both heights at 5 m, September 12 is the first date that passes across the sample. Its minimum continuous overlap across those points is **103.2 hours**. This result quantifies a hardware trade-off under the pilot assumptions. A project would still need to assess whether that mounting height is feasible and confirm the terrain and mission inputs.

The ranking depends on what the planner values. At 2 m, September 14 comes closest to passing all 17 positions. Its worst case misses the Sun-gap limit by 13.5 hours, 100 m northwest of the reference point. At 5 m, September 22 has the largest worst-case margin across the 29 dates, 42.1 hours below the maximum Earth gap at the binding point. It is ten days later than the first date that passes.

**Method.** The pilot uses direct JPL SPICE Sun and Earth center vectors at one-minute cadence, a 0.5° skyline bearing grid, and linear refinement between successive samples. It uses the 5 m Connecting Ridge LOLA raster within 5 km and the 80 m regional raster out to 125 km, with bilinear elevation interpolation and spherical curvature. Each case evaluates the first seven days. It applies the live demo limits of at least four continuous hours of Sun and Earth overlap, at most 72 hours without usable Sun, and at most 120 hours without usable Earth view. Sun must clear both the terrain and the local horizontal. Earth center must clear the terrain. Both objects are modeled as point targets. The 2 m pilot result at the September 13 reference point rounds to the same 113.8 hours as the live demo. The counts describe the tested positions and height pairs. [5 m terrain](https://pgda.gsfc.nasa.gov/products/78) · [80 m regional terrain](https://pgda.gsfc.nasa.gov/products/90) · [JPL NAIF kernels](https://naif.jpl.nasa.gov/naif/data_generic.html)

Reproduce with `python research/strict-9-5/sensitivity_study.py` from the project root after installing the existing science requirements and placing the model inputs in `.data-cache`. The CSV includes the coordinates, heights, longest gaps, overlap, and result for every case. [Pilot script](sensitivity_study.py) · [Case-level CSV](Connecting%20Ridge%20sensitivity.csv)

## Build order and acceptance evidence

### 1. Search dates across the landing footprint

**Interface.** Add a footprint mode beside the current reference-point comparison. For a calibrated site, accept the landing ellipse semiaxes and bearing plus separate panel and antenna heights. Start with the documented Connecting Ridge example. Show the center result, the count of sampled points meeting every limit, the worst margin, and the point and constraint responsible for that margin. Keep the thresholds and time period shared between A and B.

**Calculation.** Generate local skylines over the footprint with the same datum and observer heights as the scenario. For every candidate date and sampled point, compute the minimum of these three margins in hours.

- Longest simultaneous window minus required continuous overlap.
- Maximum allowed Sun gap minus the longest modeled Sun gap.
- Maximum allowed Earth gap minus the longest modeled Earth gap.

Retain the minimum margin across the sampled points. Dates with all margins at or above zero meet the sampled limits. Show the earliest qualifying date and the date with the largest worst-case margin so the user can weigh schedule and operating margin. When there is no qualifying date, show the date with the smallest worst-case shortfall and its binding constraint, the search interval, and the result at the reference point. Display the number and spacing of sampled points beside the result. Require higher resolution input for 100 m footprints. The 160 m custom overview supports regional site screening.

**Acceptance.** At 2 m, the independent fixture reproduces 14/17 on September 13 and no full-footprint date in the pilot's 29 daily candidates. At 5 m, it reproduces September 12 as the first all-sampled-points pass and the 103.2 h minimum overlap. Add tests for a footprint crossing missing cells, an unsupported resolution, the earliest supported date, and a candidate on a limit boundary. Preserve current reference-point results and export both views with a versioned configuration.

**Numerical gate.** I tightened the time step from 60 to 15 seconds and skyline bearing spacing from 0.5° to 0.25° for August 27, August 30, September 12, and September 13 at both equal-height settings, covering **136 cases**. Every pass/fail result held. Among 147 crossings from series with matching rise and set counts, the median shift was 2.4 seconds and the largest was **11.4 minutes**. Two Sun series had different crossing counts. The largest change in the worst margin was **0.20 hours**. The pilot supports the pass/fail decisions at those checked settings and falls short of the proposed five-minute target for individual crossing times. [Reproduce the convergence check](check_convergence.py)

Vary time cadence and bearing spacing separately to isolate the source of the crossing differences. Refine the skyline and sample clearance around small margins or rapid azimuth changes, then compare against another refinement. Flag unstable crossings and dates with a classification change in the interface and exports. Densify the position sample and report whether it changes the classification of the demo dates. [Barker et al. discussion of terrain error and height](https://ntrs.nasa.gov/citations/20205009660)

### 2. Separate solver agreement from terrain agreement

The existing Horizons comparison covers 36 sky positions with a maximum angular difference of 0.005923°. The 8.3-second ridge benchmark compares two crossing calculations on the same skyline. For the next check, use the separately derived LROC narrow-angle image shape-from-shading product for Connecting Ridge. NASA's archive identifies the exact region package as `A3CLR22_6_Connecting_Ridge.zip`, about 2.2 GB including ancillary products. Extract the elevation, image coverage, and difference rasters for the relevant area. Confirm the C1 footprint and ray paths lie within valid image-derived coverage. Both products have a LOLA connection because the image-derived model uses a LOLA prior. Describe the exercise as a comparison between terrain products. [NASA PGDA product and method](https://pgda.gsfc.nasa.gov/products/104) · [Region archive](https://zenodo.org/records/17954508) · [Study](https://doi.org/10.3847/PSJ/ae5b70)

Run the same representative positions and dates on the two surfaces with documented vertical datums and common farther terrain. Compare the horizon angle at each crossing, the start and end of usable windows, the longest gap, and the qualification result. Publish all flips, including cases that undermine the preferred landing date. If either input lacks valid local coverage, report the coverage gap for that point. Seek a review of the datum, the clipping rules, and one difficult case from someone with lunar geospatial or mission analysis experience.

**Claim boundary.** Continue to label the app as geometric screening while it models the Earth center. A station-level extension needs an Earth orientation kernel with coverage through the analysis date, named antenna locations, lunar terrain clearance toward each station, and each station's own horizon and pointing masks. Use JPL's coverage handbook and a fixed-observer SPICE calculation, then cross-check a named station at matched UTC samples. Actual contacts add schedule and link-budget inputs. Solar-energy estimates require the visible solar disk, eclipses, panel attitude and electrical inputs. Keep these extensions after the footprint and usability gates unless a judge-facing claim depends on them. [JPL DSN Handbook, Module 301 and horizon masks](https://deepspace.jpl.nasa.gov/dsndocs/810-005/downloads/) · [NAIF fixed observer geometry](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/spkcpo_c.html) · [NASA lunar surface propagation](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/scan/lunar-surface-propagation/)

### 3. Measure unaided recovery and handoff

Recruit eight first-time participants across planning or engineering and education or general users. Use an isolated browser, give the prompt aloud once, and avoid coaching until the attempt ends. These are proposed small-sample release targets. Keep participant identifiers anonymous. [NIST usability measures](https://www.nist.gov/programs-projects/usability-testing)

**Prompt.** “Scenario B's landing has moved to August 30. An earlier landing is unavailable. At the site and UTC time shown, find the first qualifying date within 14 days. Tell me which limit B misses and send me a link that opens the date you chose.” Start from the live default. Score completion only if the participant selects September 13, identifies the missed overlap or Earth-gap limit, and produces a working link with the selected inputs. Ask what the Earth-visibility result means and whether it represents a confirmed radio contact. For a later footprint release, use a second prompt with the 2 m case, expecting the participant to report that the sampled search found no all-points date.

**Measurement.** Start the timer when the prompt ends. Stop when the link is copied or at 180 seconds. Record participant role, device, completion, elapsed time, incorrect dates, help, geometry interpretation, and one quoted observation with consent. Target at least **7/8 correct without help**, a **median of 60 seconds or less** among successful attempts, and **7/8 correct interpretations** of the Earth proxy. Report failures and timeout counts with the median.

**Comparison.** Use a manual worksheet with the same underlying Sun and Earth interval data and limits to isolate the difference in workflow. Prepare a second date case of comparable difficulty with a known answer. Counterbalance both task and tool order so prior exposure to the date cannot explain the result. Compare paired completion times and errors. A proposed target is at least a **2× median paired speed improvement** without more decision errors. If the worksheet and task are materially different, report the individual task results and avoid a speed claim. No user sessions are recorded in this research package.

## Positioning and pitch

[QuickMap](https://www.actgate.com/examples/lroc-quickmap) and [Moon Trek](https://trek.nasa.gov/moon/) already provide extensive lunar terrain and analysis. Public challenge projects such as [PolarWindow](https://github.com/MdAhbab/PolarWindow) and [CLPS Lunar Mission Browser](https://github.com/EmanuelAbasto/CLPS-Lunar-Mission-Browser) present terrain, Sun, and Earth in comparable interfaces. The claim to test is that this navigator makes a date change traceable to the constraint and the landing conditions that drive it. The comparison describes public materials. The user study is the way to measure a workflow advantage.

Open the presentation with the three-day slip, use the live search to show September 13, then present the pilot result that makes the choice conditional on the landing footprint and equipment height. Keep the score targets in this report. The seven-slide format follows a published 2026 local-event example. The project was developed before the main event. Confirm the chosen event's format and pre-start eligibility before submitting. [Example seven-slide format](https://www.spaceappschallenge.org/2026/local-events/stalowa-wola/?tab=details) · [2026 schedule](https://www.spaceappschallenge.org/2026/) · [Local event's pre-start guidance](https://www.spaceappschallenge.org/2026/local-events/santiago-dominican-republic/)
