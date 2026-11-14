"""Capture the landing-date demo and add synchronized English narration."""

import os
import subprocess
import wave
from pathlib import Path
from tempfile import TemporaryDirectory

import imageio_ffmpeg
import numpy as np
from kokoro_onnx import Kokoro
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("NAVIGATOR_BASE_URL", "http://127.0.0.1:4173/")
OUTPUT = ROOT / "public" / "walkthrough.mp4"
CACHE = ROOT / ".data-cache"
VOICE = CACHE / "voice"
FPS = 30

STAGE_STYLE = """
  #demo-stage {
    position: fixed; z-index: 100000; inset: 0; pointer-events: none;
    display: grid; grid-template-rows: auto 1fr 110px; gap: 16px;
    padding: 38px 80px 24px;
    background: #0b1420 linear-gradient(150deg, #172b3a, #0b1420 65%);
    color: #f2f7fc; font-family: "Segoe UI", sans-serif;
  }
  #demo-stage .demo-team { color: #a6e4d1; font-size: 22px; font-weight: 650; }
  #demo-stage h1 { margin: 5px 0 0; font: 700 55px/1.08 "Segoe UI", sans-serif; }
  #demo-stage .demo-subtitle { margin: 8px 0 0; color: #c2d2e3; font-size: 23px; }
  #demo-stage .demo-evidence {
    align-self: center; min-height: 0; display: grid; gap: 14px;
  }
  #demo-stage .demo-caption {
    align-self: end; justify-self: center; max-width: 1030px;
    padding: 12px 24px; border-radius: 12px; background: #050a11;
    border: 1px solid #627b95;
    color: #f7fbff; font: 600 30px/1.25 "Segoe UI", sans-serif; text-align: center;
  }
  #demo-stage .metric-grid {
    grid-template-columns: 1fr 1fr; margin: 0; gap: 22px;
  }
  #demo-stage .metric { padding: 25px 30px 30px; }
  #demo-stage .metric h3 { font-size: 30px; }
  #demo-stage .metric-scenario { font-size: 18px; }
  #demo-stage .metric-figures { gap: 15px; margin-top: 24px; }
  #demo-stage .metric-figures strong { font-size: 42px; }
  #demo-stage .metric-figures small { font-size: 24px; }
  #demo-stage .footprint-controls { grid-template-columns: 1fr 1fr auto; }
  #demo-stage .footprint-controls .field { font-size: 19px; }
  #demo-stage .footprint-controls select,
  #demo-stage .footprint-controls button,
  #demo-stage .footprint-result-actions button { font-size: 19px; min-height: 44px; }
  #demo-stage .footprint-summary { margin: 0; padding: 22px 25px; }
  #demo-stage .footprint-summary h3 { font-size: 40px; }
  #demo-stage .footprint-summary p { font-size: 19px; }
  #demo-stage .binding-line { margin: 0; }
  #demo-stage .binding-line strong,
  #demo-stage .binding-line span { font-size: 18px; }
  #demo-stage .footprint-evidence {
    grid-template-columns: 0.78fr 1.22fr; margin: 0; align-items: start;
  }
  #demo-stage .footprint-chart p,
  #demo-stage .footprint-detail dl,
  #demo-stage .footprint-detail .model-counts { font-size: 18px; }
  #demo-stage .footprint-detail h4 { font-size: 26px; }
  #demo-stage .footprint-detail .point-margin,
  #demo-stage .footprint-detail .field-error,
  #demo-stage .footprint-detail .visibility { font-size: 16px; }
  #demo-stage .footprint-compass { width: 220px; }
  #demo-stage .demo-evidence.show-search .footprint-compass { width: 180px; }
  #demo-stage .demo-evidence.show-search .footprint-point { width: 24px; height: 24px; }
  #demo-stage .demo-evidence.show-search .footprint-evidence { grid-template-columns: 1fr; justify-items: center; }
  #demo-stage .demo-evidence.show-search .footprint-detail { display: none; }
  #demo-stage .demo-evidence.show-search .footprint-chart p { display: none; }
  #demo-stage .footprint-evidence dd { font-size: 22px; }
  #demo-stage .footprint-detail { padding: 13px 18px; }
  #demo-stage .footprint-detail dl > div { padding: 6px 0; }
  #demo-stage .demo-evidence.show-failure { gap: 8px; }
"""

RENDER_STAGE = """
({title, subtitle, caption, selectors, layout}) => {
  const stage = document.createElement('section');
  stage.id = 'demo-stage';
  const header = document.createElement('header');
  const team = document.createElement('div');
  team.className = 'demo-team';
  team.textContent = 'AstroSpace · 2026 NASA Space Apps Challenge';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const context = document.createElement('p');
  context.className = 'demo-subtitle';
  context.textContent = subtitle;
  header.append(team, heading, context);

  const evidence = document.createElement('div');
  evidence.className = 'demo-evidence ' + layout;
  for (const selector of selectors) {
    const source = document.querySelector(selector);
    if (!source) throw new Error('Missing demo evidence: ' + selector);
    const copy = source.cloneNode(true);
    if (copy.matches('.metric-grid')) copy.querySelector('.metric-both').remove();
    const fields = source.querySelectorAll('select, input');
    copy.querySelectorAll('select, input').forEach((field, index) => {
      field.value = fields[index].value;
    });
    evidence.append(copy);
  }

  const subtitles = document.createElement('div');
  subtitles.className = 'demo-caption';
  subtitles.textContent = caption;
  stage.append(header, evidence, subtitles);
  document.body.append(stage);

  if (evidence.getBoundingClientRect().bottom > subtitles.getBoundingClientRect().top - 8) {
    throw new Error('Demo evidence overlaps the captions in ' + title);
  }
}
"""


