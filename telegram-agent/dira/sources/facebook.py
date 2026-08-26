"""מקור: קבוצות פייסבוק.

למה זה עובד אחרת מכל השאר
--------------------------
לפייסבוק אין לוח ציבורי — התוכן נגיש רק למשתמש מחובר. לכן המקור הזה
מריץ דפדפן עם *הפרופיל שלך*: את מתחברת פעם אחת בעצמך דרך
`python -m dira login-facebook`, הסשן נשמר בתיקייה מקומית, והסוכן
משתמש בו מכאן והלאה. הסיסמה שלך לא עוברת דרך הקוד הזה בשום שלב
ולא נשמרת בשום מקום.

לפני שמפעילים — שלוש אזהרות אמיתיות
-------------------------------------
1. סריקה אוטומטית מנוגדת לתנאי השימוש של פייסבוק. בקצב גבוה זה עלול
   להוביל להגבלה או לחסימה של החשבון שלך. זו החלטה שלך, ולכן המקור
   הזה מגיע כבוי כברירת מחדל.
2. לכן ברירות המחדל כאן שמרניות בכוונה: מעט קבוצות, גלילה קצרה,
   והשהיות ארוכות בין קבוצות. אל תוריד אותן.
3. המבנה של פייסבוק משתנה תכופות. אנחנו נשענים על תפקידי ARIA
   (role="article"), שיציבים הרבה יותר משמות class, אבל גם הם עלולים
   להישבר — ואז הסריקה תחזיר אפס מודעות ולא תקרוס.
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from ..models import Listing
from .base import BROWSER_HEADERS, chromium_path

PROFILE_DIR = Path.home() / ".dira" / "fb-profile"

PERMALINK_RE = re.compile(r"/groups/[^/]+/(?:posts|permalink)/(\d+)")

# פוסט של מציע דירה מול פוסט של מחפש דירה — אנחנו רוצים רק את הראשון
OFFER_WORDS = ("להשכרה", "מושכר", "להשכיר", "מפנה את הדירה", "פנויה להשכרה")
SEEKER_WORDS = ("מחפש", "מחפשת", "מחפשים", "מחפשות", "דרושה דירה", "אשמח להמלצה")


def _looks_like_offer(text: str) -> bool:
    if not any(w in text for w in OFFER_WORDS):
        return False
    head = text[:120]  # כוונת הפוסט נקבעת בשורות הראשונות
    return not any(w in head for w in SEEKER_WORDS)


def _context(playwright, headless: bool):
    kwargs: dict[str, Any] = {
        "user_data_dir": str(PROFILE_DIR),
        "headless": headless,
        "locale": "he-IL",
        "user_agent": BROWSER_HEADERS["User-Agent"],
        "viewport": {"width": 1400, "height": 950},
        "args": ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    }
    path = chromium_path()
    if path:
        kwargs["executable_path"] = path
    return playwright.chromium.launch_persistent_context(**kwargs)


def login(headless: bool = False) -> None:
    """פותח דפדפן כדי שתתחברי לפייסבוק פעם אחת. הסשן נשמר להמשך."""
    from playwright.sync_api import sync_playwright

    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        context = _context(pw, headless)
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
        print("התחברי לפייסבוק בחלון שנפתח, ואז סגרי אותו. הסשן יישמר.")
        try:
            page.wait_for_event("close", timeout=600_000)  # עד עשר דקות
        except Exception:
            pass
        context.close()
    print(f"הסשן נשמר ב-{PROFILE_DIR}")


def is_logged_in() -> bool:
    return (PROFILE_DIR / "Default").exists() or (PROFILE_DIR / "Cookies").exists()


def fetch(options: dict[str, Any]) -> list[Listing]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("פייסבוק דורש playwright: pip install playwright") from exc

    groups = [str(g) for g in options.get("groups", [])]
    if not groups:
        return []
    if not is_logged_in():
        raise RuntimeError(
            "אין סשן פייסבוק שמור. הריצי קודם: python -m dira login-facebook"
        )

    known = tuple(str(c) for c in options.get("known_cities", []))
    headless = bool(options.get("headless", True))
    scrolls = int(options.get("scrolls", 4))
    delay = float(options.get("delay_seconds", 12.0))
    listings: dict[str, Listing] = {}

    with sync_playwright() as pw:
        context = _context(pw, headless)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            for index, group in enumerate(groups):
                if index:
                    time.sleep(delay)  # קצב אנושי, בכוונה
                url = group if group.startswith("http") else (
                    f"https://www.facebook.com/groups/{group}"
                )
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=60000)
                    page.wait_for_timeout(4000)
                except Exception as exc:
                    raise RuntimeError(f"פייסבוק: {url} — {exc}") from exc

                if "login" in page.url or "checkpoint" in page.url:
                    raise RuntimeError(
                        "פייסבוק ביקש התחברות מחדש. הריצי: python -m dira login-facebook"
                    )

                for _ in range(scrolls):
                    page.mouse.wheel(0, 2400)
                    page.wait_for_timeout(2500)

                for article in page.query_selector_all('div[role="article"]'):
                    text = re.sub(r"\s+", " ", (article.inner_text() or "")).strip()
                    if len(text) < 40 or not _looks_like_offer(text):
                        continue

                    post_id = ""
                    for anchor in article.query_selector_all("a[href*='/groups/']"):
                        match = PERMALINK_RE.search(anchor.get_attribute("href") or "")
                        if match:
                            post_id = match.group(1)
                            break
                    if not post_id or post_id in listings:
                        continue

                    listings[post_id] = Listing(
                        source="facebook",
                        source_id=post_id,
                        url=f"https://www.facebook.com/groups/{group}/posts/{post_id}",
                        title=text[:120],
                        description=text[:1200],
                        city=next((c for c in known if c in text), ""),
                        raw={"group": group},
                    ).enrich()
        finally:
            context.close()

    return list(listings.values())
