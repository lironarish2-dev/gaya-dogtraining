"""מקור הדגמה — מודעות מומצאות, בלי רשת.

קיים כדי שתוכלי לוודא שהחיווט לטלגרם עובד לפני שנוגעים בסקרייפרים.
כך תקלה בהתראות מופרדת מתקלה בסריקה.
"""

from __future__ import annotations

from typing import Any

from ..models import Listing

SAMPLES = [
    dict(
        source_id="demo-1",
        url="https://example.com/demo/1",
        title="יחידת דיור להשכרה 2 חדרים בנטעים",
        description="יחידה 2 חדרים בנטעים, 85 מ\"ר, גינה מטופחת וכניסה נפרדת. "
                    "מותר בעלי חיים. 3,800 ש\"ח כולל ארנונה.",
        city="נטעים",
        street="השיטה",
    ),
    dict(
        source_id="demo-2",
        url="https://example.com/demo/2",
        title="דירת גן להשכרה 2 חדרים בכפר הנגיד",
        description="דירת גן 40 מ\"ר עם גינה מטופחת של 100 מ\"ר. 4,000 ש\"ח.",
        city="כפר הנגיד",
        street="",
    ),
    dict(
        source_id="demo-3",
        url="https://example.com/demo/3",
        title="דירה להשכרה 4 חדרים בתל אביב",
        description="4 חדרים במרכז תל אביב, ללא בעלי חיים. 9,500 ש\"ח.",
        city="תל אביב",
        street="דיזנגוף",
    ),
]


def fetch(options: dict[str, Any]) -> list[Listing]:
    return [Listing(source="demo", **sample).enrich() for sample in SAMPLES]
