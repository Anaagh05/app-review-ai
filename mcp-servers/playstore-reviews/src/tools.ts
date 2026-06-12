import { z } from 'zod';

export const GetReviewsSchema = z.object({
  app_id: z.string(),
  lang: z.string().default('en'),
  country: z.string().default('in'),
  count: z.number().int().min(1).max(2000).default(200),
  sort: z.enum(['newest', 'rating', 'helpfulness']).default('newest'),
});

export const GetAppInfoSchema = z.object({
  app_id: z.string(),
  lang: z.string().default('en'),
  country: z.string().default('in'),
});
