CREATE TABLE IF NOT EXISTS winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu TEXT NOT NULL,
  card_id INTEGER NOT NULL,
  card_name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_winners_menu_created_at
ON winners(menu, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_winners_menu_card
ON winners(menu, card_id);

CREATE TABLE IF NOT EXISTS quiz_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abbreviation TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_words_abbreviation
ON quiz_words(abbreviation);
