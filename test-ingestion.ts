import { ingestReviews } from './src/ingestion/ingest.js';
import { initDb, closeDb } from './src/db/store.js';

async function run() {
  try {
    initDb();
    await ingestReviews();
  } catch (error) {
    console.error('Error during ingestion:', error);
  } finally {
    closeDb();
  }
}

run();
