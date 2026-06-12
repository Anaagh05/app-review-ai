import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';

let db: Database.Database | null = null;

export function initDb(): Database.Database {
  if (db) return db;

  const config = getConfig();
  const dbPath = config.db.path;
  const dbDir = path.dirname(dbPath);

  // Ensure directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbExists = fs.existsSync(dbPath);
  db = new Database(dbPath);

  // Enable WAL mode
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Auto-migrate on first creation
  if (!dbExists || fs.statSync(dbPath).size === 0) {
    const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schema);
    } else {
      console.warn(`Schema file not found at ${schemaPath}`);
    }
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ---------------------------------------------------------------------------
// Run Log Operations
// ---------------------------------------------------------------------------

export interface RunLog {
  id?: number;
  product: string;
  iso_year: number;
  iso_week: number;
  run_started_at: string;
  run_finished_at?: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  reviews_fetched?: number | null;
  clusters_found?: number | null;
  doc_id?: string | null;
  doc_heading_id?: string | null;
  doc_section_url?: string | null;
  email_message_id?: string | null;
  email_mode?: 'sent' | 'draft' | 'skipped' | null;
  error_message?: string | null;
}

export function insertRun(run: Omit<RunLog, 'id'>): number {
  const database = initDb();
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO run_log (
      product, iso_year, iso_week, run_started_at, run_finished_at,
      status, reviews_fetched, clusters_found, doc_id, doc_heading_id,
      doc_section_url, email_message_id, email_mode, error_message
    ) VALUES (
      @product, @iso_year, @iso_week, @run_started_at, @run_finished_at,
      @status, @reviews_fetched, @clusters_found, @doc_id, @doc_heading_id,
      @doc_section_url, @email_message_id, @email_mode, @error_message
    )
  `);
  const info = stmt.run(run);
  return info.lastInsertRowid as number;
}

export function updateRun(id: number, updates: Partial<Omit<RunLog, 'id' | 'product' | 'iso_year' | 'iso_week'>>): void {
  const database = initDb();
  
  const setClauses: string[] = [];
  const params: Record<string, any> = { id };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  if (setClauses.length === 0) return;

  const stmt = database.prepare(`
    UPDATE run_log
    SET ${setClauses.join(', ')}
    WHERE id = @id
  `);
  stmt.run(params);
}

export function getRun(product: string, iso_year: number, iso_week: number): RunLog | undefined {
  const database = initDb();
  const stmt = database.prepare(`
    SELECT * FROM run_log
    WHERE product = ? AND iso_year = ? AND iso_week = ?
  `);
  return stmt.get(product, iso_year, iso_week) as RunLog | undefined;
}

// ---------------------------------------------------------------------------
// Reviews Operations
// ---------------------------------------------------------------------------

export interface StoredReview {
  id?: number;
  source: 'app_store' | 'play_store';
  app_id: string;
  rating: number;
  title?: string | null;
  body: string;
  raw_body: string;
  date: string;
  fetched_at: string;
  iso_year: number;
  iso_week: number;
}

export function insertReviews(reviews: Omit<StoredReview, 'id'>[]): void {
  const database = initDb();
  const stmt = database.prepare(`
    INSERT OR IGNORE INTO reviews (
      source, app_id, rating, title, body, raw_body,
      date, fetched_at, iso_year, iso_week
    ) VALUES (
      @source, @app_id, @rating, @title, @body, @raw_body,
      @date, @fetched_at, @iso_year, @iso_week
    )
  `);

  const insertMany = database.transaction((revs: Omit<StoredReview, 'id'>[]) => {
    let inserted = 0;
    for (const rev of revs) {
      const info = stmt.run(rev);
      if (info.changes > 0) inserted++;
    }
    return inserted;
  });

  insertMany(reviews);
}

export function getReviewsByWeek(iso_year: number, iso_week: number): StoredReview[] {
  const database = initDb();
  const stmt = database.prepare(`
    SELECT * FROM reviews
    WHERE iso_year = ? AND iso_week = ?
  `);
  return stmt.all(iso_year, iso_week) as StoredReview[];
}

/**
 * Loads all reviews ingested within the last `windowWeeks` weeks from the
 * reference date. This is the correct query for clustering, which should
 * analyse the full rolling window, not just the current week.
 */
export function getReviewsInWindow(windowWeeks: number): StoredReview[] {
  const database = initDb();
  // Use cutoff date so we don't need complex ISO week arithmetic across year boundaries
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowWeeks * 7);
  const stmt = database.prepare(`
    SELECT * FROM reviews
    WHERE date >= ?
    ORDER BY date DESC
  `);
  return stmt.all(cutoff.toISOString()) as StoredReview[];
}


// ---------------------------------------------------------------------------
// Delivery Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if a successful delivery already exists for this product + week.
 * Used as the idempotency guard in the delivery phase.
 */
export async function hasDeliveredForWeek(
  product: string,
  isoYear: number,
  isoWeek: number
): Promise<boolean> {
  const database = initDb();
  const row = database
    .prepare(
      `SELECT id FROM run_log
       WHERE product = ? AND iso_year = ? AND iso_week = ?
         AND status = 'success' AND doc_section_url IS NOT NULL
       LIMIT 1`
    )
    .get(product, isoYear, isoWeek);
  return row !== undefined;
}

export interface DeliveryRecord {
  product: string;
  isoYear: number;
  isoWeek: number;
  anchor: string;
  docId: string;
  docUrl: string;
  draftId?: string;
  deliveredAt: Date;
}

/**
 * Upserts delivery metadata into run_log.
 * If a run_log row exists for this product/week, updates it.
 * Otherwise inserts a new success row.
 */
export async function recordDelivery(record: DeliveryRecord): Promise<void> {
  const database = initDb();
  const existing = database
    .prepare(
      `SELECT id FROM run_log WHERE product = ? AND iso_year = ? AND iso_week = ? LIMIT 1`
    )
    .get(record.product, record.isoYear, record.isoWeek) as { id: number } | undefined;

  const now = record.deliveredAt.toISOString();

  if (existing) {
    database
      .prepare(
        `UPDATE run_log
         SET status = 'success',
             run_finished_at = @now,
             doc_id = @docId,
             doc_heading_id = @anchor,
             doc_section_url = @docUrl,
             email_message_id = @draftId,
             email_mode = @emailMode
         WHERE id = @id`
      )
      .run({
        now,
        docId: record.docId,
        anchor: record.anchor,
        docUrl: record.docUrl,
        draftId: record.draftId ?? null,
        emailMode: record.draftId ? 'draft' : 'skipped',
        id: existing.id,
      });
  } else {
    database
      .prepare(
        `INSERT INTO run_log (
           product, iso_year, iso_week,
           run_started_at, run_finished_at, status,
           doc_id, doc_heading_id, doc_section_url,
           email_message_id, email_mode
         ) VALUES (
           @product, @isoYear, @isoWeek,
           @now, @now, 'success',
           @docId, @anchor, @docUrl,
           @draftId, @emailMode
         )`
      )
      .run({
        product: record.product,
        isoYear: record.isoYear,
        isoWeek: record.isoWeek,
        now,
        docId: record.docId,
        anchor: record.anchor,
        docUrl: record.docUrl,
        draftId: record.draftId ?? null,
        emailMode: record.draftId ? 'draft' : 'skipped',
      });
  }
}
