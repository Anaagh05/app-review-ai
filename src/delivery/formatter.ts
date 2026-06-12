/**
 * Report formatter for the delivery phase.
 *
 * DESIGN DECISION — Plain-text formatting:
 * ─────────────────────────────────────────
 * The Railway MCP server's `append_to_doc` tool schema is:
 *   { doc_id: string, content: string }
 *
 * There are NO separate formatting parameters (no headings, bold, bullets).
 * The server appends the `content` string verbatim to the Google Doc.
 *
 * Therefore we build a well-structured plain-text block using:
 *   • Unicode separators (─────) for section dividers
 *   • ALL CAPS section headers for visual hierarchy
 *   • Dash-prefixed bullet points (  - item)
 *   • Consistent indentation and blank lines
 *
 * This keeps the Doc human-readable and section-searchable without
 * requiring rich Docs API formatting from the MCP server.
 */


export interface Theme {
  name: string;
  description: string;
  reviewCount: number;
  representativeQuotes: string[];
  actionIdeas: string[];
}

export interface ReportPayload {
  product: string;
  isoWeek: number;
  isoYear: number;
  generatedAt: Date;
  totalReviewsAnalyzed: number;
  reviewWindowWeeks: number;
  themes: Theme[];
  docSectionAnchor: string; // e.g. "groww-2025-w22"
}

const DIVIDER = '─'.repeat(60);
const THIN_DIVIDER = '·'.repeat(60);

/**
 * Formats the weekly report as plain text suitable for `append_to_doc`.
 *
 * The output looks like:
 *
 *   ────────────────────────────────────────────────────────────
 *   GROWW — WEEKLY REVIEW PULSE
 *   Week 22 · 2025  |  1 400 reviews analysed  |  10-week window
 *   [anchor: groww-2025-w22]
 *   ────────────────────────────────────────────────────────────
 *
 *   TOP THEMES
 *   ············...
 *
 *   1. App Performance & Bugs
 *      312 reviews
 *      "The app freezes at market open." — Play Store
 *      ACTION: Scale infra during peak hours; improve crash telemetry.
 *   ...
 *
 *   ────────────────────────────────────────────────────────────
 */
export function formatReportAsPlainText(report: ReportPayload): string {
  const title = `${report.product.toUpperCase()} — WEEKLY REVIEW PULSE`;
  const subtitle = `Week ${report.isoWeek} · ${report.isoYear}  |  ${report.totalReviewsAnalyzed.toLocaleString()} reviews analysed  |  ${report.reviewWindowWeeks}-week window`;
  const anchor = `[anchor: ${report.docSectionAnchor}]`;
  const generated = `Generated: ${report.generatedAt.toISOString()}`;

  const lines: string[] = [
    '',
    DIVIDER,
    title,
    subtitle,
    anchor,
    generated,
    DIVIDER,
    '',
    'TOP THEMES',
    THIN_DIVIDER,
    '',
  ];

  report.themes.forEach((theme, i) => {
    lines.push(`${i + 1}. ${theme.name.toUpperCase()}`);
    lines.push(`   ${theme.description}`);
    lines.push(`   Reviews in cluster: ${theme.reviewCount}`);

    if (theme.representativeQuotes.length > 0) {
      lines.push('');
      lines.push('   REAL USER QUOTES:');
      theme.representativeQuotes.forEach((q) => {
        lines.push(`   "${q}"`);
      });
    }

    if (theme.actionIdeas.length > 0) {
      lines.push('');
      lines.push('   ACTION IDEAS:');
      theme.actionIdeas.forEach((a) => {
        lines.push(`   - ${a}`);
      });
    }

    lines.push('');
  });

  lines.push(THIN_DIVIDER);
  lines.push('END OF PULSE REPORT');
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats a short stakeholder email body.
 * Includes top themes as bullets + a deep-link anchor note.
 */
export function formatEmailBody(report: ReportPayload, docUrl: string): string {
  const topThemes = report.themes
    .slice(0, 3)
    .map((t) => `  • ${t.name}: ${t.description}`)
    .join('\n');

  return [
    `Hi,`,
    ``,
    `Here's your weekly review pulse for ${report.product} — Week ${report.isoWeek}, ${report.isoYear}.`,
    ``,
    `TOP THEMES (${report.totalReviewsAnalyzed.toLocaleString()} reviews, ${report.reviewWindowWeeks}-week window):`,
    topThemes,
    ``,
    `Full report: ${docUrl}`,
    ``,
    `This is an automated report. Reply to this email to share feedback.`,
  ].join('\n');
}

/**
 * Generates a stable section anchor for idempotency checks.
 * Format: <product>-<year>-w<week>  e.g. groww-2025-w22
 */
export function makeSectionAnchor(product: string, year: number, week: number): string {
  return `${product.toLowerCase()}-${year}-w${String(week).padStart(2, '0')}`;
}
