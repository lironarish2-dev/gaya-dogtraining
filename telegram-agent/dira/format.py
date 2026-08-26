"""עיצוב הודעות טלגרם."""

from __future__ import annotations

import html

from .matching import Verdict
from .models import Listing

SOURCE_LABELS = {
    "homeless": "הומלס",
    "yad2": "יד2",
    "facebook": "פייסבוק",
    "demo": "הדגמה",
}


def _esc(text: str) -> str:
    return html.escape(text or "", quote=False)


def _stars(score: int) -> str:
    """תרגום ציון לשלוש רמות, כדי שהמבט ייפול קודם על החזקות."""
    if score >= 110:
        return "🔥"
    if score >= 70:
        return "⭐"
    return "•"


def listing_message(listing: Listing, verdict: Verdict) -> str:
    where = " · ".join(p for p in (listing.city, listing.street) if p)
    source = SOURCE_LABELS.get(listing.source, listing.source)

    lines = [f"{_stars(verdict.score)} <b>{_esc(where or listing.title[:60])}</b>"]

    if verdict.reasons:
        lines.append(_esc(verdict.summary))

    body = (listing.description or listing.title or "").strip()
    if body:
        if len(body) > 320:
            body = body[:317].rstrip() + "…"
        lines.append("")
        lines.append(f"<i>{_esc(body)}</i>")

    lines.append("")
    lines.append(f'<a href="{_esc(listing.url)}">מודעה ב{_esc(source)}</a>')
    return "\n".join(lines)


def run_summary(found: int, new: int, sent: int, errors: list[str]) -> str:
    if new == 0 and not errors:
        return ""  # ריצה שקטה לא מייצרת רעש
    lines = [f"<b>סריקה</b> — {found} מודעות נסרקו, {new} חדשות, {sent} נשלחו"]
    for err in errors:
        lines.append(f"⚠️ {_esc(err)}")
    return "\n".join(lines)
