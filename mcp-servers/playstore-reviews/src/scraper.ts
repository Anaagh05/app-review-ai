import gplay from 'google-play-scraper';
import { AppInfo, Review } from './types.js';

export async function fetchPlayStoreReviews(
  appId: string,
  lang: string = 'en',
  country: string = 'in',
  count: number = 200,
  sort: 'newest' | 'rating' | 'helpfulness' = 'newest'
): Promise<Review[]> {
  try {
    let sortOption = (gplay.sort as any).NEWEST;
    if (sort === 'rating') sortOption = (gplay.sort as any).RATING;
    if (sort === 'helpfulness') sortOption = (gplay.sort as any).HELPFULNESS;

    const data = await gplay.reviews({
      appId,
      lang,
      country,
      sort: sortOption,
      num: count,
    });

    // The data object returned contains `data` (the reviews) and `nextPaginationToken`
    const reviewsArray = data.data || [];

    return reviewsArray.map((rev: any) => ({
      review_id: rev.id,
      source: 'play_store',
      app_id: appId,
      author: rev.userName,
      rating: rev.score,
      title: rev.title || null,
      body: rev.text,
      date: new Date(rev.date).toISOString(),
      version: rev.version || null,
      thumbs_up: rev.thumbsUp,
      reply_text: rev.replyText || null,
      reply_date: rev.replyDate ? new Date(rev.replyDate).toISOString() : null,
    }));
  } catch (error) {
    console.error(`Error scraping Google Play for ${appId}:`, error);
    throw new Error(`Failed to scrape Google Play: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function fetchPlayStoreAppInfo(appId: string, lang: string = 'en', country: string = 'in'): Promise<AppInfo> {
  try {
    const data = await gplay.app({
      appId,
      lang,
      country,
    });

    return {
      name: data.title,
      rating: data.score,
      version: data.version || 'Unknown',
    };
  } catch (error) {
    console.error(`Error scraping Google Play app info for ${appId}:`, error);
    throw new Error(`Failed to fetch app info: ${error instanceof Error ? error.message : String(error)}`);
  }
}
