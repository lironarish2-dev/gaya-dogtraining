"""מקור: יד2.

יד2 מגיש את המודעות דרך JavaScript ומגן על עצמו מפני בוטים, ולכן
requests לא מספיק — אנחנו מריצים דפדפן אמיתי דרך Playwright.

עיקרון החילוץ: לא נשענים על שמות class (יד2 מערבב אותם בכל בילד),
אלא על תבנית הקישור /realestate/item/<id> ועל הטקסט שמסביבו.
"""

from __future__ import annotations

import re
import time
from typing import Any

from ..models import Listing
from .base import BROWSER_HEADERS, chromium_path

ITEM_RE = re.compile(r"/realestate/item/([A-Za-z0-9_-]+)")


def _launch(playwright, headless: bool):
    path = chromium_path()
    kwargs: dict[str, Any] = {
        "headless": headless,
        "args": ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    }
    if path:
        kwargs["executable_path"] = path
    return playwright.chromium.launch(**kwargs)


def fetch(options: dict[str, Any]) -> list[Listing]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "יד2 דורש playwright. התקיני: pip install playwright && playwright install chromium"
        ) from exc

    urls = [str(u) for u in options.get("urls", [])]
    if not urls:
        return []

    known = tuple(str(c) for c in options.get("known_cities", []))
    headless = bool(options.get("headless", True))
    wait_ms = int(options.get("wait_ms", 4000))
    listings: dict[str, Listing] = {}

    with sync_playwright() as pw:
        browser = _launch(pw, headless)
        context = browser.new_context(
            locale="he-IL",
            user_agent=BROWSER_HEADERS["User-Agent"],
            viewport={"width": 1440, "height": 900},
        )
        page = context.new_page()
        try:
            for index, url in enumerate(urls):
                if index:
                    time.sleep(float(options.get("delay_seconds", 2.0)))
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    page.wait_for_timeout(wait_ms)  # לתת ל-feed להיטען
                    page.mouse.wheel(0, 3000)       # מודעות נטענות בגלילה
                    page.wait_for_timeout(1500)
                except Exception as exc:
                    raise RuntimeError(f"יד2: {url} — {exc}") from exc

                if "ShieldSquare" in page.title() or "captcha" in page.url.lower():
                    raise RuntimeError(
                        "יד2 חסם את הבקשה (captcha). נסי headless: false, "
                        "או הגדילי את המרווח בין הסריקות."
                    )

                for anchor in page.query_selector_all("a[href*='/realestate/item/']"):
                    href = anchor.get_attribute("href") or ""
                    match = ITEM_RE.search(href)
                    if not match:
                        continue
                    item_id = match.group(1)
                    if item_id in listings:
                        continue

                    # הכרטיס כולו נושא את הפרטים; הקישור לבדו לפעמים רק תמונה
                    card = anchor
                    for _ in range(3):
                        parent = card.query_selector("xpath=..")
                        if parent is None:
                            break
                        card = parent
                        if len((card.inner_text() or "")) > 40:
                            break

                    text = re.sub(r"\s+", " ", (card.inner_text() or "")).strip()
                    if len(text) < 10:
                        continue

                    city = next((c for c in known if c in text), "")
                    listings[item_id] = Listing(
                        source="yad2",
                        source_id=item_id,
                        url=f"https://www.yad2.co.il/realestate/item/{item_id}",
                        title=text[:120],
                        description=text,
                        city=city,
                        raw={"search_url": url},
                    ).enrich()
        finally:
            context.close()
            browser.close()

    return list(listings.values())
