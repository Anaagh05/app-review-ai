import store from 'app-store-scraper';
import { AppInfo, Review } from './types.js';

/**
 * Fetches App Store reviews using `app-store-scraper` (reliable for India).
 * The iTunes RSS feed is unreliable for non-US storefronts.
 */
export async function fetchAppStoreReviews(
  appId: string,
  country: string = 'in',
  pages: number = 10,
  sortBy: 'mostRecent' | 'mostHelpful' = 'mostRecent'
): Promise<Review[]> {
  const sort =
    sortBy === 'mostRecent'
      ? store.sort.RECENT
      : store.sort.HELPFUL;

  const allReviews: Review[] = [];
  const numericId = parseInt(appId, 10);

  for (let page = 1; page <= pages; page++) {
    try {
      const results: any[] = await store.reviews({
        id: numericId,
        country,
        sort,
        page,
      });

      if (!results || results.length === 0) break;

      for (const r of results) {
        allReviews.push({
          review_id: String(r.id),
          source: 'app_store',
          app_id: appId,
          author: r.userName ?? 'Anonymous',
          rating: r.score ?? 3,
          title: r.title ?? '',
          body: r.text ?? '',
          date: r.updated ? new Date(r.updated).toISOString() : new Date().toISOString(),
          version: r.version ?? '',
          country,
        });
      }

      // Throttle between pages to avoid rate limiting
      if (page < pages) await sleep(500);
    } catch (err: any) {
      console.warn(`[appstore] Page ${page} failed (country=${country}): ${err.message}`);
      if (page === 1) {
        console.error('[appstore] First page failed — no App Store reviews this run.');
        break;
      }
      break;
    }
  }

  console.log(`[appstore] Fetched ${allReviews.length} reviews from App Store (country=${country}).`);
  return allReviews;
}

export async function fetchAppStoreAppInfo(appId: string, country: string = 'in'): Promise<AppInfo> {
  try {
    const result: any = await store.app({ id: parseInt(appId, 10), country });
    return {
      name: result.title ?? 'Unknown',
      rating: result.score ?? 0,
      version: result.version ?? 'Unknown',
    };
  } catch (err: any) {
    throw new Error(`fetchAppStoreAppInfo failed: ${err.message}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
