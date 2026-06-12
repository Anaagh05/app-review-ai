/**
 * Delivery orchestrator — Phase 4 of the weekly pulse pipeline.
 *
 * Responsibilities:
 *   1. Check idempotency (is this week's section already in the Doc?)
 *   2. Append the weekly report section to the Google Doc via MCP
 *   3. Create a Gmail draft (or send) via MCP
 *   4. Record delivery metadata to the DB run log
 *
 * ─── HOW `append_to_doc` WORKS ──────────────────────────────────────────────
 * Source: https://github.com/Anaagh05/mcp-server
 *
 * The Railway MCP server exposes:
 *   POST /append_to_doc  →  { doc_id: string, content: string }
 *
 * Response: { status: "success"|"error", message: string, document_id?: string }
 *
 * The server does NOT support rich formatting — it uses `insertText` only.
 * It also AUTO-PREPENDS a timestamp to every append:
 *   "\n[YYYY-MM-DD HH:MM:SS]\n{your content}\n"
 *
 * We use `formatReportAsPlainText` which produces well-structured plain text
 * with Unicode dividers, CAPS headers and explicit "anchor" comment so runs
 * stay idempotent and sections stay identifiable in the running Doc.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { getConfig } from '../config.js';
import { appendToDoc, createEmailDraft } from './http-mcp-client.js';
import {
  formatReportAsPlainText,
  makeSectionAnchor,
  type ReportPayload,
} from './formatter.js';
import { renderEmailPlainText } from '../rendering/email-renderer.js';
import { recordDelivery, hasDeliveredForWeek } from '../db/store.js';

export interface DeliveryInput {
  report: ReportPayload;
  /** Google Doc ID (the long alphanumeric string in the Doc URL) */
  docId: string;
}

export interface DeliveryResult {
  skipped: boolean;
  reason?: string;
  docUrl?: string;
  draftId?: string;
}

/**
 * Delivers the weekly pulse report to Google Docs + Gmail.
 *
 * Returns `{ skipped: true }` if this week's section was already delivered
 * (idempotency guard based on the stable anchor stored in the DB run log).
 */
export async function deliverReport(input: DeliveryInput): Promise<DeliveryResult> {
  const config = getConfig();
  const { report, docId } = input;
  const { isoWeek, isoYear, product } = report;

  // ── 1. Idempotency check ────────────────────────────────────────────────
  const anchor = makeSectionAnchor(product, isoYear, isoWeek);

  const alreadyDelivered = await hasDeliveredForWeek(product, isoYear, isoWeek);
  if (alreadyDelivered) {
    console.log(`[delivery] Skipping — anchor "${anchor}" already delivered.`);
    return { skipped: true, reason: `Already delivered for ${product} week ${isoWeek}/${isoYear}` };
  }

  // ── 2. Format plain-text content ────────────────────────────────────────
  //
  // NOTE: append_to_doc only accepts { doc_id, content: string }.
  // We use plain text with visual structure (Unicode dividers, CAPS headings).
  // See src/delivery/formatter.ts for the design rationale.
  //
  const plainTextContent = formatReportAsPlainText(report);
  console.log(`[delivery] Formatted report (${plainTextContent.length} chars). Appending to Doc ${docId}…`);

  // ── 3. Append to Google Doc via MCP ─────────────────────────────────────
  const docResult = await appendToDoc({ doc_id: docId, content: plainTextContent });

  if (docResult.status !== 'success') {
    throw new Error(`[delivery] append_to_doc failed: ${docResult.message ?? 'unknown error'}`);
  }

  // Server returns document_id; build the full URL from it.
  const resolvedDocId = docResult.document_id ?? docId;
  const docUrl = `https://docs.google.com/document/d/${resolvedDocId}/edit`;

  console.log(`[delivery] Doc append success. URL: ${docUrl}`);

  // ── 4. Email draft / send via MCP ───────────────────────────────────────
  const subject = config.delivery.emailSubjectTemplate
    .replace('{ISO_WEEK}', String(isoWeek))
    .replace('{YEAR}', String(isoYear));

  // Use the plain-text email body for the Gmail draft body field.
  // renderEmailPlainText is readable in all email clients.
  // The HTML version (renderEmailHtml) is available in src/rendering/email-renderer.ts
  // for future use when the MCP server supports HTML body fields.
  const emailBody = renderEmailPlainText(report, docUrl);

  let draftId: string | undefined;

  if (config.delivery.emailRecipients.length > 0) {
    const recipients = config.delivery.emailRecipients.join(',');
    const draftResult = await createEmailDraft({ to: recipients, subject, body: emailBody });
    draftId = draftResult.draft_id;
    console.log(`[delivery] Gmail draft created. Draft ID: ${draftId}`);
  } else {
    console.log(`[delivery] No email recipients configured — skipping Gmail draft.`);
  }

  // ── 5. Record delivery in DB ─────────────────────────────────────────────
  await recordDelivery({
    product,
    isoYear,
    isoWeek,
    anchor,
    docId,
    docUrl,
    draftId,
    deliveredAt: new Date(),
  });

  return { skipped: false, docUrl, draftId };
}
