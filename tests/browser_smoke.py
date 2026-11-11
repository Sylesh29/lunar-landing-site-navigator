"""Exercise the same UI locally or on GitHub Pages in a fresh Chrome context."""

import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

URL = os.environ.get("NAVIGATOR_BASE_URL", "http://127.0.0.1:4173/")
ORIGIN = urlsplit(URL).netloc


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel="chrome")
    desktop = browser.new_context(viewport={"width": 1440, "height": 1000}, timezone_id="America/New_York")
    errors = []

    def local_requests_only(route):
        if urlsplit(route.request.url).netloc == ORIGIN:
            route.continue_()
        else:
            route.abort()

    desktop.route("**/*", local_requests_only)
    page = desktop.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("response", lambda response: errors.append(f"{response.status}: {response.url}") if response.status >= 400 else None)
    response = page.goto(URL, wait_until="networkidle")
    assert response and response.ok
    expect(page.get_by_role("heading", name="Sun + Earth overlap")).to_be_visible()
    expect(page.locator(".model-banner")).to_contain_text("LOLA terrain")
    overlap = page.locator(".metric-both .metric-delta strong")
    seeded_delta = overlap.inner_text()
    assert seeded_delta.startswith("+")
    image_path = os.environ.get("NAVIGATOR_SCREENSHOTS")
    if image_path:
        page.screenshot(path=str(Path(image_path) / "desktop.png"), full_page=True)

    page.get_by_role("button", name="Copy A to B").click()
    expect(overlap).to_have_text("0.0h")
    page.get_by_role("button", name="Delay B by 72 hours").click()
    expect(overlap).to_have_text(seeded_delta)
    b = page.get_by_role("group", name="Scenario B", exact=True)
    b.get_by_label("Landing site").select_option("ridge")
    expect(page.get_by_role("region", name="Scenario B skyline")).to_contain_text("Connecting Ridge")
    b.get_by_label("Landing site").select_option("custom")
    expect(page.locator(".model-banner")).to_contain_text("Smooth sphere")
    b.get_by_label("Latitude (°N)").fill("92")
    expect(page.get_by_text("Enter valid sites and 2027 UTC landing times", exact=False)).to_be_visible()
    b.get_by_label("Latitude (°N)").fill("-90")
    b.get_by_label("Longitude (°E)").fill("-137.4")
    expect(b.get_by_text("90°S, 222.6°E", exact=True)).to_be_visible()
    page.get_by_role("button", name="Copy A to B").click()
    expect(page.locator(".model-banner")).to_contain_text("LOLA terrain")
    b.get_by_label("Landing date").fill("2027-12-31")
    b.get_by_label("Time (UTC)").fill("23:59")
    page.get_by_role("button", name="30 days").click()
    page.get_by_role("button", name="Delay B by 72 hours").click()
    expect(page.get_by_text("A 72-hour delay would move Scenario B outside 2027.")).to_be_visible()
    slider = page.get_by_role("slider", name="Time cursor")
    slider.focus()
    slider.press("ArrowRight")
    expect(slider).to_have_attribute("aria-valuetext", "T plus 1m")
    slider.press("End")
    expect(slider).to_have_attribute("aria-valuetext", "T plus 30d")
    expect(page.locator(".timeline-date").nth(1)).to_contain_text("30 Jan 2028 · 23:59 UTC")
    page.get_by_text("Window start and end times (UTC)", exact=True).click()
    expect(page.locator(".interval-group").nth(1)).to_be_visible()
    assert not errors, errors

    mobile = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
    mobile.route("**/*", local_requests_only)
    page = mobile.new_page()
    page.goto(URL, wait_until="networkidle")
    expect(page.get_by_role("heading", name="Sun + Earth overlap")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
    a_top = page.locator("fieldset.scenario-a").bounding_box()["y"]
    b_top = page.locator("fieldset.scenario-b").bounding_box()["y"]
    assert b_top > a_top
    page.get_by_role("button", name="Copy A to B").click()
    page.get_by_role("button", name="Delay B by 72 hours").click()
    expect(page.locator(".metric-both .metric-delta strong")).to_have_text(seeded_delta)
    if image_path:
        page.screenshot(path=str(Path(image_path) / "mobile.png"), full_page=True)
    print(f"Desktop, 390px mobile, keyboard cursor, and date limits passed with third-party requests blocked at {URL}")
    browser.close()
