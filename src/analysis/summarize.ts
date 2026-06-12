/**
 * Phase 4.3 — LLM Summarization & Quote Validation
 *
 * For each cluster:
 *   1. Sample up to MAX_REVIEWS_PER_PROMPT reviews (most representative by recency + rating extremity)
 *   2. Build a prompt and call Groq (llama-3.3-70b-versatile)
 *   3. Parse the JSON response with Zod
 *   4. Validate all quotes via substring match against the actual review corpus
 *   5. Return a validated Theme[] ready for delivery
 *
 * Rate limiting: checks RateLimiter before every Groq call; sleeps if needed.
 * Retry: 1 retry on timeout/transient error, then skips the cluster with a warning.
 */

import Groq from 'groq-sdk';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { RateLimiter, BudgetExceededError } from '../safety/cost-guard.js';
import { Cluster } from './cluster.js';
import { EmbeddingResult } from './embed.js';
import { makeSectionAnchor, type ReportPayload, type Theme } from '../delivery/formatter.js';

// Max reviews fed into a single LLM prompt (keeps token count under TPM limit)
const MAX_REVIEWS_PER_PROMPT = 20;

// ─── Zod schema for LLM JSON output ─────────────────────────────────────────

const LlmThemeSchema = z.object({
  theme_name: z.string().min(2).max(80),
  description: z.string().min(10).max(500),
  quotes: z.array(z.string()).min(0).max(5),
  action_ideas: z.array(z.string()).min(0).max(4),
});

type LlmThemeRaw = z.infer<typeof LlmThemeSchema>;

// ─── Quote validation ────────────────────────────────────────────────────────

/**
 * Keeps only quotes that appear verbatim (case-insensitive substring) in
 * at least one review body in the cluster. Drops hallucinated quotes.
 */
function validateQuotes(quotes: string[], members: EmbeddingResult[]): string[] {
  return quotes.filter((quote) => {
    const q = quote.toLowerCase().trim();
    if (q.length < 10) return false; // too short to be meaningful
    return members.some((m) => m.body.toLowerCase().includes(q));
  });
}

// ─── Review sampling ─────────────────────────────────────────────────────────

/**
 * Selects the most representative reviews for the prompt:
 *   - Prioritises rating extremes (1★ and 5★) for vivid quotes
 *   - Takes the most recent reviews within each rating band
 */
function sampleReviews(members: EmbeddingResult[], max: number): EmbeddingResult[] {
  if (members.length <= max) return members;

  // Sort by rating extremity (1★ first, then 5★, then middle), then by date desc
  const sorted = [...members].sort((a, b) => {
    const extremityA = Math.abs(3 - a.rating);
    const extremityB = Math.abs(3 - b.rating);
    if (extremityB !== extremityA) return extremityB - extremityA;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return sorted.slice(0, max);
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildPrompt(clusterIndex: number, reviews: EmbeddingResult[]): string {
  const reviewLines = reviews
    .map((r, i) => `[${i + 1}] (${r.rating}★) ${r.body.replace(/\n/g, ' ').trim()}`)
    .join('\n');

  return `You are analyzing user reviews for Groww, an Indian stock-broking and mutual funds app.
Below are ${reviews.length} reviews that share a common theme (cluster ${clusterIndex}).

<reviews>
${reviewLines}
</reviews>

Respond ONLY with a valid JSON object (no markdown, no explanation) matching this schema:
{
  "theme_name": "<3-6 words describing the theme>",
  "description": "<1-2 sentences summarizing what users are saying>",
  "quotes": ["<verbatim quote from one of the reviews above>", "<another verbatim quote>"],
  "action_ideas": ["<one actionable suggestion for the product team>", "<another suggestion>"]
}

Rules:
- theme_name must be 3-6 words, title-cased
- description must be under 500 characters
- Every quote MUST appear verbatim (word-for-word) in the reviews listed above
- Provide 2-3 quotes and 1-2 action_ideas
- Write description and action_ideas in English`;
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

/**
 * Extracts the first valid JSON object from a string that may contain
 * markdown fences or surrounding text.
 */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Strip markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim());
    }
    // Find first {...} block
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      return JSON.parse(text.slice(braceStart, braceEnd + 1));
    }
    throw new Error('No JSON object found in LLM response');
  }
}

// ─── Single cluster summarization ────────────────────────────────────────────