def capture(directory):
    scenes = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        page.goto(URL, wait_until="domcontentloaded")
        page.get_by_role("heading", name="Sun + Earth overlap").wait_for()
        page.add_style_tag(content=STAGE_STYLE)
        page.evaluate("document.fonts.ready")

        def shot(seconds, title, subtitle, caption, voiceover, *selectors, layout=""):
            page.evaluate(RENDER_STAGE, {
                "title": title, "subtitle": subtitle, "caption": caption,
                "selectors": selectors, "layout": layout,
            })
            filename = f"scene-{len(scenes):02d}.png"
            page.screenshot(path=str(directory / filename), animations="disabled")
            page.locator("#demo-stage").evaluate("stage => stage.remove()")
            scenes.append((filename, seconds, voiceover))

        shot(
            7.8, "Three days later, Earth is out of view",
            "Lunar Landing Site Navigator · Connecting Ridge · August 27 vs. August 30, 2027",
            "A three-day delay at Connecting Ridge brought more sunlight. Earth stayed out of view for the entire first week.",
            "At Connecting Ridge, a three-day delay brought more sunlight. Earth dropped out of view for the entire first week.",
            ".metric-grid",
        )

        footprint = page.get_by_role("region", name="Landing footprint search")
        footprint.get_by_label("Solar panel height").select_option("5")
        footprint.get_by_label("Antenna height").select_option("5")
        footprint.get_by_role("button", name="Search from B").click()
        apply = footprint.get_by_role("button", name="Use earliest date for B")
        apply.wait_for()

        shot(
            6.0, "17 possible touchdown positions",
            "5 m solar panel and antenna · 100 m landing footprint",
            "We scan 29 dates at 17 landing positions on two terrain models.",
            "We scan twenty-nine dates at seventeen landing positions on two terrain models.",
            ".footprint-controls", ".footprint-evidence", layout="show-search",
        )

        footprint.get_by_label("Inspect landing date").select_option(
            label="12 Sept 2027 · 00:00 UTC · Outside limits"
        )
        shot(
            8.0, "September 12 misses the Sun limit",
            "LOLA passes all 17 positions. The LROC terrain model passes 15.",
            "September 12 looks viable on one model. The other shows a 94-hour Sun gap just 50 meters south.",
            "September twelfth looks viable on one model. The other shows a ninety-four-hour Sun gap just fifty meters south.",
            ".binding-line", ".footprint-evidence", layout="show-failure",
        )

        apply.click()
        footprint.get_by_role("button", name="Copy footprint comparison").wait_for()
        shot(
            8.0, "September 13 clears both models",
            "Earliest qualifying date · 00:00 UTC · Connecting Ridge",
            "September 13 passes on both models, two hours below the Sun-gap limit. Apply the date and share the comparison.",
            "September thirteenth passes on both models, two hours below the Sun gap limit. Apply the date and share the comparison.",
            ".footprint-summary", ".footprint-evidence", layout="show-search",
        )
        browser.close()
    return scenes


def narrate(scenes, target):
    engine = Kokoro(str(VOICE / "kokoro-v1.0.int8.onnx"), str(VOICE / "voices-v1.0.bin"))
    with wave.open(str(target), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(24000)
        for filename, seconds, line in scenes:
            samples, rate = engine.create(line, voice="af_heart", speed=1.07, lang="en-us")
            if rate != output.getframerate():
                raise ValueError(f"Unexpected narration sample rate: {rate}")
            duration = round(seconds * rate)
            start = round(0.18 * rate)
            end = start + len(samples)
            if end > duration - round(0.2 * rate):
                raise ValueError(f"{filename} narration runs too long: {len(samples) / rate:.2f} s")
            segment = np.zeros(duration, dtype="<i2")
            segment[start:end] = np.round(np.clip(samples, -1, 1) * 32767).astype("<i2")
            output.writeframes(segment.tobytes())
            print(f"{filename}: {len(samples) / rate:.2f} s narration in {seconds:g} s", flush=True)


def record():
    CACHE.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="navigator-demo-", dir=CACHE) as folder:
        directory = Path(folder)
        scenes = capture(directory)
        soundtrack = directory / "narration.wav"
        narrate(scenes, soundtrack)
        playlist = "".join(f"file '{name}'\noption framerate {FPS}\nduration {seconds}\n" for name, seconds, _ in scenes)
        (directory / "scenes.txt").write_text(playlist + f"file '{scenes[-1][0]}'\noption framerate {FPS}\n", encoding="ascii")
        seconds = sum(scene[1] for scene in scenes)
        result = directory / "walkthrough.mp4"
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", "scenes.txt", "-i", str(soundtrack),
            "-map", "0:v:0", "-map", "1:a:0", "-t", f"{seconds:.3f}", "-r", str(FPS),
            "-c:v", "libx264", "-crf", "17", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "112k", "-ar", "48000",
            "-af", "highpass=f=72,loudnorm=I=-16:LRA=7:TP=-1.5",
            "-movflags", "+faststart", str(result),
        ], cwd=directory, check=True)
        result.replace(OUTPUT)
        print(f"Recorded {seconds:.1f} seconds to {OUTPUT}")


if __name__ == "__main__":
    record()
