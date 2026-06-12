/**
 * HTTP client for the Google Workspace MCP server hosted on Railway.
 * Server URL: https://mcp-server-production-1edb.up.railway.app
 * Source:     https://github.com/Anaagh05/mcp-server
 *
 * Confirmed schema (from GitHub source + live /tools endpoint):
 *
 *   POST /append_to_doc
 *     Request:  { doc_id: string, content: string }
 *     Response: { status: "success"|"error", message: string, document_id?: string }
 *     ⚠️  The server AUTO-PREPENDS a timestamp: "\n[YYYY-MM-DD HH:MM:SS]\n{content}\n"
 *     ⚠️  Uses insertText only — NO heading/bold/bullet formatting supported.
 *
 *   POST /create_email_draft
 *     Request:  { to: string, subject: string, body: string }
 *     Response: { status: "success"|"error", message: string, draft_id?: string }
 *
 * Since append_to_doc only supports plain text, we use formatReportAsPlainText()
 * which produces well-structured output using Unicode dividers, CAPS headers,
 * and dash-prefixed bullets — all readable without rich formatting.
 */



const MCP_BASE_URL = process.env.GOOGLE_MCP_URL ?? 'https://mcp-server-production-1edb.up.railway.app';

export interface AppendToDocArgs {
  /** The Google Doc ID (from the Doc URL: /d/<DOC_ID>/edit) */
  doc_id: string;
  /**
   * Plain-text content to append.
   * Use `formatReportAsPlainText()` to build a well-structured string,
   * since the MCP server provides no rich-formatting parameters.
   */
  content: string;
}

export interface CreateEmailDraftArgs {
  to: string;
  subject: string;
  body: string;
}

export interface AppendToDocResult {
  /** "success" | "error" — actual field returned by the MCP server */
  status: string;
  message?: string;
  /**
   * The Google Doc ID echoed back by the server.
   * Use this to build the doc URL: https://docs.google.com/document/d/{document_id}/edit
   */
  document_id?: string;
}

export interface CreateEmailDraftResult {
  /** "success" | "error" — actual field returned by the MCP server */
  status: string;
  message?: string;
  draft_id?: string;
}

async function mcpPost<TArgs, TResult>(path: string, args: TArgs): Promise<TResult> {
  const url = `${MCP_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = (json as any)?.detail;
    const msg = Array.isArray(detail)
      ? detail.map((d: any) => `${d.loc?.join('.')}: ${d.msg}`).join('; ')
      : String(detail ?? res.statusText);
    throw new Error(`MCP ${path} failed (${res.status}): ${msg}`);
  }

  return json as TResult;
}

/**
 * Appends content to a Google Doc via the MCP server.
 *
 * ⚠️  Formatting note:
 * The `append_to_doc` tool schema is: { doc_id: string, content: string }
 * The server does NOT expose parameters for headings, bold, or bullet formatting.
 * Pass plain text with clear visual structure (see `formatReportAsPlainText`).
 */
export async function appendToDoc(args: AppendToDocArgs): Promise<AppendToDocResult> {
  return mcpPost<AppendToDocArgs, AppendToDocResult>('/append_to_doc', args);
}

/**
 * Creates a Gmail draft via the MCP server.
 */
export async function createEmailDraft(args: CreateEmailDraftArgs): Promise<CreateEmailDraftResult> {
  return mcpPost<CreateEmailDraftArgs, CreateEmailDraftResult>('/create_email_draft', args);
}
