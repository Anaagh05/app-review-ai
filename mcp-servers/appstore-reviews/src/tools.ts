import { z } from 'zod';

export const GetReviewsSchema = z.object({
  app_id: z.string(),
  country: z.string().default('in'),
  pages: z.number().int().min(1).max(10).default(1),
  sort_by: z.enum(['mostRecent', 'mostHelpful']).default('mostRecent'),
});

export const GetAppInfoSchema = z.object({
  app_id: z.string(),
  country: z.string().default('in'),
});
