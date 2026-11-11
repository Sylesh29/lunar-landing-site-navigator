"""Exercise the same UI locally or on GitHub Pages in a fresh Chrome context."""

import os
from pathlib import Path
from time import perf_counter
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
    expect(page.locator(".model-banner")).to_contain_text("5 m local / 80 m regional for both scenarios")
    overlap = page.locator(".metric-both .metric-delta strong")
    seeded_delta = overlap.inner_text()
    assert seeded_delta.startswith("−")
    image_path = os.environ.get("NAVIGATOR_SCREENSHOTS")
    if image_path:
        page.screenshot(path=str(Path(image_path) / "desktop.png"), full_page=True)
        page.screenshot(path=str(Path(image_path) / "desktop-fold.png"))

    page.get_by_role("button", name="Copy A to B").click()
    expect(overlap).to_have_text("0.0h")
    page.get_by_role("button", name="Delay B by 72 hours").click()
    expect(overlap).to_have_text(seeded_delta)
    b = page.get_by_role("group", name="Scenario B", exact=True)
    page.get_by_text("Mission limits and date search", exact=True).click()
    expect(page.locator(".assessment").nth(0)).to_contain_text("Meets limits")
    expect(page.locator(".assessment").nth(1)).to_contain_text("Outside limits")
    page.get_by_role("button", name="Find nearby dates for B").click()
    expect(page.locator(".search-results li").first).to_contain_text("27 Aug 2027")
    page.get_by_label("Search range").select_option("onward")
    page.get_by_role("button", name="Find nearby dates for B").click()
    expect(page.locator(".search-results li").first).to_contain_text("13 Sept 2027")
    if image_path:
        page.locator(".extra-panel").filter(has_text="Mission limits and date search").screenshot(
            path=str(Path(image_path) / "planning.png")
        )
    page.locator(".search-results li").first.get_by_role("button", name="Use", exact=False).click()
    expect(b.get_by_label("Landing date")).to_have_value("2027-09-13")
    expect(page.locator(".assessment").nth(1)).to_contain_text("Meets limits")
    b.get_by_label("Landing date").fill("2027-08-30")
    page.get_by_role("button", name="With mission limits").click()
    expect(page.get_by_role("button", name="With mission limits")).to_have_attribute("aria-pressed", "true")
    page.get_by_role("button", name="Geometry", exact=True).click()
    with page.expect_download() as saved:
        page.get_by_role("button", name="Download windows CSV").click()
    csv = Path(saved.value.path()).read_text(encoding="utf-8")
    assert '"window_start_utc"' in csv and '"operating"' in csv and '"geometric"' in csv
    assert '"operating","earth","","","0"' in csv
    desktop.grant_permissions(["clipboard-read", "clipboard-write"])
    page.get_by_role("button", name="Copy comparison link").click()
    expect(page.get_by_text("Comparison link copied.", exact=True)).to_be_visible()
    shared_url = page.evaluate("navigator.clipboard.readText()")
    shared = desktop.new_page()
    shared.goto(shared_url, wait_until="networkidle")
    expect(shared.get_by_role("group", name="Scenario B", exact=True).get_by_label("Landing date")).to_have_value("2027-08-30")
    shared.close()
    footprint = page.get_by_role("region", name="Landing footprint search")
    page.get_by_role("link", name="Find a landing date").click()
    footprint.get_by_role("button", name="Search from B").press("Enter")
    expect(footprint.get_by_role("heading", name="No date passes at every sampled position")).to_be_visible(timeout=25000)
    footprint.get_by_label("Solar panel height").select_option("5")
    footprint.get_by_label("Antenna height").select_option("5")
    expect(footprint.get_by_role("heading", name="Earliest · 13 Sept 2027 · 00:00 UTC")).to_be_visible(timeout=25000)
    footprint.get_by_label("Inspect landing date").select_option(label="12 Sept 2027 · 00:00 UTC · Outside limits")
    expect(footprint.locator(".binding-line")).to_contain_text("Sun gap · 50 m S · LROC")
    expect(footprint.locator(".model-counts")).to_contain_text("LOLA 17/17")
    expect(footprint.locator(".model-counts")).to_contain_text("LROC 15/17")
    if image_path:
        footprint.screenshot(path=str(Path(image_path) / "footprint.png"))
        footprint.locator(".footprint-evidence").screenshot(path=str(Path(image_path) / "footprint-evidence.png"))
    with page.expect_download() as saved:
        footprint.get_by_role("button", name="Download footprint CSV").click()
    footprint_csv = Path(saved.value.path()).read_text(encoding="utf-8")
    assert len(footprint_csv.splitlines()) == 1 + 29 * 17 * 2
    assert "LROC shape-from-shading" in footprint_csv
    footprint.get_by_role("button", name="Use earliest date for B").press("Enter")
    expect(b.get_by_label("Landing date")).to_have_value("2027-09-13")
    footprint.get_by_role("button", name="Copy footprint comparison").press("Enter")
    expect(footprint.get_by_text("Comparison link copied.", exact=True)).to_be_visible()
    footprint_url = page.evaluate("navigator.clipboard.readText()")
    shared = desktop.new_page()
    shared.goto(footprint_url, wait_until="domcontentloaded")
    expect(shared.get_by_label("Solar panel height")).to_have_value("5")
    expect(shared.get_by_label("Antenna height")).to_have_value("5")
    expect(shared.get_by_label("Inspect landing date")).to_have_value("1820793600000", timeout=25000)
    expect(shared.locator(".model-counts")).to_contain_text("LROC 17/17")
    shared.close()
    b.get_by_label("Landing site").select_option("athena")
    expect(footprint.get_by_text("Select the Connecting Ridge reference point", exact=False)).to_be_visible()
    expect(page.get_by_role("region", name="Scenario B skyline")).to_contain_text("IM-2 Athena")
    expect(page.locator(".model-banner")).to_contain_text("A uses 5 m local / 80 m regional · B uses 80 m regional")
    b.get_by_label("Landing site").select_option("custom")
    expect(page.locator(".model-banner")).to_contain_text("5 m local / 80 m regional for both scenarios")
    b.get_by_label("Latitude (°N)").fill("92")
    expect(page.get_by_text("Enter valid sites and UTC landing times", exact=False)).to_be_visible()
    b.get_by_label("Latitude (°N)").fill("-70")
    expect(page.locator(".model-banner")).to_contain_text("Smooth sphere")
    b.get_by_label("Longitude (°E)").fill("-137.4")
    expect(b.get_by_text("70°S, 222.6°E", exact=True)).to_be_visible()
    page.get_by_text("Pick a site on the south pole map", exact=True).click()
    page.locator(".polar-map").click(position={"x": 180, "y": 130})
    expect(page.locator(".model-banner")).to_contain_text("B uses 160 m regional", timeout=20000)
    expect(b.get_by_label("Landing site")).to_have_value("custom")
    if image_path:
        page.locator(".extra-panel").filter(has_text="Pick a site on the south pole map").screenshot(
            path=str(Path(image_path) / "polar-map-ui.png")
        )
    page.get_by_role("button", name="Copy A to B").click()
    expect(page.locator(".model-banner")).to_contain_text("LOLA terrain")
    b.get_by_label("Landing date").fill("2030-12-31")
    b.get_by_label("Time (UTC)").fill("23:59")
    page.get_by_role("button", name="30 days").click()
    page.get_by_role("button", name="Delay B by 72 hours").click()
    expect(page.get_by_text("A 72-hour delay would move Scenario B past the supported range.")).to_be_visible()
    slider = page.get_by_role("slider", name="Time cursor")
    slider.focus()
    slider.press("ArrowRight")
    expect(slider).to_have_attribute("aria-valuetext", "T plus 1m")
    slider.press("End")
    expect(slider).to_have_attribute("aria-valuetext", "T plus 30d")
    expect(page.locator(".timeline-date").nth(1)).to_contain_text("30 Jan 2031 · 23:59 UTC")
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
    page.get_by_role("link", name="Find a landing date").click()
    footprint = page.get_by_role("region", name="Landing footprint search")
    footprint.get_by_label("Solar panel height").select_option("5")
    footprint.get_by_label("Antenna height").select_option("5")
    started = perf_counter()
    footprint.get_by_role("button", name="Search from B").click()
    expect(footprint.get_by_role("heading", name="Earliest · 13 Sept 2027 · 00:00 UTC")).to_be_visible(timeout=25000)
    search_seconds = perf_counter() - started
    assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
    if image_path:
        page.screenshot(path=str(Path(image_path) / "mobile.png"), full_page=True)
    print(f"Desktop, 390px mobile, footprint and point searches, custom terrain, CSV, share links, keyboard, and date limits passed at {URL}")
    print(f"Automated mobile-width footprint calculation and rendering took {search_seconds:.2f} s on this host.")
    browser.close()
