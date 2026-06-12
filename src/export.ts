/**
 * Export — writes the latest report + run history as static JSON files
 * into dashboard/public/data/ so the Vercel frontend can read them.
 *
 * Called automatically after every successful pulse run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ReportPayload } from './delivery/formatter.js';

const DATA_DIR = path.resolve(process.cwd(), 'dashboard/public/data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface ExportedReport {
  product: string;
  isoWeek: number;
  isoYear: number;
  generatedAt: string;
  totalReviewsAnalyzed: number;
  reviewWindowWeeks: number;
  docUrl?: string;
  draftId?: string;
  themes: {
    name: string;
    description: string;
    reviewCount: number;
    avgRating?: number;
    representativeQuotes: string[];
    actionIdeas: string[];
  }[];
}

export interface RunHistoryEntry {
  id: number;
  product: string;
  isoWeek: number;
  isoYear: number;
  status: string;
  reviewsFetched: number | null;
  clustersFound: number | null;
  runStartedAt: string;
  runFinishedAt: string | null;
  docUrl: string | null;
  emailMode: string | null;
  errorMessage: string | null;
}

export function exportReport(
  report: ReportPayload,
  docUrl?: string,
  draftId?: string
): void {
  ensureDir();

  const exported: ExportedReport = {
    product: report.product,
    isoWeek: report.isoWeek,
    isoYear: report.isoYear,
    generatedAt: report.generatedAt.toISOString(),
    totalReviewsAnalyzed: report.totalReviewsAnalyzed,
    reviewWindowWeeks: report.reviewWindowWeeks,
    docUrl,
    draftId,
    themes: report.themes.map((t) => ({
      name: t.name,
      description: t.description,
      reviewCount: t.reviewCount,
      representativeQuotes: t.representativeQuotes,
      actionIdeas: t.actionIdeas,
    })),
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'latest-report.json'),
    JSON.stringify(exported, null, 2)
  );

  console.log(`[export] Latest report written to dashboard/public/data/latest-report.json`);
}

export function exportRunHistory(runs: any[]): void {
  ensureDir();

  const history: RunHistoryEntry[] = runs.map((r) => ({
    id: r.id,
    product: r.product,
    isoWeek: r.iso_week,
    isoYear: r.iso_year,
    status: r.status,
    reviewsFetched: r.reviews_fetched ?? null,
    clustersFound: r.clusters_found ?? null,
    runStartedAt: r.run_started_at,
    runFinishedAt: r.run_finished_at ?? null,
    docUrl: r.doc_section_url ?? null,
    emailMode: r.email_mode ?? null,
    errorMessage: r.error_message ?? null,
  }));

  fs.writeFileSync(
    path.join(DATA_DIR, 'run-history.json'),
    JSON.stringify(history, null, 2)
  );

  console.log(`[export] Run history written to dashboard/public/data/run-history.json`);
}
