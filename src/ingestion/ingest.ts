import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { McpClientWrapper } from './mcp-client.js';
import { insertReviews, StoredReview } from '../db/store.js';
import { normalizeAppStoreReview, normalizePlayStoreReview } from './normalize.js';

export async function ingestReviews(): Promise<number> {
  const config = getConfig();
  
  const mcpConfigPath = path.resolve(process.cwd(), 'mcp.json');
  if (!fs.existsSync(mcpConfigPath)) {
    throw new Error('mcp.json not found in project root');
  }
  const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
  
  const appStoreMcpConfig = mcpConfig.mcpServers['appstore-reviews'];
  const playStoreMcpConfig = mcpConfig.mcpServers['playstore-reviews'];

  if (!appStoreMcpConfig || !playStoreMcpConfig) {
    throw new Error('Missing MCP server configurations in mcp.json');
  }

  const appStoreClient = new McpClientWrapper(appStoreMcpConfig);
  const playStoreClient = new McpClientWrapper(playStoreMcpConfig);

  const fetchedAt = new Date();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.reviewWindowWeeks * 7);

  let appStoreRaw: any[] = [];
  let playStoreRaw: any[] = [];

  try {
    console.log('Connecting to MCP servers...');
    await Promise.all([appStoreClient.connect(), playStoreClient.connect()]);

    console.log('Fetching reviews...');
    
    const appStorePromise = appStoreClient.callTool('get_reviews', {
      app_id: config.appStore.appId,
      country: config.appStore.country,
      pages: Math.min(10, Math.ceil(config.safety.maxReviewsToIngest / 50))
    }).catch(e => {
      console.error('App Store fetch failed:', e);
      return [];
    });

    const playStorePromise = playStoreClient.callTool('get_reviews', {
      app_id: config.playStore.appId,
      country: config.playStore.country,
      lang: config.playStore.lang,
      count: Math.min(2000, config.safety.maxReviewsToIngest)
    }).catch(e => {
      console.error('Play Store fetch failed:', e);
      return [];
    });

    [appStoreRaw, playStoreRaw] = await Promise.all([appStorePromise, playStorePromise]);

  } finally {
    await Promise.all([appStoreClient.close(), playStoreClient.close()]);
  }

  console.log(`Fetched ${appStoreRaw.length} App Store reviews, ${playStoreRaw.length} Play Store reviews.`);

  const cleanRaw = (raw: any) => {
    const cleaned = { ...raw };
    delete cleaned.review_id;
    delete cleaned.id;
    delete cleaned.author;
    delete cleaned.userName;
    delete cleaned.userImage;
    delete cleaned.version;
    delete cleaned.reviewCreatedVersion;
    delete cleaned.at;
    delete cleaned.reply_text;
    delete cleaned.replyText;
    delete cleaned.replyContent;
    delete cleaned.reply_date;
    delete cleaned.replyDate;
    delete cleaned.repliedAt;
    return cleaned;
  };

  const actualAppStore = appStoreRaw.map(cleanRaw);
  const actualPlayStore = playStoreRaw.map(cleanRaw);
  const allActual = [...actualAppStore, ...actualPlayStore];

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(path.join(dataDir, 'actual_reviews.json'), JSON.stringify(allActual, null, 2));

  let normalized: Omit<StoredReview, 'id'>[] = [];

  for (const raw of appStoreRaw) {
    const reviewDate = new Date(raw.date);
    if (reviewDate >= cutoffDate) {
      const norm = normalizeAppStoreReview(raw, fetchedAt);
      if (norm) normalized.push(norm);
    }
  }

  for (const raw of playStoreRaw) {
    const reviewDate = new Date(raw.date);
    if (reviewDate >= cutoffDate) {
      const norm = normalizePlayStoreReview(raw, fetchedAt);
      if (norm) normalized.push(norm);
    }
  }

  console.log(`Normalized ${normalized.length} valid reviews within time window (cutoff: ${cutoffDate.toISOString()}). Inserting to DB...`);

  fs.writeFileSync(path.join(dataDir, 'normalized_reviews.json'), JSON.stringify(normalized, null, 2));

  if (normalized.length > 0) {
    insertReviews(normalized);
  }

  console.log(`Ingestion complete. Saved to data/actual_reviews.json and data/normalized_reviews.json`);
  return normalized.length;
}
