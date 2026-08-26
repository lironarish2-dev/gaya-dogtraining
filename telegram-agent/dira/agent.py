"""הלב של הסוכן — סריקה אחת, מקצה לקצה."""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .format import listing_message
from .matching import rank
from .models import Listing
from .sources import get
from .store import SeenStore
from .telegram import Telegram, TelegramError


@dataclass
class ScanResult:
    fetched: int = 0
    matched: int = 0
    new: int = 0
    sent: int = 0
    errors: list[str] = field(default_factory=list)
    per_source: dict[str, int] = field(default_factory=dict)

    def describe(self) -> str:
        parts = [f"{self.fetched} נסרקו", f"{self.matched} מתאימות", f"{self.new} חדשות"]
        if self.sent:
            parts.append(f"{self.sent} נשלחו")
        if self.errors:
            parts.append(f"{len(self.errors)} שגיאות")
        return " · ".join(parts)


def collect(config: Config) -> tuple[list[Listing], list[str], dict[str, int]]:
    """אוסף מכל המקורות. כשל במקור אחד לא מפיל את השאר."""
    listings: list[Listing] = []
    errors: list[str] = []
    per_source: dict[str, int] = {}

    for source in config.enabled_sources():
        try:
            found = get(source.name)(source.options)
        except Exception as exc:
            errors.append(f"{source.name}: {exc}")
            per_source[source.name] = 0
            continue
        per_source[source.name] = len(found)
        listings.extend(found)

    return listings, errors, per_source


def scan(config: Config, dry_run: bool = False, notify: bool = True) -> ScanResult:
    listings, errors, per_source = collect(config)
    result = ScanResult(
        fetched=len(listings), errors=errors, per_source=per_source
    )

    ranked = rank(listings, config.criteria)
    result.matched = len(ranked)

    store = SeenStore(config.state_path)
    fresh = [(l, v) for l, v in ranked if not store.has(l.key)]
    result.new = len(fresh)

    if dry_run:
        return result

    telegram = Telegram(config.telegram_token, config.telegram_chat_id) if notify else None

    for listing, verdict in fresh[: config.max_per_run]:
        if telegram is not None:
            try:
                telegram.send(listing_message(listing, verdict))
                result.sent += 1
            except TelegramError as exc:
                result.errors.append(f"טלגרם: {exc}")
                break  # אם טלגרם נפל, אין טעם להמשיך — והמודעה לא תסומן כנשלחה
        store.add(listing.key)

    # מודעות שנחתכו בגלל max_per_run יישארו לא מסומנות, ויישלחו בריצה הבאה
    store.prune()
    store.save()
    return result
