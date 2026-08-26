"""בדיקות פרסינג — מבוססות על כותרות מודעה אמיתיות מהומלס."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from dira.models import Listing, detect_pets, parse_price, parse_rooms, parse_sqm
from dira.sources.homeless import parse_title

KNOWN = (
    "נטעים", "בית עובד", "בית חנן", "כפר הנגיד", "פלמחים",
    "ראשון לציון", "נס ציונה", "רחובות", "גבעת ברנר", "בית אלעזרי",
)


@pytest.mark.parametrize("text,expected", [
    ('3800 ש"ח', 3800),
    ("3,900 שח", 3900),
    ("2750 ₪", 2750),
    ("85 מ\"ר בלבד", None),          # מ"ר אינו מחיר
    ("טלפון 0501234567", None),      # מחוץ לטווח הסביר
    ("", None),
])
def test_parse_price(text, expected):
    assert parse_price(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("2 חדרים", 2.0),
    ("2.5 חדרים", 2.5),
    ("דירת 3 חד'", 3.0),
    ("בלי מספר", None),
    ("99 חדרים", None),              # לא סביר
])
def test_parse_rooms(text, expected):
    assert parse_rooms(text) == expected


def test_parse_sqm():
    assert parse_sqm('85 מ"ר') == 85
    assert parse_sqm("5 מטר") is None      # קטן מדי, כנראה לא שטח דירה


@pytest.mark.parametrize("text,expected", [
    ("מותר בעלי חיים", True),
    ("ללא בעלי חיים", False),
    ("דירה יפה במרכז", None),
    # שלילה גוברת על חיוב כשמופיעים שניהם — עדיף לפספס מלהטעות
    ("מותר בעלי חיים? לא, ללא בעלי חיים", False),
])
def test_detect_pets(text, expected):
    assert detect_pets(text) is expected


@pytest.mark.parametrize("title,city,street,rooms", [
    ('יחידת דיור להשכרה 2 חדרים בנטעים נטעים, השיטה, 3800 ש"ח מושבים במרכז',
     "נטעים", "השיטה", 2.0),
    ("דירה להשכרה 2 חדרים ברמת אליהו. ראשון לציון, תורה ועבודה 3600 שח",
     "ראשון לציון", "תורה ועבודה", 2.0),
    ('דירת גן להשכרה מתיווך 2 חדרים ב1 כפר הנגיד, 1, 4000 ש"ח יבנה והסביבה',
     "כפר הנגיד", "", 2.0),
    ("יחידת דיור להשכרה 2.5 חדרים נטעים, החיל מושבים במרכז",
     "נטעים", "החיל", 2.5),
    ('דירת סטודיו להשכרה 1 חדרים בקיבוץ פלמחים, קיבוץ. פלמחים, 4000 ש"ח ראשון לציון',
     "פלמחים", "", 1.0),
    ('יחידת דיור להשכרה 2 חדרים בשכונת הדקלים גבעת ברנר, האלה 17, 3900 ש"ח נס ציונה- רחובות',
     "גבעת ברנר", "האלה", 2.0),
])
def test_parse_title(title, city, street, rooms):
    parsed = parse_title(title, KNOWN)
    assert parsed["city"] == city
    assert parsed["street"] == street
    assert parsed["rooms"] == rooms


def test_parse_title_rejects_garbage():
    assert parse_title("סתם טקסט שאינו מודעה", KNOWN)["city"] == ""


def test_enrich_fills_only_missing_fields():
    listing = Listing(
        source="t", source_id="1", url="u",
        title='2 חדרים 3800 ש"ח עם גינה',
        price=9999,                      # ערך שהמקור סיפק — אסור לדרוס
    ).enrich()
    assert listing.price == 9999
    assert listing.rooms == 2.0
    assert listing.has_garden is True


def test_listing_key_is_stable_without_id():
    a = Listing(source="s", source_id="", url="https://x/1")
    b = Listing(source="s", source_id="", url="https://x/1")
    assert a.key == b.key
    assert a.key != Listing(source="s", source_id="", url="https://x/2").key
