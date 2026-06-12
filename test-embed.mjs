// Patch fetch with 5-minute timeout before importing transformers
const _nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) =>
  _nativeFetch(input, {
    signal: AbortSignal.timeout(5 * 60 * 1000),
    ...init,
  });

import { pipeline, env } from '@xenova/transformers';
env.cacheDir = './.model-cache';

console.log('Attempting to load model (first run downloads ~120 MB, may take a few minutes)...');
try {
  const embedder = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
  console.log('Model loaded OK!');
  const result = await embedder('test text', { pooling: 'mean', normalize: true });
  console.log('Embedding dims:', result.data.length);
} catch(e) {
  console.error('Error:', e.message);
  console.error('Cause:', e.cause?.message ?? e.cause);
}
