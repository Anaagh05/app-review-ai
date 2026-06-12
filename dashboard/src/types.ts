export interface Theme {
  name: string;
  description: string;
  reviewCount: number;
  avgRating?: number;
  representativeQuotes: string[];
  actionIdeas: string[];
}

export interface Report {
  product: string;
  isoWeek: number;
  isoYear: number;
  generatedAt: string;
  totalReviewsAnalyzed: number;
  reviewWindowWeeks: number;
  docUrl?: string;
  draftId?: string;
  themes: Theme[];
}

export interface RunHistory {
  id: number;
  product: string;
  isoWeek: number;
  isoYear: number;
  status: 'success' | 'failed' | 'running' | 'partial';
  reviewsFetched: number | null;
  clustersFound: number | null;
  runStartedAt: string;
  runFinishedAt: string | null;
  docUrl: string | null;
  emailMode: string | null;
  errorMessage: string | null;
}

export interface StoredReview {
  id?: number;
  source: 'app_store' | 'play_store';
  app_id: string;
  rating: number;
  title?: string | null;
  body: string;
  raw_body: string;
  date: string;
  fetched_at: string;
  iso_year: number;
  iso_week: number;
}
