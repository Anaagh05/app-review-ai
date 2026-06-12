#!/usr/bin/env node
/**
 * Phase 6 — CLI Orchestrator
 *
 * Entry point: `npm run pulse:run` or `npx tsx src/cli.ts run`
 *
 * Commands:
 *   run              Execute full pipeline for the current ISO week
 *   run --dry-run    Full pipeline but skip delivery (print report to stdout)
 *   backfill         Run for a specific past week (--year, --week)
 *   status           Pretty-print recent run_log entries
 *
 * Pipeline order:
 *   1.  Load & validate config
 *   2.  Init SQLite DB (auto-migrate schema)
 *   3.  Idempotency check (skip if already delivered this week)
 *   4.  Ingest reviews (App Store + Play Store via MCP servers)
 *   5.  Load normalized reviews from DB for current week
 *   6.  Embed reviews (MiniLM model)
 *   7.  Cluster (UMAP + HDBSCAN → top-K themes)
 *   8.  LLM summarize (Groq → named themes + validated quotes)
 *   9.  [dry-run exits here, prints report JSON]
 *   10. Append report to Google Doc via MCP server
 *   11. Create Gmail draft via MCP server (if recipients configured)
 *   12. Record delivery metadata in run_log
 *   13. Print final summary
 *
 * Exit codes: 0 = success, 1 = fatal error, 2 = partial (doc OK, email failed)
 */

import { Command } from 'commander';
import { loadConfig, getConfig } from './config.js';
import { initDb, getReviewsByWeek, getReviewsInWindow, getRun, insertRun, updateRun } from './db/store.js';
import { ingestReviews } from './ingestion/ingest.js';
import { embedReviews } from './analysis/embed.js';
import { clusterReviews } from './analysis/cluster.js';
import { analyzeAndSummarize } from './analysis/summarize.js';
import { deliverReport } from './delivery/deliver.js';
import { getISOWeekAndYear } from './utils/date.js';
import { formatReportAsPlainText } from './delivery/formatter.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

function step(n: number, total: number, msg: string) {
  console.log(`\n${bold(cyan(`[${n}/${total}]`))} ${bold(msg)}`);
}

function ok(msg: string) { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg: string) { console.log(`  ${yellow('⚠')} ${msg}`); }
function fail(msg: string) { console.log(`  ${red('✗')} ${msg}`); }

function printBanner() {
  console.log('\n' + bold('━'.repeat(55)));
  console.log(bold('  📊  WEEKLY REVIEW PULSE  '));
  console.log(bold('━'.repeat(55)));
}

