"""טעינת קונפיגורציה מקובץ YAML + משתני סביבה."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml

DEFAULT_CONFIG_PATH = Path(os.environ.get("DIRA_CONFIG", "config.yaml"))
DEFAULT_STATE_PATH = Path(os.environ.get("DIRA_STATE", "state/seen.json"))


@dataclass
class AreaRule:
    """כלל מחיר לאזור. מאפשר תקרה שונה למושבים ולעיר."""

    name: str
    cities: list[str] = field(default_factory=list)
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    priority: int = 0


@dataclass
class Criteria:
    min_rooms: float = 1.5
    max_rooms: float = 3.0
    min_price: Optional[int] = None
    max_price: Optional[int] = 4000
    areas: list[AreaRule] = field(default_factory=list)
    require_outdoor: bool = False
    exclude_keywords: list[str] = field(default_factory=list)
    reject_explicit_no_pets: bool = True
    min_score: int = 0

    def area_for(self, city: str) -> Optional[AreaRule]:
        """מחזיר את כלל האזור שהעיר שייכת אליו, לפי עדיפות יורדת."""
        city = (city or "").strip()
        if not city:
            return None
        matches = [a for a in self.areas if any(c in city or city in c for c in a.cities)]
        if not matches:
            return None
        return sorted(matches, key=lambda a: -a.priority)[0]

    def price_bounds(self, city: str) -> tuple[Optional[int], Optional[int]]:
        area = self.area_for(city)
        if area is None:
            return self.min_price, self.max_price
        low = area.min_price if area.min_price is not None else self.min_price
        high = area.max_price if area.max_price is not None else self.max_price
        return low, high


@dataclass
class SourceConfig:
    name: str
    enabled: bool = True
    options: dict[str, Any] = field(default_factory=dict)


@dataclass
class Config:
    criteria: Criteria = field(default_factory=Criteria)
    sources: list[SourceConfig] = field(default_factory=list)
    telegram_token: str = ""
    telegram_chat_id: str = ""
    interval_minutes: int = 20
    max_per_run: int = 12
    state_path: Path = DEFAULT_STATE_PATH

    def enabled_sources(self) -> list[SourceConfig]:
        return [s for s in self.sources if s.enabled]

    def validate(self) -> list[str]:
        problems = []
        if not self.telegram_token:
            problems.append(
                "חסר טוקן טלגרם. הגדירי משתנה סביבה TELEGRAM_TOKEN "
                "(או telegram.token בקובץ הקונפיג)."
            )
        if not self.telegram_chat_id:
            problems.append(
                "חסר chat_id. הגדירי TELEGRAM_CHAT_ID — הריצי "
                "`python -m dira whoami` אחרי ששלחת הודעה לבוט."
            )
        if not self.enabled_sources():
            problems.append("אף מקור לא מופעל בקונפיג.")
        return problems


def _as_area(name: str, data: dict[str, Any]) -> AreaRule:
    return AreaRule(
        name=name,
        cities=[str(c) for c in data.get("cities", [])],
        min_price=data.get("min_price"),
        max_price=data.get("max_price"),
        priority=int(data.get("priority", 0)),
    )


def load(path: Path | str | None = None) -> Config:
    path = Path(path) if path else DEFAULT_CONFIG_PATH
    data: dict[str, Any] = {}
    if path.exists():
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    crit_raw = data.get("criteria", {}) or {}
    areas = [_as_area(name, cfg or {}) for name, cfg in (crit_raw.get("areas") or {}).items()]
    criteria = Criteria(
        min_rooms=float(crit_raw.get("min_rooms", 1.5)),
        max_rooms=float(crit_raw.get("max_rooms", 3.0)),
        min_price=crit_raw.get("min_price"),
        max_price=crit_raw.get("max_price", 4000),
        areas=areas,
        require_outdoor=bool(crit_raw.get("require_outdoor", False)),
        exclude_keywords=[str(k) for k in (crit_raw.get("exclude_keywords") or [])],
        reject_explicit_no_pets=bool(crit_raw.get("reject_explicit_no_pets", True)),
        min_score=int(crit_raw.get("min_score", 0)),
    )

    sources = [
        SourceConfig(
            name=name,
            enabled=bool((cfg or {}).get("enabled", True)),
            options={k: v for k, v in (cfg or {}).items() if k != "enabled"},
        )
        for name, cfg in (data.get("sources") or {}).items()
    ]

    tg = data.get("telegram", {}) or {}
    return Config(
        criteria=criteria,
        sources=sources,
        # משתנה סביבה תמיד גובר על הקובץ, כדי שסודות לא ישבו בגיט
        telegram_token=os.environ.get("TELEGRAM_TOKEN") or str(tg.get("token", "") or ""),
        telegram_chat_id=os.environ.get("TELEGRAM_CHAT_ID") or str(tg.get("chat_id", "") or ""),
        interval_minutes=int(data.get("interval_minutes", 20)),
        max_per_run=int(data.get("max_per_run", 12)),
        state_path=Path(os.environ.get("DIRA_STATE") or data.get("state_path") or DEFAULT_STATE_PATH),
    )
