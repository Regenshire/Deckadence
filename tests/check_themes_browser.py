"""Run against an isolated, read-only UXReviewServer (default port 5013).

python tests/check_themes_browser.py [base_url]
Does not modify application settings or user data; uses a fresh browser profile.
"""
import json
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5013"
OUT = ROOT / "output/theme-review"
KEY = "deckadence.appearance.v1"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "/config?open=theme&scroll=theme", wait_until="networkidle")
        assert page.locator("[data-theme-choice]").count() == 10
        assert page.locator("html").get_attribute("data-theme") == "dark"
        assert page.locator("html").get_attribute("data-theme-background") == "false"
        assert page.locator("#themeSettingsHeading").get_attribute("aria-expanded") == "true"
        original = page.evaluate("getComputedStyle(document.body).backgroundColor")
        assert original == "rgb(16, 17, 20)"
        themes = page.evaluate("DeckadenceThemeCatalog.map(t => t.id)")
        for theme in themes:
            page.locator(f'[data-theme-choice][value="{theme}"]').check()
            assert page.locator("html").get_attribute("data-theme") == theme
            assert page.locator("#menuThemeSelect").input_value() == theme
            assert page.request.get(BASE + f"/static/img/themes/{theme}.svg").status == 200
        page.wait_for_function("document.getElementById('appBaseStyles').sheet !== null")
        assert page.locator("#appBaseStyles").get_attribute("href").endswith("backup-theme.css")
        assert page.evaluate("getComputedStyle(document.body).backgroundColor") == original
        page.locator('[data-theme-choice][value="dark"]').check()
        assert page.locator("#appBaseStyles").get_attribute("href").endswith("/style.css")
        page.locator("#themeBackgroundToggle").check()
        assert page.locator(".theme-preview").evaluate_all("els => els.every(e => getComputedStyle(e).backgroundImage === 'none')")
        page.goto(BASE + "/", wait_until="networkidle")
        assert page.locator(".home-background").evaluate("e => getComputedStyle(e).backgroundImage") == "none"
        assert page.evaluate("Array.from(document.querySelectorAll('body *')).every(e => !getComputedStyle(e).backgroundImage.includes('/img/themes/'))")
        page.screenshot(path=str(OUT / "home-dark-body-only.png"))
        page.goto(BASE + "/config?open=theme&scroll=theme", wait_until="networkidle")
        assert "dark.svg" in page.evaluate("getComputedStyle(document.body, '::before').backgroundImage")
        # Previously saved animation=true must not re-enable the expensive asset.
        page.evaluate("localStorage.setItem('deckadence.appearance.v1', JSON.stringify({theme:'dark',background:true,backgroundType:'constellation',backgroundAnimations:true}))")
        page.reload(wait_until="networkidle")
        assert "-animated.svg" not in page.evaluate("getComputedStyle(document.body, '::before').backgroundImage")
        assert page.evaluate("getComputedStyle(document.body, '::before').filter") == "none"
        assert page.evaluate("getComputedStyle(document.body, '::before').position") == "fixed"
        page.locator("#themeBackgroundSelect").select_option("constellation")
        for theme in themes:
            page.locator(f'[data-theme-choice][value="{theme}"]').check()
            image = page.evaluate("getComputedStyle(document.body, '::before').backgroundImage")
            assert "card-constellation-" in image and "-animated.svg" not in image
            assert page.request.get(image[5:-2]).status == 200
        page.locator("#themeBackgroundIntensity").fill("65")
        page.locator("#themeBackgroundIntensity").dispatch_event("input")
        page.locator("#themeBackgroundSize").fill("125")
        page.locator("#themeBackgroundSize").dispatch_event("input")
        assert page.evaluate("getComputedStyle(document.body, '::before').opacity") == "0.65"
        assert page.evaluate("getComputedStyle(document.body, '::before').backgroundSize") == "2000px 1375px"
        page.locator("#themeBackgroundAnimations").uncheck()
        assert "-animated.svg" not in page.evaluate("getComputedStyle(document.body, '::before').backgroundImage")
        page.reload(wait_until="networkidle")
        assert page.locator("#themeBackgroundSelect").input_value() == "constellation"
        assert page.locator("#themeBackgroundIntensity").input_value() == "65"
        assert page.locator("#themeBackgroundSize").input_value() == "125"
        assert not page.locator("#themeBackgroundAnimations").is_checked()
        page.locator("#themeBackgroundAnimations").check()
        page.wait_for_selector(".theme-motion", state="attached")
        page.emulate_media(reduced_motion="reduce")
        assert "-animated.svg" not in page.evaluate("getComputedStyle(document.body, '::before').backgroundImage")
        page.emulate_media(reduced_motion="no-preference")
        assert page.locator("#themeBackgroundToggle").is_checked()
        page.locator('[data-theme-choice][value="light"]').check()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "settings-light.png"))
        page.locator("#themeBackgroundToggle").uncheck()
        assert page.evaluate("getComputedStyle(document.body, '::before').backgroundImage") == "none"
        page.goto(BASE + "/", wait_until="networkidle")
        assert page.locator("html").get_attribute("data-theme") == "light"
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "home-light.png"))
        for route in ("/play/momir", "/play/draft", "/sets", "/deck-builder"):
            response = page.goto(BASE + route, wait_until="networkidle")
            assert response.status == 200, route
            assert page.locator("html").get_attribute("data-theme") == "light"
        assert page.locator(".deckbuilder-manage-header").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(222, 219, 212)"
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "decks-light.png"))
        page.goto(BASE + "/", wait_until="networkidle")
        page.locator("#appSettingsButton").click()
        page.locator("#menuThemeSelect").select_option("green-mana")
        assert page.locator("html").get_attribute("data-theme") == "green-mana"
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "menu-green.png"))
        # Browser tabs stay in sync without reloading.
        other = context.new_page()
        other.goto(BASE + "/", wait_until="networkidle")
        page.locator("#menuThemeSelect").select_option("white-mana")
        other.wait_for_function("document.documentElement.dataset.theme === 'white-mana'")
        other.close()
        page.goto(BASE + "/config?open=theme&scroll=theme", wait_until="networkidle")
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator('[data-theme-choice][value="blue-mana"]').check()
        page.locator("#themeBackgroundToggle").check()
        page.locator("#section_theme").scroll_into_view_if_needed()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "settings-mobile.png"))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        page.evaluate("scrollTo(0, 0)")
        page.locator("#appSettingsButton").click()
        page.locator("#menuThemeSelect").select_option("light")
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "menu-mobile.png"))
        assert page.locator("html").get_attribute("data-theme") == "light"
        # Invalid or malformed preferences must not prevent booting.
        for value in ['{broken', '{"theme":"unknown","background":"false"}']:
            page.evaluate("([key, value]) => localStorage.setItem(key, value)", [KEY, value])
            page.reload(wait_until="networkidle")
            assert page.locator("html").get_attribute("data-theme") == "dark"
            assert not page.locator("#themeBackgroundToggle").is_checked()
        blocked = browser.new_context()
        blocked.add_init_script("Object.defineProperty(window, 'localStorage', {get() { throw new Error('Storage disabled'); }});")
        offline = blocked.new_page()
        offline.goto(BASE + "/config?open=theme&scroll=theme", wait_until="networkidle")
        offline.locator('[data-theme-choice][value="light"]').check()
        assert offline.locator("html").get_attribute("data-theme") == "light"
        assert "storage is unavailable" in offline.locator("[data-theme-status]").inner_text()
        blocked.close()
        assert not errors, errors
        browser.close()
    print("PASS: 10 themes, menu, background, reload/navigation persistence, tab sync, backup, mobile, invalid/blocked storage.")


if __name__ == "__main__":
    main()
