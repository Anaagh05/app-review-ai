/**
 * Phase 5.2 — HTML Email Renderer
 *
 * Converts a ReportPayload into a responsive HTML email with:
 *   - Branded header with product name + week range
 *   - Top themes as a styled bullet list
 *   - "Read Full Report →" CTA button linking to the Google Doc
 *   - Plain-text fallback for clients that don't render HTML
 *
 * Design: inline CSS only (no external stylesheets) for maximum
 * Gmail / Outlook / Apple Mail compatibility.
 */

import { ReportPayload, Theme } from '../delivery/formatter.js';

// ─── Colour palette ───────────────────────────────────────────────────────────
const BRAND_PRIMARY = '#00b386';   // Groww green
const BRAND_DARK    = '#0f1928';   // near-black
const BRAND_BG      = '#f4f7f6';   // off-white background
const BRAND_CARD    = '#ffffff';
const BRAND_MUTED   = '#6b7280';   // grey text
const BRAND_ACCENT  = '#e6f7f3';   // light green tint for theme cards

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escapes HTML special characters in user-generated text. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Returns the ISO week date range as "Mon DD – Mon DD, YYYY". */
function weekDateRange(isoYear: number, isoWeek: number): string {
  // ISO week starts on Monday
  const jan4 = new Date(Date.UTC(isoYear, 0, 4)); // Jan 4 is always in week 1
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (isoWeek - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return `${fmt(weekStart)} – ${fmt(weekEnd)}, ${isoYear}`;
}



// ─── Theme card ──────────────────────────────────────────────────────────────

function renderThemeCard(theme: Theme, index: number): string {
  const quote = theme.representativeQuotes[0]
    ? `<blockquote style="margin:8px 0 0 0;padding:10px 14px;border-left:3px solid ${BRAND_PRIMARY};
        background:${BRAND_ACCENT};border-radius:0 6px 6px 0;font-style:italic;color:#374151;font-size:13px;">
        &ldquo;${esc(theme.representativeQuotes[0])}&rdquo;
       </blockquote>`
    : '';

  const actions = theme.actionIdeas.length > 0
    ? `<p style="margin:10px 0 0 0;font-size:12px;color:${BRAND_MUTED};">
        💡 <strong>Action:</strong> ${esc(theme.actionIdeas[0])}
       </p>`
    : '';

  return `
  <tr>
    <td style="padding:0 0 12px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${BRAND_CARD};border:1px solid #e5e7eb;border-radius:10px;
                    border-left:4px solid ${BRAND_PRIMARY};">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px 0;font-size:11px;color:${BRAND_MUTED};
                      text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">
              Theme ${index + 1} · ${theme.reviewCount} reviews
            </p>
            <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:${BRAND_DARK};">
              ${esc(theme.name)}
            </p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">
              ${esc(theme.description)}
            </p>
            ${quote}
            ${actions}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

// ─── Main HTML renderer ───────────────────────────────────────────────────────

/**
 * Renders the full HTML email for the weekly pulse report.
 */
export function renderEmailHtml(report: ReportPayload, docUrl: string): string {
  const { product, isoWeek, isoYear, totalReviewsAnalyzed, reviewWindowWeeks, themes } = report;
  const productTitle = product.charAt(0).toUpperCase() + product.slice(1);
  const dateRange = weekDateRange(isoYear, isoWeek);
  const topThemes = themes.slice(0, 5);
  const themeCards = topThemes.map((t, i) => renderThemeCard(t, i)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(productTitle)} Review Pulse — Week ${isoWeek}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND_BG};min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Container -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_DARK};border-radius:12px 12px 0 0;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px 0;font-size:11px;color:${BRAND_PRIMARY};
                               text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">
                      Weekly Review Pulse
                    </p>
                    <h1 style="margin:0 0 4px 0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;">
                      ${esc(productTitle)}
                    </h1>
                    <p style="margin:0;font-size:13px;color:#9ca3af;">
                      Week ${isoWeek} &nbsp;·&nbsp; ${esc(dateRange)}
                    </p>
                  </td>
                  <td align="right" valign="middle" style="padding-left:16px;">
                    <div style="background:${BRAND_PRIMARY};border-radius:50%;width:52px;height:52px;
                                display:inline-flex;align-items:center;justify-content:center;
                                font-size:24px;line-height:52px;text-align:center;">
                      📊
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Stats bar -->
          <tr>
            <td style="background:${BRAND_PRIMARY};padding:12px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <span style="color:#ffffff;font-size:13px;font-weight:600;">
                      📝 ${totalReviewsAnalyzed.toLocaleString('en-IN')} reviews analysed
                      &nbsp;·&nbsp;
                      📅 ${reviewWindowWeeks}-week window
                      &nbsp;·&nbsp;
                      🔍 ${topThemes.length} themes
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:${BRAND_BG};padding:24px 32px 0 32px;">
              <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:${BRAND_DARK};">
                🔥 Top Themes This Week
              </h2>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${themeCards}
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background:${BRAND_BG};padding:8px 32px 32px 32px;text-align:center;">
              <p style="margin:0 0 16px 0;font-size:13px;color:${BRAND_MUTED};">
                The full report — including all themes, user quotes, and action ideas —
                is available in the linked Google Doc.
              </p>
              <a href="${docUrl}"
                 style="display:inline-block;background:${BRAND_PRIMARY};color:#ffffff;
                        text-decoration:none;font-size:15px;font-weight:700;
                        padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">
                Read Full Report →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BRAND_DARK};border-radius:0 0 12px 12px;
                       padding:20px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6b7280;line-height:1.6;">
                This report was generated automatically by the Weekly Review Pulse pipeline.<br>
                Generated ${report.generatedAt.toUTCString()}
              </p>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

/**
 * Plain-text version of the email for clients that don't render HTML.
 * Used as the `body` field in the Gmail draft (which accepts plain text).
 */
export function renderEmailPlainText(report: ReportPayload, docUrl: string): string {
  const { product, isoWeek, isoYear, totalReviewsAnalyzed, reviewWindowWeeks, themes } = report;
  const dateRange = weekDateRange(isoYear, isoWeek);

  const themeLines = themes
    .slice(0, 5)
    .map((t, i) => {
      const quote = t.representativeQuotes[0] ? `\n     "${t.representativeQuotes[0]}"` : '';
      const action = t.actionIdeas[0] ? `\n     Action: ${t.actionIdeas[0]}` : '';
      return `  ${i + 1}. ${t.name} (${t.reviewCount} reviews)\n     ${t.description}${quote}${action}`;
    })
    .join('\n\n');

  return [
    `${product.toUpperCase()} WEEKLY REVIEW PULSE`,
    `Week ${isoWeek} · ${dateRange}`,
    `${totalReviewsAnalyzed.toLocaleString()} reviews analysed · ${reviewWindowWeeks}-week window`,
    '',
    '────────────────────────────',
    'TOP THEMES THIS WEEK',
    '────────────────────────────',
    '',
    themeLines,
    '',
    '────────────────────────────',
    '',
    `Full report: ${docUrl}`,
    '',
    'This is an automated report generated by the Weekly Review Pulse pipeline.',
  ].join('\n');
}
