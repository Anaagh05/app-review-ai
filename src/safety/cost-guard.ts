import { getConfig } from '../config.js';

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

export class RateLimiter {
  private requestsInMinute: number[] = [];
  private tokensInMinute: { timestamp: number; tokens: number }[] = [];
  
  private totalDailyRequests: number = 0;
  private totalDailyTokens: number = 0;

  private maxTpm: number;
  private maxRpm: number;
  private maxDailyTokens: number;

  constructor() {
    const config = getConfig();
    // Support either the old config or new config seamlessly
    this.maxTpm = (config.llm as any).maxTokensPerMinute || 12000;
    this.maxRpm = (config.llm as any).maxRequestsPerMinute || 30;
    this.maxDailyTokens = config.llm.maxTotalTokensPerRun || 100000;
  }

  public estimateTokens(text: string): number {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return Math.ceil(wordCount * 1.33); // 1 token ~ 0.75 words
  }

  /**
   * Cleans up timestamps older than 60 seconds
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    this.requestsInMinute = this.requestsInMinute.filter(time => time > oneMinuteAgo);
    this.tokensInMinute = this.tokensInMinute.filter(entry => entry.timestamp > oneMinuteAgo);
  }

  private getCurrentTpm(): number {
    return this.tokensInMinute.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  /**
   * Pauses execution until there is enough capacity for the estimated tokens.
   * Throws if daily budget will be exceeded.
   */
  public async waitForCapacity(estimatedTokens: number): Promise<void> {
    if (this.totalDailyTokens + estimatedTokens > this.maxDailyTokens) {
      throw new BudgetExceededError(
        `Total tokens (${this.totalDailyTokens + estimatedTokens}) exceeded max allowed run/daily budget (${this.maxDailyTokens})`
      );
    }

    if (estimatedTokens > this.maxTpm) {
       throw new BudgetExceededError(
         `A single request estimated at ${estimatedTokens} tokens exceeds the maximum tokens per minute limit (${this.maxTpm}). Reduce the number of reviews per prompt.`
       );
    }

    while (true) {
      this.cleanupOldEntries();
      
      const currentRpm = this.requestsInMinute.length;
      const currentTpm = this.getCurrentTpm();

      if (currentRpm < this.maxRpm && (currentTpm + estimatedTokens) <= this.maxTpm) {
        // We have capacity
        break;
      }

      // Wait a bit before checking again
      console.log(`Rate limits approaching: RPM=${currentRpm}/${this.maxRpm}, TPM=${currentTpm}/${this.maxTpm}. Sleeping for 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * Records the actual usage after a request completes.
   */
  public recordUsage(actualTokens: number): void {
    const now = Date.now();
    this.requestsInMinute.push(now);
    this.tokensInMinute.push({ timestamp: now, tokens: actualTokens });
    
    this.totalDailyRequests++;
    this.totalDailyTokens += actualTokens;
  }

  public getTotalTokens(): number {
    return this.totalDailyTokens;
  }
}
