"""בדיקות התאמה — הלוגיקה שמחליטה מה נשלח אלייך."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dira.config import AreaRule, Criteria
from dira.matching import evaluate, rank
from dira.models import Listing


def crit(**kw) -> Criteria:
    base = Criteria(
        min_rooms=1.5, max_rooms=3.0, max_price=4000,
        areas=[
            AreaRule("moshavim", ["נטעים", "כפר הנגיד"], max_price=4000, priority=10),
            AreaRule("rishon", ["ראשון לציון"], min_price=3500, max_price=4000, priority=5),
        ],
    )
    for key, value in kw.items():
        setattr(base, key, value)
    return base


def listing(**kw) -> Listing:
    defaults = dict(source="t", source_id="1", url="u", city="נטעים", rooms=2.0, price=3800)
    defaults.update(kw)
    return Listing(**defaults)


def test_matches_basic():
    assert evaluate(listing(), crit()).matched


def test_price_above_area_ceiling_rejected():
    verdict = evaluate(listing(price=4500), crit())
    assert not verdict.matched
    assert "מעל התקרה" in verdict.rejections[0]


def test_rishon_floor_applies_only_to_rishon():
    """3,000 ₪ פסול בראשל"צ אבל תקין במושב — כלל האזור עובד."""
    assert not evaluate(listing(city="ראשון לציון", price=3000), crit()).matched
    assert evaluate(listing(city="נטעים", price=3000), crit()).matched


def test_rooms_outside_range_rejected():
    assert not evaluate(listing(rooms=4.0), crit()).matched
    assert not evaluate(listing(rooms=1.0), crit()).matched


def test_explicit_no_pets_rejected_by_default():
    assert not evaluate(listing(pets_ok=False), crit()).matched


def test_no_pets_allowed_when_rule_disabled():
    assert evaluate(listing(pets_ok=False), crit(reject_explicit_no_pets=False)).matched


def test_unknown_pets_still_matches():
    """רוב המודעות לא מציינות — אסור שזה יפסול."""
    assert evaluate(listing(pets_ok=None), crit()).matched


def test_garden_beats_no_garden_on_score():
    with_garden = evaluate(listing(has_garden=True), crit()).score
    without = evaluate(listing(), crit()).score
    assert with_garden > without


def test_require_outdoor_rejects_when_nothing_outside():
    assert not evaluate(listing(), crit(require_outdoor=True)).matched
    assert evaluate(listing(has_balcony=True), crit(require_outdoor=True)).matched


def test_exclude_keyword_rejects():
    verdict = evaluate(
        listing(description="דרושה שותפה לדירה"), crit(exclude_keywords=["שותפה"])
    )
    assert not verdict.matched


def test_missing_price_is_rejected_not_crashed():
    verdict = evaluate(listing(price=None), crit())
    assert not verdict.matched
    assert "אין מחיר" in verdict.rejections[0]


def test_rank_orders_by_score_and_filters():
    items = [
        listing(source_id="a", price=3900),
        listing(source_id="b", price=3000, has_garden=True, pets_ok=True),
        listing(source_id="c", price=9000),          # מעל התקרה
    ]
    ranked = rank(items, crit())
    assert [l.source_id for l, _ in ranked] == ["b", "a"]


def test_min_score_gate():
    assert not evaluate(listing(), crit(min_score=999)).matched
