"""חוזה שכל מקור מודעות מממש."""

from __future__ import annotations

from typing import Any, Protocol

from ..models import Listing


class Source(Protocol):
    name: str

    def fetch(self, options: dict[str, Any]) -> list[Listing]:
        """מחזיר מודעות גולמיות. הסינון נעשה בשלב אחר.

        חובה: לא לזרוק חריגה על תוצאה ריקה — רק על תקלה אמיתית,
        כדי שכשל של מקור אחד לא יפיל את כל הסריקה.
        """
        ...


BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

CHROMIUM_CANDIDATES = (
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
)


def chromium_path() -> str | None:
    """נתיב לכרומיום מותקן מראש, אם יש. אחרת playwright ימצא לבד."""
    import os

    override = os.environ.get("DIRA_CHROMIUM")
    if override and os.path.exists(override):
        return override
    for path in CHROMIUM_CANDIDATES:
        if os.path.exists(path):
            return path
    return None
