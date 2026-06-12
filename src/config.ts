import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env file from project root
dotenv.config();

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const AppStoreConfigSchema = z.object({
  appId: z.string().min(1),
  country: z.string().length(2),
});

const PlayStoreConfigSchema = z.object({
  appId: z.string().min(1),
  country: z.string().length(2),
  lang: z.string().min(2),
});

const UmapConfigSchema = z.object({
  nComponents: z.number().int().min(2).max(50),
  metric: z.enum(['cosine', 'euclidean']),
  seed: z.number().int().min(0),
});

const HdbscanConfigSchema = z.object({
  minClusterSize: z.number().int().min(2),
});

const LlmConfigSchema = z.object({
  model: z.string().min(1),
  apiKey: z.string().optional(),
  maxInputTokensPerCall: z.number().int().min(1000),
  maxOutputTokensPerCall: z.number().int().min(256),
  maxTotalTokensPerRun: z.number().int().min(1000),
  timeoutMs: z.number().int().min(5000),
});

const DeliveryConfigSchema = z.object({
  mode: z.enum(['draft', 'send']),
  docTitle: z.string().min(1),
  emailRecipients: z.array(z.string().email()).default([]),
  emailSubjectTemplate: z.string().min(1),
});

const SafetyConfigSchema = z.object({
  maxReviewsToIngest: z.number().int().min(10),
  piiScrubEnabled: z.boolean(),
});

const DbConfigSchema = z.object({
  path: z.string().min(1),
});

export const PulseConfigSchema = z.object({
  product: z.string().min(1),
  appStore: AppStoreConfigSchema,
  playStore: PlayStoreConfigSchema,
  reviewWindowWeeks: z.number().int().min(1).max(52),
  umap: UmapConfigSchema,
  hdbscan: HdbscanConfigSchema,
  topKClusters: z.number().int().min(1).max(20),
  llm: LlmConfigSchema,
  delivery: DeliveryConfigSchema,
  safety: SafetyConfigSchema,
  db: DbConfigSchema,
});

export type PulseConfig = z.infer<typeof PulseConfigSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: PulseConfig = {
  product: 'groww',

  appStore: {
    appId: '1404684361',
    country: 'in',
  },

  playStore: {
    appId: 'com.nextbillion.groww',
    country: 'in',
    lang: 'en',
  },

  reviewWindowWeeks: 12,

  umap: {
    nComponents: 5,
    metric: 'cosine',
    seed: 42,
  },

  hdbscan: {
    minClusterSize: 10,
  },

  topKClusters: 5,

  llm: {
    model: 'llama-3.3-70b-versatile',
    apiKey: undefined,
    maxInputTokensPerCall: 25_000,
    maxOutputTokensPerCall: 4_096,
    maxTotalTokensPerRun: 100_000,
    timeoutMs: 60_000,
  },

  delivery: {
    mode: 'draft',
    docTitle: 'Weekly Review Pulse — Groww',
    emailRecipients: [],
    emailSubjectTemplate: 'Groww Review Pulse — Week {ISO_WEEK}',
  },

  safety: {
    maxReviewsToIngest: 2_000,
    piiScrubEnabled: true,
  },

  db: {
    path: './data/pulse.db',
  },
};

// ---------------------------------------------------------------------------
// Environment variable overrides
// ---------------------------------------------------------------------------

/**
 * Reads PULSE_* environment variables and overlays them onto the defaults.
 * Only non-empty env vars override the default value.
 */
