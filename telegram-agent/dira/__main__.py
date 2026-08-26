"""שורת הפקודה של הסוכן."""

from __future__ import annotations

import argparse
import sys
import time

from .agent import collect, scan
from .config import load
from .format import listing_message
from .matching import evaluate, rank
from .telegram import Telegram, TelegramError

HELP_TEXT = (
    "<b>סוכן הדירות</b>\n"
    "/scan — לסרוק עכשיו\n"
    "/status — מה מוגדר ומתי נסרק לאחרונה\n"
    "/pause — להשתיק התראות\n"
    "/resume — להחזיר התראות\n"
    "/help — התפריט הזה"
)


def _print_result(result, verbose: bool = False) -> None:
    print(result.describe())
    for name, count in sorted(result.per_source.items()):
        print(f"  {name}: {count}")
    for err in result.errors:
        print(f"  שגיאה — {err}", file=sys.stderr)


def cmd_check(args) -> int:
    config = load(args.config)
    problems = config.validate()
    print(f"מקורות מופעלים: {', '.join(s.name for s in config.enabled_sources()) or 'אין'}")
    print(f"טווח חדרים: {config.criteria.min_rooms:g}–{config.criteria.max_rooms:g}")
    print(f"תקרת מחיר כללית: {config.criteria.max_price}")
    for area in config.criteria.areas:
        low, high = area.min_price, area.max_price
        print(f"  אזור {area.name}: {low or '—'}–{high or '—'} ({len(area.cities)} יישובים)")
    print(f"קובץ מצב: {config.state_path}")
    if problems:
        print("\nבעיות:", file=sys.stderr)
        for problem in problems:
            print(f"  • {problem}", file=sys.stderr)
        return 1
    print("\nהכול תקין.")
    return 0


def cmd_scan(args) -> int:
    config = load(args.config)
    if not args.dry_run:
        problems = config.validate()
        if problems:
            for problem in problems:
                print(f"• {problem}", file=sys.stderr)
            return 1
    result = scan(config, dry_run=args.dry_run, notify=not args.no_notify)
    _print_result(result)
    return 1 if result.errors and result.sent == 0 else 0


def cmd_preview(args) -> int:
    """מראה מה היה נשלח, בלי לשלוח ובלי לסמן כנקרא."""
    config = load(args.config)
    listings, errors, per_source = collect(config)
    print(f"נסרקו {len(listings)} מודעות: " +
          ", ".join(f"{k}={v}" for k, v in sorted(per_source.items())))
    for err in errors:
        print(f"שגיאה — {err}", file=sys.stderr)

    ranked = rank(listings, config.criteria)
    print(f"\n{len(ranked)} מתאימות:\n")
    for listing, verdict in ranked:
        print(f"[{verdict.score:3}] {listing.city} · {listing.street} — {verdict.summary}")
        print(f"      {listing.url}")

    if args.rejected:
        print("\nנפסלו:")
        for listing in listings:
            verdict = evaluate(listing, config.criteria)
            if not verdict.matched:
                print(f"  {listing.city or '?'} — {'; '.join(verdict.rejections)}")
    return 0


def cmd_whoami(args) -> int:
    """מוצא את ה-chat_id שלך מתוך ההודעה האחרונה ששלחת לבוט."""
    config = load(args.config)
    if not config.telegram_token:
        print("חסר TELEGRAM_TOKEN.", file=sys.stderr)
        return 1
    telegram = Telegram(config.telegram_token)
    try:
        bot = telegram.me()
        print(f"הבוט: @{bot.get('username', '?')}")
        updates = telegram.get_updates(timeout=1)
    except TelegramError as exc:
        print(f"שגיאה: {exc}", file=sys.stderr)
        return 1

    chats = {}
    for update in updates:
        message = update.get("message") or update.get("channel_post") or {}
        chat = message.get("chat") or {}
        if chat.get("id"):
            chats[chat["id"]] = chat.get("title") or chat.get("first_name") or ""
    if not chats:
        print("לא נמצאו הודעות. שלחי לבוט הודעה בטלגרם ונסי שוב.")
        return 1
    for chat_id, name in chats.items():
        print(f"chat_id: {chat_id}  ({name})")
    return 0


