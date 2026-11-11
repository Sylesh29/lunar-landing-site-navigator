"""Capture and encode the 30-second captioned walkthrough from the running app."""

import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("NAVIGATOR_BASE_URL", "http://127.0.0.1:4173/")
OUTPUT = ROOT / "public" / "walkthrough.mp4"


def capture(directory):
    scenes = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1440, "height": 930}, device_scale_factor=1)
        page.goto(URL, wait_until="networkidle")
        page.get_by_role("heading", name="Sun + Earth overlap").wait_for()
        page.add_style_tag(content="""
          #walkthrough-caption {
            position: fixed; z-index: 99; left: 50%; bottom: 22px; transform: translateX(-50%);
            width: max-content; max-width: calc(100% - 100px); padding: 13px 24px;
            pointer-events: none;
            color: white; background: #0b1020; border: 1px solid #9badff; border-radius: 9px;
            font: 600 24px/1.35 "Segoe UI", sans-serif; text-align: center;
          }
        """)

        def shot(seconds, caption):
            page.evaluate("""caption => {
                let element = document.getElementById('walkthrough-caption');
                if (!element) {
                  element = document.createElement('div');
                  element.id = 'walkthrough-caption';
                  document.body.append(element);
                }
                element.textContent = caption;
            }""", caption)
            filename = f"scene-{len(scenes)}.png"
            page.screenshot(path=str(directory / filename), animations="disabled")
            scenes.append((filename, seconds))

        page.get_by_role("button", name="Copy A to B").click()
        page.evaluate("window.scrollTo(0, 0)")
        shot(6, "Start at Connecting Ridge on August 27, 2027, at 00:00 UTC.")
        page.get_by_role("button", name="Delay B by 72 hours").focus()
        shot(5, "Keep the site fixed. Move the second landing to August 30.")
        page.get_by_role("button", name="Delay B by 72 hours").click()
        sun_gain = page.locator(".metric-sun .metric-delta strong").inner_text().strip("+h")
        earth_before = page.locator(".metric-earth .metric-figures strong").first.inner_text().removesuffix("h")
        page.evaluate("window.scrollTo(0, document.querySelector('.results-section').offsetTop - 23)")
        shot(7, f"The delay adds {sun_gain} hours of sunlight. Earth visibility falls from {earth_before} hours to zero.")
        page.locator(".timeline-group").first.locator(".window-both").first.click()
        page.evaluate("window.scrollTo(0, document.querySelector('.timeline').offsetTop - 25)")
        overlap_before = page.locator(".metric-both .metric-figures strong").first.inner_text().removesuffix("h")
        shot(7, f"The August 27 landing has {overlap_before} hours with both sunlight and Earth in view.")
        page.locator("#methods summary").click()
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        shot(5, "The ridge skyline uses NASA LOLA terrain at 5 m near the site. Sky positions come from JPL SPICE.")
        browser.close()
    return scenes


with TemporaryDirectory(prefix="navigator-demo-", dir=ROOT / ".data-cache") as folder:
    directory = Path(folder)
    scenes = capture(directory)
    playlist = "".join(f"file '{name}'\nduration {seconds}\n" for name, seconds in scenes)
    (directory / "scenes.txt").write_text(playlist + f"file '{scenes[-1][0]}'\n", encoding="ascii")
    subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "1", "-i", "scenes.txt", "-t", "30", "-r", "30",
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:0x0b1020",
        "-c:v", "libx264", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUTPUT),
    ], cwd=directory, check=True)
    print(f"Recorded {sum(seconds for _, seconds in scenes)} seconds to {OUTPUT}")