function applyEnvOverrides(defaults: PulseConfig): PulseConfig {
  const env = process.env;

  const envStr = (key: string): string | undefined => {
    const val = env[key];
    return val !== undefined && val.trim() !== '' ? val.trim() : undefined;
  };

  const envInt = (key: string): number | undefined => {
    const val = envStr(key);
    if (val === undefined) return undefined;
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key}="${val}" is not a valid integer`);
    }
    return parsed;
  };

  const envBool = (key: string): boolean | undefined => {
    const val = envStr(key);
    if (val === undefined) return undefined;
    if (val === 'true' || val === '1') return true;
    if (val === 'false' || val === '0') return false;
    throw new Error(`Environment variable ${key}="${val}" is not a valid boolean (use true/false)`);
  };

  const envList = (key: string): string[] | undefined => {
    const val = envStr(key);
    if (val === undefined) return undefined;
    return val
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  return {
    product: envStr('PULSE_PRODUCT') ?? defaults.product,

    appStore: {
      appId: envStr('PULSE_APPSTORE_APP_ID') ?? defaults.appStore.appId,
      country: envStr('PULSE_APPSTORE_COUNTRY') ?? defaults.appStore.country,
    },

    playStore: {
      appId: envStr('PULSE_PLAYSTORE_APP_ID') ?? defaults.playStore.appId,
      country: envStr('PULSE_PLAYSTORE_COUNTRY') ?? defaults.playStore.country,
      lang: envStr('PULSE_PLAYSTORE_LANG') ?? defaults.playStore.lang,
    },

    reviewWindowWeeks: envInt('PULSE_REVIEW_WINDOW_WEEKS') ?? defaults.reviewWindowWeeks,

    umap: {
      nComponents: envInt('PULSE_UMAP_N_COMPONENTS') ?? defaults.umap.nComponents,
      metric:
        (envStr('PULSE_UMAP_METRIC') as 'cosine' | 'euclidean' | undefined) ?? defaults.umap.metric,
      seed: envInt('PULSE_UMAP_SEED') ?? defaults.umap.seed,
    },

    hdbscan: {
      minClusterSize:
        envInt('PULSE_HDBSCAN_MIN_CLUSTER_SIZE') ?? defaults.hdbscan.minClusterSize,
    },

    topKClusters: envInt('PULSE_TOP_K_CLUSTERS') ?? defaults.topKClusters,

    llm: {
      model: envStr('PULSE_LLM_MODEL') ?? defaults.llm.model,
      apiKey: envStr('PULSE_LLM_API_KEY') ?? defaults.llm.apiKey,
      maxInputTokensPerCall:
        envInt('PULSE_LLM_MAX_INPUT_TOKENS_PER_CALL') ?? defaults.llm.maxInputTokensPerCall,
      maxOutputTokensPerCall:
        envInt('PULSE_LLM_MAX_OUTPUT_TOKENS_PER_CALL') ?? defaults.llm.maxOutputTokensPerCall,
      maxTotalTokensPerRun:
        envInt('PULSE_LLM_MAX_TOTAL_TOKENS_PER_RUN') ?? defaults.llm.maxTotalTokensPerRun,
      timeoutMs: envInt('PULSE_LLM_TIMEOUT_MS') ?? defaults.llm.timeoutMs,
    },

    delivery: {
      mode: (envStr('PULSE_DELIVERY_MODE') as 'draft' | 'send' | undefined) ?? defaults.delivery.mode,
      docTitle: envStr('PULSE_DELIVERY_DOC_TITLE') ?? defaults.delivery.docTitle,
      emailRecipients: envList('PULSE_DELIVERY_EMAIL_RECIPIENTS') ?? defaults.delivery.emailRecipients,
      emailSubjectTemplate:
        envStr('PULSE_DELIVERY_EMAIL_SUBJECT_TEMPLATE') ?? defaults.delivery.emailSubjectTemplate,
    },

    safety: {
      maxReviewsToIngest: envInt('PULSE_SAFETY_MAX_REVIEWS') ?? defaults.safety.maxReviewsToIngest,
      piiScrubEnabled: envBool('PULSE_SAFETY_PII_SCRUB_ENABLED') ?? defaults.safety.piiScrubEnabled,
    },

    db: {
      path: envStr('PULSE_DB_PATH') ?? defaults.db.path,
    },
  };
}

// ---------------------------------------------------------------------------
// Load & validate
// ---------------------------------------------------------------------------

/**
 * Loads configuration by merging defaults with environment variable overrides,
 * then validates the result against the Zod schema.
 *
 * Throws a ZodError with detailed messages if validation fails.
 */
export function loadConfig(): PulseConfig {
  const merged = applyEnvOverrides(DEFAULTS);
  const result = PulseConfigSchema.safeParse(merged);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }

  // Resolve DB path relative to project root
  const config = result.data;
  if (!path.isAbsolute(config.db.path)) {
    config.db.path = path.resolve(process.cwd(), config.db.path);
  }

  return config;
}

/**
 * Singleton config instance — loaded once and reused.
 */
let _config: PulseConfig | null = null;

export function getConfig(): PulseConfig {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reset the singleton config (useful for testing).
 */
export function resetConfig(): void {
  _config = null;
}
