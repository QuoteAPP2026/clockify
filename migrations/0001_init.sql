CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS punches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  shop_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT,
  edited INTEGER NOT NULL DEFAULT 0,
  edited_at TEXT,
  FOREIGN KEY (staff_id) REFERENCES staff(id),
  FOREIGN KEY (shop_id) REFERENCES shops(id)
);

INSERT OR IGNORE INTO shops (id, name) VALUES ('a', 'Shop A');
INSERT OR IGNORE INTO shops (id, name) VALUES ('b', 'Shop B');
