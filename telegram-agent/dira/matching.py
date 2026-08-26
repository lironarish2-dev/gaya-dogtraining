"""החלטה אם מודעה מתאימה, ובאיזו מידה."""

from __future__ import annotations

from dataclasses import dataclass

from .config import Criteria
from .models import Listing


@dataclass
class Verdict:
    matched: bool
    score: int
    reasons: list[str]     # למה כן — מוצג בהודעה
    rejections: list[str]  # למה לא — מוצג רק ב--verbose

    @property
    def summary(self) -> str:
        return " · ".join(self.reasons)


def evaluate(listing: Listing, criteria: Criteria) -> Verdict:
    """בודק מודעה מול הקריטריונים ומחזיר ציון + הסבר.

    העיקרון: תנאים שמפסילים הם רק אלה שהמשתמשת הגדירה כקשיחים
    (חדרים, מחיר, מילות פסילה, איסור מפורש על בעלי חיים).
    גינה ומרפסת מעלות ציון אבל לא מפסילות, כי מודעות רבות
    פשוט לא מציינות אותן בטקסט.
    """
    reasons: list[str] = []
    rejections: list[str] = []
    score = 0

    low, high = criteria.price_bounds(listing.city)

    if listing.price is None:
        # מודעה בלי מחיר עוברת, אבל בציון נמוך — שווה מבט, לא התראה דחופה
        rejections.append("אין מחיר במודעה")
    else:
        if high is not None and listing.price > high:
            rejections.append(f"מחיר {listing.price:,} מעל התקרה {high:,}")
        if low is not None and listing.price < low:
            rejections.append(f"מחיר {listing.price:,} מתחת לרצפה {low:,}")
        if not rejections:
            reasons.append(f"{listing.price:,} ₪")
            if high:
                # ככל שרחוק יותר מהתקרה, כך משתלם יותר
                headroom = (high - listing.price) / high
                score += int(min(headroom, 0.5) * 40)

    if listing.rooms is None:
        rejections.append("אין מספר חדרים")
    elif not (criteria.min_rooms <= listing.rooms <= criteria.max_rooms):
        rejections.append(
            f"{listing.rooms:g} חדרים מחוץ לטווח {criteria.min_rooms:g}–{criteria.max_rooms:g}"
        )
    else:
        rooms_text = f"{listing.rooms:g} חד׳"
        reasons.append(rooms_text)
        score += 15

    if listing.has_garden:
        reasons.append("גינה/חצר")
        score += 45
    if listing.has_balcony:
        reasons.append("מרפסת")
        score += 20

    if criteria.require_outdoor and not (listing.has_garden or listing.has_balcony):
        rejections.append("אין גינה ואין מרפסת")

    if listing.pets_ok is True:
        reasons.append("מרשה בעלי חיים")
        score += 50
    elif listing.pets_ok is False and criteria.reject_explicit_no_pets:
        rejections.append("נאמר במפורש שאסור בעלי חיים")

    if listing.sqm:
        reasons.append(f"{listing.sqm} מ״ר")
        score += min(listing.sqm // 10, 10)

    blob = listing.text
    for word in criteria.exclude_keywords:
        if word and word in blob:
            rejections.append(f"מכיל מילת פסילה: {word}")

    matched = not rejections and score >= criteria.min_score
    return Verdict(matched=matched, score=score, reasons=reasons, rejections=rejections)


def rank(listings: list[Listing], criteria: Criteria) -> list[tuple[Listing, Verdict]]:
    """מסנן ומחזיר מותאמות בלבד, מהטובה לפחות טובה."""
    scored = [(l, evaluate(l, criteria)) for l in listings]
    keep = [(l, v) for l, v in scored if v.matched]
    keep.sort(key=lambda pair: -pair[1].score)
    return keep
