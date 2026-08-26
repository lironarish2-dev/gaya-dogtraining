"""רישום המקורות. הוספת מקור חדש = פונקציית fetch אחת + שורה כאן."""

from __future__ import annotations

from typing import Any, Callable

from ..models import Listing
from . import demo, facebook, homeless, yad2

FetchFn = Callable[[dict[str, Any]], list[Listing]]

REGISTRY: dict[str, FetchFn] = {
    "homeless": homeless.fetch,
    "yad2": yad2.fetch,
    "facebook": facebook.fetch,
    "demo": demo.fetch,
}


def get(name: str) -> FetchFn:
    if name not in REGISTRY:
        known = ", ".join(sorted(REGISTRY))
        raise KeyError(f"מקור לא מוכר: {name}. מקורות זמינים: {known}")
    return REGISTRY[name]
