"""אחסון מודעות שכבר נשלחו, כדי לא להתריע פעמיים."""

from __future__ import annotations

import json
import time
from pathlib import Path


class SeenStore:
    """קובץ JSON פשוט: מפתח מודעה -> חותמת זמן ראשונה.

    נבחר JSON ולא בסיס נתונים כדי שהמצב יהיה קריא, ניתן לעריכה ידנית,
    ושאפשר יהיה לשמור אותו כארטיפקט ב-GitHub Actions.
    """

    def __init__(self, path: Path | str, ttl_days: int = 120):
        self.path = Path(path)
        self.ttl_seconds = ttl_days * 86400
        self._data: dict[str, float] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            # מצב פגום עדיף לאפס מאשר להפיל את הריצה
            self._data = {}
            return
        if isinstance(raw, dict):
            self._data = {str(k): float(v) for k, v in raw.items() if isinstance(v, (int, float))}

    def has(self, key: str) -> bool:
        return key in self._data

    def add(self, key: str) -> None:
        self._data.setdefault(key, time.time())

    def prune(self) -> int:
        """מוחק רשומות ישנות. מחזיר כמה נמחקו."""
        cutoff = time.time() - self.ttl_seconds
        stale = [k for k, ts in self._data.items() if ts < cutoff]
        for key in stale:
            del self._data[key]
        return len(stale)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False, indent=0), encoding="utf-8")
        tmp.replace(self.path)  # כתיבה אטומית, כדי שהפסקה באמצע לא תשחית את הקובץ

    def __len__(self) -> int:
        return len(self._data)
