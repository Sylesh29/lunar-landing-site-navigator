# Simulated first-use review

Three agents used isolated Chrome sessions and the public interface on November 14, 2026. Each started with the task from the usability kit and received no hints about the workflow or the answer. They represented a mobile novice, a desktop planner and a keyboard-only visitor. These runs provide simulated usability evidence. The separate first-time human study has no recorded sessions.

| Simulated participant | Setup | Recovered and shared the date | Timing observed |
|---|---|---|---|
| Mobile novice | 390 × 844 touch viewport | Yes. Reopened the copied link. | 29.41 s from navigation to clipboard verification, including tool interaction |
| Desktop planner | 1440 × 1000 desktop viewport | Yes. Reopened the copied link in a fresh context. | 38.25 s from browser launch to clipboard verification |
| Keyboard-only visitor | Chrome, clipboard writes denied | Yes. Retrieved the focused fallback URL and reopened it. | 12.87 s for a scripted replay including browser launch and link reopen |

All three found September 13, 2027 at 00:00 UTC, set Scenario B, and verified 17/17 passing positions on each terrain with both heights at 5 m. The start and stop points differ across timings, so the runs have no pooled median. [Human study procedure](Usability%20study%20kit.md)

## Changes prompted by the review

- New results open the earliest qualifying date, or the smallest shortfall when no date qualifies. The inspector labels margins calculated across both terrains. The result shows the original date used to start the search after Scenario B changes.
- Search keeps keyboard focus during calculation. When a browser denies clipboard access, the app focuses a single fallback field and selects the full link. Both copy controls open the footprint section when the link includes an active footprint search.
- The footprint section shows the mission limits in use and links to their editor. Its heading and the fixed-height point comparison identify the two calculation scopes. Sites without a footprint model link to their point search.
- The captioned walkthrough now shows the September 12 LROC failure and September 13 recovery on the same workflow the reviewers tested.
