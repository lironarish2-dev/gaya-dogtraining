"""מודל המודעה — המבנה שכל מקור חייב להחזיר."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

# ביטויים שמעידים על גינה / חצר / מרפסת בטקסט חופשי של מודעה
GARDEN_WORDS = (
    "גינה", "גינת", "חצר", "חצרך", "גינה פרטית", "יציאה לגינה",
    "גינה מטופחת", "דירת גן", "קומת קרקע", "צמוד קרקע", "דק", "פרגולה",
)
BALCONY_WORDS = ("מרפסת", "מרפסות", "מרפסת שמש", "טרסה")
PET_YES_WORDS = (
    "מותר בעלי חיים", "מותרים בעלי חיים", "אפשרי בעלי חיים", "בעלי חיים בשמחה",
    "אפשר עם כלב", "מקבלים בעלי חיים", "ידידותי לחיות", "כלב מותר", "חיות מחמד מותרות",
)
PET_NO_WORDS = (
    "ללא בעלי חיים", "אסור בעלי חיים", "לא מקבלים בעלי חיים",
    "בלי בעלי חיים", "לא מתאים לבעלי חיים", "ללא חיות מחמד",
)

_PRICE_RE = re.compile(r"([\d][\d,\.]{2,})\s*(?:ש[\"״']?ח|שח|₪|ils|nis)", re.IGNORECASE)
_ROOMS_RE = re.compile(r"([\d]+(?:[.,][\d])?)\s*חד(?:רים|')?")
_SQM_RE = re.compile(r"([\d]{2,4})\s*(?:מ[\"״']?ר|מטר)")


def _any_in(text: str, words) -> bool:
    return any(w in text for w in words)


def parse_price(text: str) -> Optional[int]:
    """מחלץ מחיר משקלי מטקסט. מתעלם מערכים לא סבירים."""
    for raw in _PRICE_RE.findall(text or ""):
        digits = raw.replace(",", "").replace(".", "")
        if not digits.isdigit():
            continue
        value = int(digits)
        # 500–60,000 הוא הטווח הסביר לשכירות חודשית; מחוצה לו זה כנראה מ"ר או טלפון
        if 500 <= value <= 60_000:
            return value
    return None


def parse_rooms(text: str) -> Optional[float]:
    match = _ROOMS_RE.search(text or "")
    if not match:
        return None
    try:
        rooms = float(match.group(1).replace(",", "."))
    except ValueError:
        return None
    return rooms if 0.5 <= rooms <= 15 else None


def parse_sqm(text: str) -> Optional[int]:
    match = _SQM_RE.search(text or "")
    if not match:
        return None
    sqm = int(match.group(1))
    return sqm if 10 <= sqm <= 1000 else None


def detect_pets(text: str) -> Optional[bool]:
    """True = מותר במפורש, False = נאסר במפורש, None = לא צוין."""
    text = text or ""
    if _any_in(text, PET_NO_WORDS):
        return False
    if _any_in(text, PET_YES_WORDS):
        return True
    return None


@dataclass
class Listing:
    source: str
    source_id: str
    url: str
    title: str = ""
    description: str = ""
    city: str = ""
    street: str = ""
    rooms: Optional[float] = None
    price: Optional[int] = None
    sqm: Optional[int] = None
    has_garden: Optional[bool] = None
    has_balcony: Optional[bool] = None
    pets_ok: Optional[bool] = None
    posted_at: str = ""
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        """מזהה יציב לצורך דה־דופליקציה בין ריצות."""
        if self.source_id:
            return f"{self.source}:{self.source_id}"
        digest = hashlib.sha1(self.url.encode("utf-8")).hexdigest()[:16]
        return f"{self.source}:{digest}"

    @property
    def text(self) -> str:
        return " ".join(p for p in (self.title, self.description, self.street, self.city) if p)

    def enrich(self) -> "Listing":
        """ממלא שדות חסרים מתוך הטקסט החופשי. לא דורס ערכים שהמקור סיפק."""
        blob = self.text
        if self.price is None:
            self.price = parse_price(blob)
        if self.rooms is None:
            self.rooms = parse_rooms(blob)
        if self.sqm is None:
            self.sqm = parse_sqm(blob)
        if self.has_garden is None:
            self.has_garden = _any_in(blob, GARDEN_WORDS) or None
        if self.has_balcony is None:
            self.has_balcony = _any_in(blob, BALCONY_WORDS) or None
        if self.pets_ok is None:
            self.pets_ok = detect_pets(blob)
        return self

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("raw", None)
        return data