function printSummary(data: {
  product: string;
  isoYear: number;
  isoWeek: number;
  reviewsIngested: number;
  themesFound: number;
  tokensUsed: number;
  docUrl?: string;
  draftId?: string;
  dryRun: boolean;
  elapsed: number;
}) {
  console.log('\n' + bold('━'.repeat(55)));
  console.log(bold('  ✅  RUN COMPLETE'));
  console.log(bold('━'.repeat(55)));
  console.log(`  Product      : ${bold(data.product)}`);
  console.log(`  Week         : ${data.isoWeek} / ${data.isoYear}`);
  console.log(`  Reviews      : ${bold(String(data.reviewsIngested))} ingested`);
  console.log(`  Themes       : ${bold(String(data.themesFound))} identified`);
  console.log(`  LLM tokens   : ${data.tokensUsed.toLocaleString()}`);
  if (data.dryRun) {
    console.log(`  Mode         : ${yellow('DRY RUN — no delivery')}`);
  } else {
    if (data.docUrl)  console.log(`  Google Doc   : ${cyan(data.docUrl)}`);
    if (data.draftId) console.log(`  Gmail draft  : ${dim(data.draftId)}`);
  }
  console.log(`  Elapsed      : ${(data.elapsed / 1000).toFixed(1)}s`);
  console.log(bold('━'.repeat(55)) + '\n');
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

interface RunOptions {
  dryRun: boolean;
  isoYear: number;
  isoWeek: number;
  verbose: boolean;
}

async function runPipeline(opts: RunOptions): Promise<void> {
  const TOTAL_STEPS = opts.dryRun ? 8 : 10;
  const startTime = Date.now();

  printBanner();
  console.log(dim(`  Week ${opts.isoWeek} / ${opts.isoYear}${opts.dryRun ? '  [DRY RUN]' : ''}`));

  // ── Step 1: Config & DB ───────────────────────────────────────────────────
  step(1, TOTAL_STEPS, 'Loading config & initialising database…');
  loadConfig();
  const config = getConfig();
  initDb();
  ok(`Config loaded — product: ${bold(config.product)}`);
  ok(`Database ready at ${dim(config.db.path)}`);

  // ── Step 2: Idempotency check ─────────────────────────────────────────────
  step(2, TOTAL_STEPS, 'Checking idempotency…');
  const existing = getRun(config.product, opts.isoYear, opts.isoWeek);
  if (existing?.status === 'success' && !opts.dryRun) {
    warn(`Already delivered for ${config.product} week ${opts.isoWeek}/${opts.isoYear}.`);
    warn('Use --force to re-run (not yet implemented). Exiting cleanly.');
    process.exit(0);
  }
  ok('No previous successful run found — proceeding.');

  // Record run start
  const runId = insertRun({
    product: config.product,
    iso_year: opts.isoYear,
    iso_week: opts.isoWeek,
    run_started_at: new Date().toISOString(),
    run_finished_at: null,
    status: 'running',
    reviews_fetched: null,
    clusters_found: null,
    doc_id: null,
    doc_heading_id: null,
    doc_section_url: null,
    email_message_id: null,
    email_mode: null,
    error_message: null,
  });

  try {
    // ── Step 3: Ingest reviews ──────────────────────────────────────────────
    step(3, TOTAL_STEPS, 'Ingesting reviews from App Store & Play Store…');
    let reviewsIngested = 0;
    try {
      reviewsIngested = await ingestReviews();
      ok(`${bold(String(reviewsIngested))} reviews ingested & stored.`);
      updateRun(runId, { reviews_fetched: reviewsIngested });
    } catch (err: any) {
      warn(`Ingestion error: ${err.message}`);
      warn('Attempting to use reviews already in the database for this week…');
    }

    // ── Step 4: Load reviews from DB ───────────────────────────────────────
    step(4, TOTAL_STEPS, 'Loading reviews from database…');
    // Load the full rolling window for clustering, not just the current week.
    // The weekly pulse analyses all recent reviews to find recurring themes.
    const storedReviews = getReviewsInWindow(config.reviewWindowWeeks);

    if (storedReviews.length === 0) {
      fail('No reviews found in the database for this period. Cannot continue.');
      fail('Run `npm run pulse:run` again after MCP servers are reachable.');
      updateRun(runId, { status: 'failed', error_message: 'No reviews in DB for this period' });
      process.exit(1);
    }
    ok(`${bold(String(storedReviews.length))} reviews loaded from DB (last ${config.reviewWindowWeeks} weeks).`);

    const totalReviews = storedReviews.length;

    // ── Step 5: Embed ───────────────────────────────────────────────────────
    step(5, TOTAL_STEPS, 'Generating sentence embeddings (MiniLM)…');
    const embeddings = await embedReviews(storedReviews);
    const validEmbeddings = embeddings.filter((e) => e.vector.some((v) => v !== 0));
    ok(`${bold(String(validEmbeddings.length))} reviews embedded (${embeddings.length - validEmbeddings.length} skipped — too short).`);

    // ── Step 6: Cluster ─────────────────────────────────────────────────────
    step(6, TOTAL_STEPS, 'Clustering reviews (UMAP + HDBSCAN)…');
    const clusters = clusterReviews(embeddings, config);

    if (clusters.length === 0) {
      warn('No clusters found. The report will have no themes.');
    } else {
      ok(`${bold(String(clusters.length))} clusters identified:`);
      clusters.forEach((c, i) => {
        console.log(`     ${i + 1}. ${c.size} reviews · avg ${c.avg_rating.toFixed(1)}★ · score ${c.rank_score.toFixed(0)}`);
      });
      updateRun(runId, { clusters_found: clusters.length });
    }

    // ── Step 7: LLM Summarize ───────────────────────────────────────────────
    step(7, TOTAL_STEPS, 'Summarizing themes with Groq LLM…');
    const { report, totalTokensUsed } = await analyzeAndSummarize(
      clusters,
      opts.isoYear,
      opts.isoWeek,
      totalReviews,
      config.reviewWindowWeeks,
    );
    ok(`${bold(String(report.themes.length))} themes generated.`);
    ok(`Tokens used: ${totalTokensUsed.toLocaleString()}`);

    report.themes.forEach((t, i) => {
      const quotes = t.representativeQuotes.length;
      console.log(`     ${i + 1}. ${bold(t.name)} — ${quotes} quote${quotes !== 1 ? 's' : ''} validated`);
    });

    // ── Step 8: Dry-run exit ────────────────────────────────────────────────
    if (opts.dryRun) {
      step(8, TOTAL_STEPS, 'DRY RUN — printing report (no delivery)…');
      console.log('\n' + dim('─'.repeat(55)));
      console.log(formatReportAsPlainText(report));
      console.log(dim('─'.repeat(55)));

      updateRun(runId, { status: 'success', run_finished_at: new Date().toISOString() });

      printSummary({
        product: config.product,
        isoYear: opts.isoYear,
        isoWeek: opts.isoWeek,
        reviewsIngested: totalReviews,
        themesFound: report.themes.length,
        tokensUsed: totalTokensUsed,
        dryRun: true,
        elapsed: Date.now() - startTime,
      });
      return;
    }

    // ── Step 9: Deliver to Google Doc ───────────────────────────────────────
    step(9, TOTAL_STEPS, 'Delivering report to Google Doc…');

    const docId = process.env.GOOGLE_DOC_ID;
    if (!docId || docId === 'PASTE_YOUR_DOC_ID_HERE') {
      fail('GOOGLE_DOC_ID is not set in .env. Cannot deliver to Google Docs.');
      updateRun(runId, { status: 'failed', error_message: 'GOOGLE_DOC_ID not configured' });
      process.exit(1);
    }

    const deliveryResult = await deliverReport({ report, docId });

    if (deliveryResult.skipped) {
      warn(`Delivery skipped: ${deliveryResult.reason}`);
    } else {
      ok(`Report appended to Google Doc.`);
      if (deliveryResult.docUrl) ok(`URL: ${cyan(deliveryResult.docUrl)}`);
      if (deliveryResult.draftId) ok(`Gmail draft ID: ${dim(deliveryResult.draftId)}`);
      updateRun(runId, {
        status: 'success',
        run_finished_at: new Date().toISOString(),
        doc_id: docId,
        doc_section_url: deliveryResult.docUrl,
        email_message_id: deliveryResult.draftId,
        email_mode: deliveryResult.draftId ? 'draft' : 'skipped',
      });
    }

    // ── Step 10: Done ───────────────────────────────────────────────────────
    step(10, TOTAL_STEPS, 'Run complete.');

    printSummary({
      product: config.product,
      isoYear: opts.isoYear,
      isoWeek: opts.isoWeek,
      reviewsIngested: totalReviews,
      themesFound: report.themes.length,
      tokensUsed: totalTokensUsed,
      docUrl: deliveryResult.docUrl,
      draftId: deliveryResult.draftId,
      dryRun: false,
      elapsed: Date.now() - startTime,
    });

  } catch (err: any) {
    fail(`Fatal error: ${err.message}`);
    if (opts.verbose) console.error(err);
    updateRun(runId, {
      status: 'failed',
      run_finished_at: new Date().toISOString(),
      error_message: err.message,
    });
    process.exit(1);
  }
}

// ─── Status command ───────────────────────────────────────────────────────────

function runStatus(): void {
  try {
    loadConfig();
    initDb();
  } catch (e: any) {
    console.error(red('Could not load config or DB: ' + e.message));
    process.exit(1);
  }

  // Read recent runs directly via better-sqlite3
  const Database = require('better-sqlite3');
  const config = getConfig();
  const db = new Database(config.db.path, { readonly: true });

  const rows = db
    .prepare(`SELECT * FROM run_log ORDER BY id DESC LIMIT 10`)
    .all() as any[];

  db.close();

  if (rows.length === 0) {
    console.log(yellow('\n  No runs recorded yet. Run `npm run pulse:run` to start.\n'));
    return;
  }

  console.log('\n' + bold('━'.repeat(75)));
  console.log(bold('  📋  RECENT RUNS'));
  console.log(bold('━'.repeat(75)));
  console.log(
    dim(
      `  ${'ID'.padEnd(4)} ${'Product'.padEnd(10)} ${'Wk'.padEnd(4)} ${'Year'.padEnd(6)} ${'Status'.padEnd(10)} ${'Reviews'.padEnd(9)} ${'Themes'.padEnd(8)} ${'Started'.padEnd(22)}`
    )
  );
  console.log(dim('  ' + '─'.repeat(73)));

  for (const row of rows) {
    const statusColour =
      row.status === 'success' ? green :
      row.status === 'running' ? cyan :
      row.status === 'partial' ? yellow : red;

    const started = row.run_started_at
      ? new Date(row.run_started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : '—';

    console.log(
      `  ${String(row.id).padEnd(4)} ` +
      `${(row.product ?? '—').padEnd(10)} ` +
      `${String(row.iso_week ?? '—').padEnd(4)} ` +
      `${String(row.iso_year ?? '—').padEnd(6)} ` +
      `${statusColour((row.status ?? '—').padEnd(10))} ` +
      `${String(row.reviews_fetched ?? '—').padEnd(9)} ` +
      `${String(row.clusters_found ?? '—').padEnd(8)} ` +
      `${dim(started)}`
    );

    if (row.doc_section_url) {
      console.log(`       ${dim('→ ' + row.doc_section_url)}`);
    }
    if (row.error_message) {
      console.log(`       ${red('✗ ' + row.error_message)}`);
    }
  }

  console.log(bold('━'.repeat(75)) + '\n');
}

// ─── CLI setup ────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('pulse')
  .description('Weekly Review Pulse — turns Groww app reviews into insight reports')
  .version('0.1.0');

// ── run command ──────────────────────────────────────────────────────────────
program
  .command('run')
  .description('Run the full pipeline for the current ISO week')
  .option('--dry-run', 'Run pipeline but skip delivery (print report to stdout)', false)
  .option('--verbose', 'Enable debug logging', false)
  .action(async (options) => {
    const { iso_year, iso_week } = getISOWeekAndYear(new Date());
    await runPipeline({
      dryRun: options.dryRun,
      isoYear: iso_year,
      isoWeek: iso_week,
      verbose: options.verbose,
    });
  });

// ── backfill command ─────────────────────────────────────────────────────────
program
  .command('backfill')
  .description('Run pipeline for a specific past week')
  .requiredOption('--year <year>', 'ISO year (e.g. 2026)', parseInt)
  .requiredOption('--week <week>', 'ISO week number (e.g. 22)', parseInt)
  .option('--dry-run', 'Skip delivery, print report only', false)
  .option('--verbose', 'Enable debug logging', false)
  .action(async (options) => {
    if (options.week < 1 || options.week > 53) {
      console.error(red('--week must be between 1 and 53'));
      process.exit(1);
    }
    await runPipeline({
      dryRun: options.dryRun,
      isoYear: options.year,
      isoWeek: options.week,
      verbose: options.verbose,
    });
  });

// ── status command ───────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show recent pipeline run history')
  .action(() => {
    runStatus();
  });

program.parse(process.argv);

// If no command given, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
