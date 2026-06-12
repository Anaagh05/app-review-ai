export interface Review {
  review_id: string;
  source: 'app_store';
  app_id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  date: string; // ISO 8601
  version: string;
  country: string;
}

export interface AppInfo {
  name: string;
  rating: number;
  version: string;
}
