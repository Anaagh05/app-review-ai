export interface Review {
  review_id: string;
  source: 'play_store';
  app_id: string;
  author: string;
  rating: number;
  title: string | null;
  body: string;
  date: string; // ISO 8601
  version: string | null;
  thumbs_up: number;
  reply_text: string | null;
  reply_date: string | null;
}

export interface AppInfo {
  name: string;
  rating: number;
  version: string;
}
