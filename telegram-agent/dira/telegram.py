"""לקוח טלגרם מינימלי — רק מה שהסוכן צריך."""

from __future__ import annotations

import time
from typing import Any, Optional

import requests

API = "https://api.telegram.org/bot{token}/{method}"


class TelegramError(RuntimeError):
    pass


class Telegram:
    def __init__(self, token: str, chat_id: str = "", timeout: int = 20):
        self.token = token
        self.chat_id = chat_id
        self.timeout = timeout

    def _call(self, method: str, **params: Any) -> dict[str, Any]:
        url = API.format(token=self.token, method=method)
        last_error: Optional[str] = None
        for attempt in range(3):
            try:
                resp = requests.post(url, json=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = str(exc)
                time.sleep(2 ** attempt)
                continue

            if resp.status_code == 429:
                # טלגרם אומר לנו במפורש כמה להמתין
                retry_after = resp.json().get("parameters", {}).get("retry_after", 5)
                time.sleep(retry_after + 1)
                continue

            payload = resp.json()
            if payload.get("ok"):
                return payload.get("result", {})
            last_error = payload.get("description", resp.text)
            if resp.status_code < 500:
                break  # שגיאת לקוח לא תיפתר בניסיון חוזר
            time.sleep(2 ** attempt)

        raise TelegramError(f"{method} נכשל: {last_error}")

    def send(self, text: str, chat_id: str = "", preview: bool = True) -> dict[str, Any]:
        return self._call(
            "sendMessage",
            chat_id=chat_id or self.chat_id,
            text=text,
            parse_mode="HTML",
            disable_web_page_preview=not preview,
        )

    def get_updates(self, offset: int = 0, timeout: int = 25) -> list[dict[str, Any]]:
        url = API.format(token=self.token, method="getUpdates")
        try:
            resp = requests.post(
                url,
                json={"offset": offset, "timeout": timeout},
                timeout=timeout + 10,
            )
            payload = resp.json()
        except (requests.RequestException, ValueError) as exc:
            raise TelegramError(f"getUpdates נכשל: {exc}") from exc
        if not payload.get("ok"):
            raise TelegramError(payload.get("description", "getUpdates נכשל"))
        return payload.get("result", [])

    def me(self) -> dict[str, Any]:
        return self._call("getMe")
