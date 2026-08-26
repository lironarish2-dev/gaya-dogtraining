import sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dira.store import SeenStore


def test_roundtrip(tmp_path):
    path = tmp_path / "seen.json"
    store = SeenStore(path)
    assert not store.has("a:1")
    store.add("a:1")
    store.save()

    assert SeenStore(path).has("a:1")


def test_corrupt_file_does_not_crash(tmp_path):
    path = tmp_path / "seen.json"
    path.write_text("{ this is not json", encoding="utf-8")
    assert len(SeenStore(path)) == 0


def test_prune_drops_old_entries(tmp_path):
    store = SeenStore(tmp_path / "seen.json", ttl_days=1)
    store._data["old:1"] = time.time() - 10 * 86400
    store.add("new:1")
    assert store.prune() == 1
    assert store.has("new:1") and not store.has("old:1")


def test_add_is_idempotent(tmp_path):
    store = SeenStore(tmp_path / "seen.json")
    store.add("a:1")
    first = store._data["a:1"]
    store.add("a:1")
    assert store._data["a:1"] == first
