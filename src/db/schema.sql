-- ============================================================================
-- Weekly Product Review Pulse — Database Schema
-- ============================================================================
-- Auto-applied on first startup when pulse.db does not exist.
-- See: src/db/store.ts
-- ============================================================================

-- Enable WAL mode for better concurrent read/write performance
PRAGMA journal_mode = WAL;

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Run Log
-- ---------------------------------------------------------------------------
-- One row per pipeline run. Uniquely keyed by (product, iso_year, iso_week)
-- to enforce idempotency — re-running the same week is a no-op.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS run_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    product           TEXT    NOT NULL,
    iso_year          INTEGER NOT NULL,
    iso_week          INTEGER NOT NULL,
    run_started_at    TEXT    NOT NULL,                                              -- ISO 8601 UTC
    run_finished_at   TEXT,                                                          -- ISO 8601 UTC
    status            TEXT    NOT NULL CHECK(status IN ('running','success','failed','partial')),
    reviews_fetched   INTEGER,
    clusters_found    INTEGER,
    doc_id            TEXT,
    doc_heading_id    TEXT,
    doc_section_url   TEXT,
    email_message_id  TEXT,
    email_mode        TEXT    CHECK(email_mode IN ('sent','draft','skipped')),
    error_message     TEXT,
    UNIQUE(product, iso_year, iso_week)
);

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Cached reviews for audit trail and re-analysis. Deduplicated by
-- (source, body) so the same review is never stored twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT    NOT NULL CHECK(source IN ('app_store','play_store')),
    app_id      TEXT    NOT NULL,
    rating      INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    title       TEXT,
    body        TEXT    NOT NULL,
    raw_body    TEXT    NOT NULL,
    date        TEXT    NOT NULL,                                                    -- ISO 8601
    fetched_at  TEXT    NOT NULL,                                                    -- ISO 8601 UTC
    iso_year    INTEGER NOT NULL,
    iso_week    INTEGER NOT NULL,
    UNIQUE(source, body)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_run_log_lookup
    ON run_log(product, iso_year, iso_week);

CREATE INDEX IF NOT EXISTS idx_reviews_week
    ON reviews(iso_year, iso_week);

CREATE INDEX IF NOT EXISTS idx_reviews_source
    ON reviews(source, app_id);
