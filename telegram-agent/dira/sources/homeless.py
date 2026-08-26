"""מקור: הומלס (homeless.co.il).

הדפים מוגשים מהשרת כ-HTML מלא, בלי JavaScript, ולכן requests מספיק.
כל המידע — סוג נכס, חדרים, יישוב, רחוב ומחיר — יושב בטקסט של הקישור
עצמו, למשל:
    "יחידת דיור להשכרה 2 חדרים בנטעים נטעים, השיטה, 3800 ש\"ח מושבים במרכז"
לכן אנחנו מפרסרים את הטקסט ולא נשענים על מבנה ה-DOM, שמשתנה.
"""

from __future__ import annotations

import re
import time
from typing import Any
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

from ..models import Listing
from .base import BROWSER_HEADERS

BASE = "https://www.homeless.co.il"
AD_RE = re.compile(r"/(?:rent|renttivuch)/viewad,(\d+)\.aspx", re.IGNORECASE)

TITLE_RE = re.compile(
    r"^(?P<kind>יחידת דיור|דירת גן|דירת גג|דירת סטודיו|בית פרטי|דו משפחתי|דירה|וילה|מרתף)"
    r"\s+להשכרה(?:\s+מתיווך)?"
    r"(?:\s+(?P<rooms>[\d]+(?:\.[\d])?)\s*חדרים)?"
    r"\s*(?P<rest>.*)$"
)

PRICE_RE = re.compile(r"[\d][\d,\.]*\s*(?:ש[\"״\']?ח|שח|₪)")
PLACE_PREFIX_RE = re.compile(r"^(?:מושב|קיבוץ|שכונת|שכונה)\s+")
# תוויות האזור של הומלס נדבקות לסוף הכותרת כשאין מחיר
AREA_LABEL_RE = re.compile(
    r"\s*(?:מושבים במרכז|מושבים בשפלה|מושבים - השפלה|מושבים|"
    r"נס ציונה\s*-\s*רחובות|יבנה והסביבה|העדכון היומי|השפלה)\s*$"
)


def _clean_street(text: str, city: str) -> str:
    """מסיר תוויות אזור, מספר בית וכפילות של שם היישוב."""
    text = AREA_LABEL_RE.sub("", _clean(text))
    text = re.sub(r"^(?:קיבוץ|מושב)\s*[.]?\s*", "", text)
    if city and city in text:
        text = _clean(text.replace(city, ""))
    text = re.sub(r"\s*\d+\s*$", "", text).strip(" ,.-")
    return "" if text.isdigit() or len(text) < 2 else text


def _strip_place(text: str) -> str:
    text = _clean(text)
    text = re.sub(r"^\d+\s+", "", text)      # "1 כפר הנגיד"
    text = PLACE_PREFIX_RE.sub("", text)
    return _clean(text)


def _dedup_words(text: str) -> str:
    """הומלס מכפיל את שם היישוב: "בנטעים נטעים" -> "נטעים"."""
    words = text.split()
    if len(words) >= 2:
        first, last = words[0].lstrip("ב"), words[-1]
        if first == last or (last and last in first):
            return last
    return text


def _split_location(rest: str, known_cities: tuple[str, ...] = ()) -> tuple[str, str]:
    """מפריד יישוב מרחוב.

    חילוץ יישוב מעברית חופשית אינו אמין — הפורמט משתנה בין
    "בשכונה. עיר, רחוב" ל"בעיר עיר, רחוב" ל"מושב X, רחוב".
    לכן קודם כול מנסים התאמה מול רשימת היישובים שמעניינים אותנו,
    שהיא מדויקת לחלוטין, ורק אם אין התאמה נופלים להיוריסטיקה.
    """
    rest = _clean(rest)

    # כל מה שאחרי המחיר הוא תווית אזור של הומלס, לא כתובת
    price_match = PRICE_RE.search(rest)
    head_blob = rest[: price_match.start()] if price_match else rest

    parts = [p for p in (s.strip(" .,-") for s in head_blob.split(",")) if p]
    if not parts:
        return "", ""

    raw_street = parts[1] if len(parts) > 1 else ""

    for city in known_cities:
        if city and city in head_blob:
            return city, _clean_street(raw_street, city)

    head = parts[0]
    if "." in head:
        head = head.rsplit(".", 1)[-1]     # "רמת אליהו. ראשון לציון"
    city = _dedup_words(_strip_place(head))
    return city, _clean_street(raw_street, city)


PROPERTY_KINDS = {
    "apartment": 3,      # דירה
    "unit": 9,           # יחידת דיור
    "house": 7,          # בית פרטי
    "garden_flat": 12,   # דירת גן
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def parse_title(title: str, known_cities: tuple[str, ...] = ()) -> dict[str, Any]:
    """מחלץ שדות מכותרת מודעה של הומלס. נבדק מול כותרות אמיתיות."""
    title = _clean(title)
    out: dict[str, Any] = {"kind": "", "rooms": None, "city": "", "street": ""}
    match = TITLE_RE.match(title)
    if not match:
        return out
    out["kind"] = match.group("kind")
    if match.group("rooms"):
        try:
            out["rooms"] = float(match.group("rooms"))
        except ValueError:
            pass
    city, street = _split_location(match.group("rest") or "", known_cities)
    out["city"], out["street"] = city, street
    return out


def build_urls(options: dict[str, Any]) -> list[str]:
    """בונה את כתובות החיפוש מתוך הקונפיג."""
    urls = [str(u) for u in options.get("urls", [])]
    for city in options.get("cities", []):
        suffix = ""
        kind = options.get("property_kind")
        if kind in PROPERTY_KINDS:
            suffix = f"$$iNumber3={PROPERTY_KINDS[kind]}"
        urls.append(f"{BASE}/rent/city={quote(str(city))}{suffix}")
    for area_id in options.get("area_ids", []):
        urls.append(f"{BASE}/rent/inumber1={area_id}")
    return urls


def fetch(options: dict[str, Any]) -> list[Listing]:
    urls = build_urls(options)
    delay = float(options.get("delay_seconds", 1.5))
    listings: dict[str, Listing] = {}

    known = tuple(str(c) for c in options.get("known_cities", []))

    session = requests.Session()
    session.headers.update(BROWSER_HEADERS)

    for index, url in enumerate(urls):
        if index:
            time.sleep(delay)  # אנחנו אורחים בשרת של מישהו אחר
        try:
            resp = session.get(url, timeout=25)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise RuntimeError(f"הומלס: {url} — {exc}") from exc

        soup = BeautifulSoup(resp.text, "lxml")
        for anchor in soup.find_all("a", href=True):
            match = AD_RE.search(anchor["href"])
            if not match:
                continue
            ad_id = match.group(1)
            if ad_id in listings:
                continue
            title = _clean(anchor.get_text(" "))
            if len(title) < 12:
                continue  # קישורי "עוד" / תמונות בלי טקסט
            parts = parse_title(title, known)
            listings[ad_id] = Listing(
                source="homeless",
                source_id=ad_id,
                url=urljoin(BASE, anchor["href"]),
                title=title,
                city=parts["city"],
                street=parts["street"],
                rooms=parts["rooms"],
                raw={"kind": parts["kind"], "search_url": url},
            ).enrich()

    return list(listings.values())
