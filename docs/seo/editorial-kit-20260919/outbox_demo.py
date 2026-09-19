"""Offline teaching model, NOT SimpleMemo production code or delivery evidence.

Two SQLite files model a local queue and an idempotent receiving service.
A receipt can be lost after the service commits. Retrying the same identifier
must not duplicate the service-side row. This is NOT an SMTP/exactly-once claim.
No network, credentials, purchases, or real user data are used.
Run: python3 outbox_demo.py
"""
from __future__ import annotations
import sqlite3
import tempfile
import unittest
from pathlib import Path


class LostReceipt(Exception):
    pass


class Model:
    def __init__(self, root: Path):
        self.queue = sqlite3.connect(root / "queue.sqlite")
        self.service = sqlite3.connect(root / "service.sqlite")
        self.queue.execute("CREATE TABLE IF NOT EXISTS queue (id TEXT PRIMARY KEY, body TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','acknowledged')))")
        self.service.execute("CREATE TABLE IF NOT EXISTS received (id TEXT PRIMARY KEY, body TEXT NOT NULL)")

    def close(self):
        self.queue.close()
        self.service.close()

    def enqueue(self, key: str, body: str):
        if not isinstance(key, str) or not key.strip() or not isinstance(body, str) or not body.strip():
            raise ValueError("identifier and body must be nonempty strings")
        with self.queue:
            prior = self.queue.execute("SELECT body FROM queue WHERE id=?", (key,)).fetchone()
            if prior and prior[0] != body:
                raise ValueError("identifier reused for different content")
            self.queue.execute("INSERT OR IGNORE INTO queue VALUES (?, ?, 'pending')", (key, body))

    def deliver(self, key: str, *, online: bool = True, lose_receipt: bool = False):
        row = self.queue.execute("SELECT body, state FROM queue WHERE id=?", (key,)).fetchone()
        if row is None:
            raise KeyError(key)
        if row[1] == "acknowledged":
            return
        if not online:
            raise ConnectionError("offline; queue stays pending")
        with self.service:
            prior = self.service.execute("SELECT body FROM received WHERE id=?", (key,)).fetchone()
            if prior and prior[0] != row[0]:
                raise ValueError("service identifier/content conflict")
            self.service.execute("INSERT OR IGNORE INTO received VALUES (?, ?)", (key, row[0]))
        if lose_receipt:
            raise LostReceipt("service committed; local acknowledgement unknown")
        with self.queue:
            self.queue.execute("UPDATE queue SET state='acknowledged' WHERE id=?", (key,))

    def state(self, key: str):
        row = self.queue.execute("SELECT state FROM queue WHERE id=?", (key,)).fetchone()
        return None if row is None else row[0]

    def received_count(self):
        return self.service.execute("SELECT count(*) FROM received").fetchone()[0]


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.model = Model(self.root)

    def tearDown(self):
        self.model.close()
        self.directory.cleanup()

    def test_normal_acknowledgement(self):
        self.model.enqueue("sample-1", "Synthetic note")
        self.model.deliver("sample-1")
        self.assertEqual(self.model.state("sample-1"), "acknowledged")
        self.assertEqual(self.model.received_count(), 1)

    def test_lost_receipt_survives_restart(self):
        self.model.enqueue("sample-2", "合成メモ 📒")
        with self.assertRaises(LostReceipt):
            self.model.deliver("sample-2", lose_receipt=True)
        self.assertEqual(self.model.state("sample-2"), "pending")
        self.assertEqual(self.model.received_count(), 1)
        self.model.close()
        self.model = Model(self.root)
        self.model.deliver("sample-2")
        self.assertEqual(self.model.received_count(), 1)
        self.assertEqual(self.model.state("sample-2"), "acknowledged")

    def test_offline_remains_pending(self):
        self.model.enqueue("sample-3", "Offline example")
        with self.assertRaises(ConnectionError):
            self.model.deliver("sample-3", online=False)
        self.assertEqual(self.model.state("sample-3"), "pending")
        self.assertEqual(self.model.received_count(), 0)

    def test_reused_identifier_cannot_change_content(self):
        self.model.enqueue("sample-4", "Original")
        with self.assertRaises(ValueError):
            self.model.enqueue("sample-4", "Different")

    def test_same_body_with_distinct_ids_is_two_notes(self):
        for key in ("sample-5a", "sample-5b"):
            self.model.enqueue(key, "Intentional duplicate text")
            self.model.deliver(key)
            self.model.deliver(key)
        self.assertEqual(self.model.received_count(), 2)

    def test_blank_input_is_rejected(self):
        with self.assertRaises(ValueError):
            self.model.enqueue("", "Example")
        with self.assertRaises(ValueError):
            self.model.enqueue("sample-6", "  ")
        self.assertEqual(self.model.received_count(), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
