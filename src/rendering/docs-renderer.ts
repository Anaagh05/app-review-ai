/**
 * Phase 5.1 — Google Docs Renderer (plain-text facade)
 *
 * Since the Railway MCP server's `append_to_doc` tool only supports:
 *   POST /append_to_doc → { doc_id: string, content: string }
 *   (insertText only — no headings, bold, or bullet formatting)
 *
 * This module re-exports the plain-text formatter from delivery/formatter.ts
 * and adds a `renderDocSection` function that is the canonical entry point
 * for the CLI orchestrator to call in Phase 5.
 *
 * If the MCP server is ever upgraded to support rich formatting, update
 * this file alone — the rest of the pipeline is unaffected.
 */

export {
  formatReportAsPlainText as renderDocSection,
  type ReportPayload,
  type Theme,
  makeSectionAnchor,
} from '../delivery/formatter.js';
