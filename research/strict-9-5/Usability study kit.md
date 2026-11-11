# First-time usability study

## Setup

Recruit eight people who have never used the navigator. Aim for four phone sessions and four desktop sessions. Include participants with and without an engineering background. Use an anonymous ID, a fresh browser context, the same published build and the unmodified starting URL for each session. Ask for consent to observe and time the task. Keep optional recordings and identifying information outside the results. [Live navigator](https://sylesh29.github.io/lunar-landing-site-navigator/) · [NIST usability testing](https://www.nist.gov/programs-projects/usability-testing)

## Read verbatim

> The Connecting Ridge landing slipped to August 30, 2027. Both the solar panel and antenna are 5 metres above the surface. Use the first-week mission limits already shown. Find the earliest date on or after the slip that meets every limit across the sampled landing footprint in both terrain models. Set that date for Scenario B and send me a link to your comparison.

Start timing after reading the prompt. Allow the participant to use the interface, including its labels and help. Give no UI directions during the timed attempt. Stop when they hand over a copied link or at 180 seconds. Ask them to think aloud only after timing ends to keep timing comparable. If they request help, record it and score the attempt as assisted. They can finish after the timer for diagnostic feedback.

## Moderator answer key

- Correct B is **September 13, 2027, 00:00 UTC** at the Connecting Ridge reference point. The link must open with a seven-day period, both heights 5 m, the August 30 search anchor, default mission limits and the chosen B date. Reopen the link in a fresh browser and verify the state and the 17/17 result for each terrain.
- Success means the participant found and applied the correct date and handed over a working link unaided. A timeout, incorrect link, wrong date or moderator assistance is a failure.
- Enter elapsed seconds for every attempt, including a 180-second timeout. Count unaided successes out of all eight. Compute the median elapsed time among successful attempts. The release target is **at least 7/8 successful and a median of 60 seconds or less**. Report failures and median together.
- After timing, ask “What happens if both instruments are 2 m high?” and “What does Earth visibility tell you about a radio contact?” Record the answers for diagnosis. At 2 m the search finds no all-points date in the displayed range. Earth-center clearance indicates geometric line of sight and does not guarantee a station contact.

Use the blank [session log](usability-sessions.csv). The moderator supplies the timings and observations after running the study.
