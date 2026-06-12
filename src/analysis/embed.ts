/**
 * Phase 4.1 — Sentence Embedding
 *
 * Generates 384-dimensional vector embeddings for each review body using
 * the multilingual MiniLM model, which correctly handles Hinglish /
 * Romanized Hindi text commonly found in Groww reviews.
 *
 * Model: paraphrase-multilingual-MiniLM-L12-v2 (via @xenova/transformers)
 * Dims:  384
 * Batch: 100 reviews per batch (memory management)
 */

import { pipeline, env } from '@xenova/transformers';
import { StoredReview } from '../db/store.js';

// Use local model cache to avoid re-downloading on every run
env.cacheDir = './.model-cache';

// Patch fetch to use a 5-minute timeout for model downloads (HuggingFace CDN
// can be slow; Node's default 10 s kills the ~120 MB first-run download).
const _nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  _nativeFetch(input, {
    signal: AbortSignal.timeout(5 * 60 * 1000), // 5 minutes
    ...init,
  });

export interface EmbeddingResult {
  review_id: string;  // unique key: "<source>_<rowid>"
  source: string;
  body: string;
  rating: number;
  date: string;
  vector: number[];   // 384-dim float array
}

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const BATCH_SIZE = 100;

let _embedder: any = null;

async function getEmbedder() {
  if (!_embedder) {
    console.log(`[embed] Loading model ${MODEL_NAME} (first run may download ~120 MB)…`);
    _embedder = await pipeline('feature-extraction', MODEL_NAME);
    console.log('[embed] Model loaded.');
  }
  return _embedder;
}



/**
 * L2-normalizes a vector in place so cosine similarity == dot product.
 */
function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/**
 * Embeds a single text string. Returns a 384-dim normalized vector.
 */
async function embedText(embedder: any, text: string): Promise<number[]> {
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  // output.data is a Float32Array of length 384
  const vec = Array.from(output.data as Float32Array) as number[];
  return l2Normalize(vec);
}

/**
 * Embeds all reviews in batches of BATCH_SIZE.
 *
 * Reviews with bodies shorter than 8 words get a zero vector and are
 * excluded from clustering downstream (handled in cluster.ts).
 */
export async function embedReviews(reviews: StoredReview[]): Promise<EmbeddingResult[]> {
  if (reviews.length === 0) return [];

  const embedder = await getEmbedder();
  const results: EmbeddingResult[] = [];

  const total = reviews.length;
  let done = 0;

  for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
    const batch = reviews.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (review) => {
        const text = review.body.trim();
        const wordCount = text.split(/\s+/).filter(Boolean).length;

        let vector: number[];
        if (wordCount < 4) {
          // Too short to embed meaningfully — use zero vector (filtered in clustering)
          vector = new Array(384).fill(0);
        } else {
          vector = await embedText(embedder, text);
        }

        results.push({
          review_id: `${review.source}_${review.id ?? i}`,
          source: review.source,
          body: review.body,
          rating: review.rating,
          date: review.date,
          vector,
        });
      })
    );

    done += batch.length;
    console.log(`[embed] ${done}/${total} reviews embedded.`);
  }

  return results;
}