async function summarizeCluster(
  groq: Groq,
  rateLimiter: RateLimiter,
  cluster: Cluster,
  clusterIndex: number,
  config: ReturnType<typeof getConfig>
): Promise<Theme | null> {
  const sampled = sampleReviews(cluster.embeddings, MAX_REVIEWS_PER_PROMPT);
  const prompt = buildPrompt(clusterIndex + 1, sampled);
  const estimatedTokens = rateLimiter.estimateTokens(prompt);

  // Rate-limit check (sleeps if needed, throws BudgetExceededError if over budget)
  await rateLimiter.waitForCapacity(estimatedTokens);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: config.llm.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: config.llm.maxOutputTokensPerCall,
      });

      const rawText = response.choices[0]?.message?.content ?? '';
      const actualTokens = response.usage?.total_tokens ?? estimatedTokens;
      rateLimiter.recordUsage(actualTokens);

      // Parse & validate
      const rawJson = extractJson(rawText);
      const parsed = LlmThemeSchema.safeParse(rawJson);

      if (!parsed.success) {
        console.warn(
          `[summarize] Cluster ${clusterIndex + 1} — Zod validation failed:`,
          parsed.error.issues.map((i) => i.message).join(', ')
        );
        return null;
      }

      const raw: LlmThemeRaw = parsed.data;

      // Validate quotes against actual review corpus
      const validatedQuotes = validateQuotes(raw.quotes, cluster.embeddings);

      if (validatedQuotes.length === 0 && raw.quotes.length > 0) {
        console.warn(
          `[summarize] Cluster ${clusterIndex + 1} — all ${raw.quotes.length} quotes failed validation (hallucinated). Theme flagged as low-confidence.`
        );
      }

      const theme: Theme = {
        name: raw.theme_name,
        description: raw.description,
        reviewCount: cluster.size,
        representativeQuotes: validatedQuotes,
        actionIdeas: raw.action_ideas,
      };

      console.log(
        `[summarize] Cluster ${clusterIndex + 1}/${clusterIndex + 1}: "${theme.name}" ` +
        `(${cluster.size} reviews, ${validatedQuotes.length}/${raw.quotes.length} quotes validated)`
      );

      return theme;
    } catch (err: any) {
      if (err instanceof BudgetExceededError) throw err; // propagate budget errors

      if (attempt === 1) {
        console.warn(
          `[summarize] Cluster ${clusterIndex + 1} — attempt 1 failed (${err.message}). Retrying…`
        );
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        console.error(
          `[summarize] Cluster ${clusterIndex + 1} — both attempts failed. Skipping cluster.`
        );
        return null;
      }
    }
  }

  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface AnalysisResult {
  report: ReportPayload;
  totalTokensUsed: number;
}

/**
 * Summarizes all clusters and assembles the final ReportPayload.
 *
 * @param clusters   Top-K clusters from clusterReviews()
 * @param isoYear    ISO year of the current run
 * @param isoWeek    ISO week number of the current run
 * @param totalReviewsAnalyzed  Total reviews ingested (for the report header)
 * @param reviewWindowWeeks     Window size (for the report header)
 */
export async function analyzeAndSummarize(
  clusters: Cluster[],
  isoYear: number,
  isoWeek: number,
  totalReviewsAnalyzed: number,
  reviewWindowWeeks: number
): Promise<AnalysisResult> {
  const config = getConfig();

  if (!config.llm.apiKey) {
    throw new Error(
      'PULSE_LLM_API_KEY is not set. Please add your Groq API key to .env.'
    );
  }

  const groq = new Groq({
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeoutMs,
  });

  const rateLimiter = new RateLimiter();
  const themes: Theme[] = [];

  console.log(`[summarize] Summarizing ${clusters.length} clusters via Groq (${config.llm.model})…`);

  for (let i = 0; i < clusters.length; i++) {
    try {
      const theme = await summarizeCluster(groq, rateLimiter, clusters[i], i, config);
      if (theme) themes.push(theme);
    } catch (err: any) {
      if (err instanceof BudgetExceededError) {
        console.warn(`[summarize] Budget exceeded — stopping early. ${themes.length} themes produced.`);
        break;
      }
      console.error(`[summarize] Unexpected error on cluster ${i + 1}: ${err.message}`);
    }
  }

  const product = config.product;
  const anchor = makeSectionAnchor(product, isoYear, isoWeek);

  const report: ReportPayload = {
    product,
    isoWeek,
    isoYear,
    generatedAt: new Date(),
    totalReviewsAnalyzed,
    reviewWindowWeeks,
    themes,
    docSectionAnchor: anchor,
  };

  console.log(
    `[summarize] Done. ${themes.length} themes generated. ` +
    `Total tokens used: ${rateLimiter.getTotalTokens().toLocaleString()}`
  );

  return {
    report,
    totalTokensUsed: rateLimiter.getTotalTokens(),
  };
}
