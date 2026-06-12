import { StoredReview } from '../db/store.js';
import { getISOWeekAndYear } from '../utils/date.js';
import { scrubPII } from '../safety/pii-scrubber.js';
import { franc } from 'franc-min';

const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function isValidReview(title: string | null, body: string): boolean {
  if (!body) return false;

  const words = body.trim().split(/\s+/);
  if (words.length < 8) return false;

  if (EMOJI_REGEX.test(body)) return false;
  if (title && EMOJI_REGEX.test(title)) return false;

  const lang = franc(body);
  if (lang !== 'eng') return false;

  return true;
}

export function normalizeAppStoreReview(raw: any, fetchedAt: Date): Omit<StoredReview, 'id'> | null {
  if (!isValidReview(raw.title, raw.body || '')) {
    return null;
  }

  const { scrubbed: scrubbedBody } = scrubPII(raw.body || '');
  const { scrubbed: scrubbedTitle } = scrubPII(raw.title || '');
  const dateObj = new Date(raw.date);
  const { iso_year, iso_week } = getISOWeekAndYear(dateObj);

  return {
    source: 'app_store',
    app_id: raw.app_id,
    rating: raw.rating,
    title: scrubbedTitle,
    body: scrubbedBody,
    raw_body: raw.body || '',
    date: dateObj.toISOString(),
    fetched_at: fetchedAt.toISOString(),
    iso_year,
    iso_week,
  };
}

export function normalizePlayStoreReview(raw: any, fetchedAt: Date): Omit<StoredReview, 'id'> | null {
  if (!isValidReview(raw.title, raw.body || '')) {
    return null;
  }

  const { scrubbed: scrubbedBody } = scrubPII(raw.body || '');
  const { scrubbed: scrubbedTitle } = scrubPII(raw.title || '');
  const dateObj = new Date(raw.date);
  const { iso_year, iso_week } = getISOWeekAndYear(dateObj);

  return {
    source: 'play_store',
    app_id: raw.app_id,
    rating: raw.rating,
    title: scrubbedTitle || null,
    body: scrubbedBody,
    raw_body: raw.body || '',
    date: dateObj.toISOString(),
    fetched_at: fetchedAt.toISOString(),
    iso_year,
    iso_week,
  };
}
