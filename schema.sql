CREATE TABLE IF NOT EXISTS favorite_winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES favorite_topics(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES favorite_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorite_winners_topic_created_at
ON favorite_winners(topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorite_winners_topic_card
ON favorite_winners(topic_id, card_id);

CREATE TABLE IF NOT EXISTS favorite_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  country TEXT,
  icon TEXT,
  era INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_topics_value
ON favorite_topics(value);

CREATE INDEX IF NOT EXISTS idx_favorite_topics_era
ON favorite_topics(era);

CREATE TABLE IF NOT EXISTS favorite_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES favorite_topics(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorite_cards_topic_id
ON favorite_cards(topic_id);

CREATE TABLE IF NOT EXISTS quiz_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_topics_title
ON quiz_topics(title);

CREATE TABLE IF NOT EXISTS quiz_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  abbreviation TEXT NOT NULL,
  full_name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (topic_id) REFERENCES quiz_topics(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_words_topic_abbreviation
ON quiz_words(topic_id, abbreviation);

CREATE INDEX IF NOT EXISTS idx_quiz_words_topic_id
ON quiz_words(topic_id);