def cmd_login_facebook(args) -> int:
    from .sources.facebook import login

    login(headless=False)
    return 0


def cmd_bot(args) -> int:
    """ריצה רציפה: סורק כל X דקות ומגיב לפקודות בטלגרם."""
    config = load(args.config)
    problems = config.validate()
    if problems:
        for problem in problems:
            print(f"• {problem}", file=sys.stderr)
        return 1

    telegram = Telegram(config.telegram_token, config.telegram_chat_id)
    interval = config.interval_minutes * 60
    offset = 0
    paused = False
    last_scan = 0.0
    last_result = None

    print(f"הסוכן פועל. סריקה כל {config.interval_minutes} דקות. Ctrl+C לעצירה.")
    telegram.send("🏡 סוכן הדירות עלה לאוויר.\n\n" + HELP_TEXT)

    while True:
        now = time.time()
        due = now - last_scan >= interval

        if due and not paused:
            try:
                last_result = scan(config)
                print(f"[{time.strftime('%H:%M')}] {last_result.describe()}")
            except Exception as exc:
                print(f"סריקה נכשלה: {exc}", file=sys.stderr)
            last_scan = now
        elif due:
            last_scan = now  # במצב השתקה מדלגים אבל לא צוברים חוב

        try:
            updates = telegram.get_updates(offset=offset, timeout=20)
        except TelegramError as exc:
            print(f"טלגרם: {exc}", file=sys.stderr)
            time.sleep(10)
            continue

        for update in updates:
            offset = update["update_id"] + 1
            message = update.get("message") or {}
            text = (message.get("text") or "").strip().lower()
            chat_id = str((message.get("chat") or {}).get("id", ""))
            if chat_id != str(config.telegram_chat_id):
                continue  # מתעלמים מכל מי שאינו הבעלים

            if text.startswith("/scan"):
                telegram.send("סורק…")
                try:
                    last_result = scan(config)
                    last_scan = time.time()
                    telegram.send(f"סיימתי: {last_result.describe()}")
                except Exception as exc:
                    telegram.send(f"הסריקה נכשלה: {exc}")
            elif text.startswith("/pause"):
                paused = True
                telegram.send("מושתק. /resume כדי להחזיר.")
            elif text.startswith("/resume"):
                paused = False
                telegram.send("חזרתי לסרוק.")
            elif text.startswith("/status"):
                when = time.strftime("%H:%M", time.localtime(last_scan)) if last_scan else "עוד לא"
                sources = ", ".join(s.name for s in config.enabled_sources())
                telegram.send(
                    f"מצב: {'מושתק' if paused else 'פעיל'}\n"
                    f"סריקה אחרונה: {when}\n"
                    f"תוצאה אחרונה: {last_result.describe() if last_result else '—'}\n"
                    f"מקורות: {sources}"
                )
            elif text.startswith("/help") or text.startswith("/start"):
                telegram.send(HELP_TEXT)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dira", description="סוכן דירות לטלגרם")
    parser.add_argument("-c", "--config", default=None, help="נתיב לקובץ הקונפיג")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="בדיקת קונפיג").set_defaults(func=cmd_check)

    p_scan = sub.add_parser("scan", help="סריקה אחת ושליחת חדשות")
    p_scan.add_argument("--dry-run", action="store_true", help="בלי לשלוח ובלי לשמור מצב")
    p_scan.add_argument("--no-notify", action="store_true", help="לסמן כנקרא בלי לשלוח")
    p_scan.set_defaults(func=cmd_scan)

    p_prev = sub.add_parser("preview", help="להציג מה היה נשלח, בלי לשלוח")
    p_prev.add_argument("--rejected", action="store_true", help="להראות גם מה נפסל ולמה")
    p_prev.set_defaults(func=cmd_preview)

    sub.add_parser("whoami", help="למצוא את ה-chat_id שלך").set_defaults(func=cmd_whoami)
    sub.add_parser("bot", help="ריצה רציפה עם פקודות").set_defaults(func=cmd_bot)
    sub.add_parser("login-facebook", help="התחברות חד-פעמית לפייסבוק").set_defaults(
        func=cmd_login_facebook
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args) or 0
    except KeyboardInterrupt:
        print("\nנעצר.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
