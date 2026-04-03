/**
 * Aggregates odds from multiple sources into a single fair value per market.
 * Detects divergence between sources as a risk signal.
 */

export interface OddsUpdate {
  source: string;
  fairValue: number;
  timestamp: number;
  confidence?: number;
}

interface SourceState {
  fairValue: number;
  timestamp: number;
  confidence: number;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  "polymarket-ws": 1.0,
  "polymarket-rest": 0.95,
  polymarket: 0.95,
  sportradar: 0.8,
  betfair: 0.8,
  "odds-api": 0.6,
  espn: 0.4,
  demo: 0.2,
};

const MAX_STALE_MS = 30_000;

export class FairValueAggregator {
  private sources: Map<string, Map<string, SourceState>> = new Map();

  /**
   * Record an odds update from a data source for a given market.
   */
  update(marketId: string, update: OddsUpdate): void {
    if (!this.sources.has(marketId)) {
      this.sources.set(marketId, new Map());
    }
    this.sources.get(marketId)!.set(update.source, {
      fairValue: update.fairValue,
      timestamp: update.timestamp,
      confidence: update.confidence ?? (SOURCE_WEIGHTS[update.source] ?? 0.5),
    });
  }

  /**
   * Get the weighted-average fair value across all non-stale sources.
   */
  getFairValue(marketId: string): number | null {
    const market = this.sources.get(marketId);
    if (!market || market.size === 0) return null;

    const now = Date.now();
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [source, state] of market) {
      const age = now - state.timestamp;
      if (age > MAX_STALE_MS) continue;

      const baseWeight = SOURCE_WEIGHTS[source] ?? 0.5;
      // Decay weight by age: full weight at 0s, half at 60s
      const recencyFactor = Math.max(0.1, 1 - age / (MAX_STALE_MS * 2));
      const weight = baseWeight * recencyFactor * state.confidence;

      weightedSum += state.fairValue * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return null;
    return weightedSum / totalWeight;
  }

  /**
   * Detect divergence between sources. Returns the max spread between
   * any two active sources. High divergence = risk signal.
   */
  getDivergence(marketId: string): {
    maxSpread: number;
    sourceCount: number;
    sources: Record<string, number>;
  } {
    const market = this.sources.get(marketId);
    if (!market) return { maxSpread: 0, sourceCount: 0, sources: {} };

    const now = Date.now();
    const active: Record<string, number> = {};

    for (const [source, state] of market) {
      if (now - state.timestamp <= MAX_STALE_MS) {
        active[source] = state.fairValue;
      }
    }

    const values = Object.values(active);
    if (values.length < 2) {
      return { maxSpread: 0, sourceCount: values.length, sources: active };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
      maxSpread: max - min,
      sourceCount: values.length,
      sources: active,
    };
  }

  /**
   * True if odds sources are significantly diverging, suggesting
   * one source has information the others don't yet.
   */
  isHighDivergence(marketId: string, threshold = 0.05): boolean {
    return this.getDivergence(marketId).maxSpread > threshold;
  }

  getSourceCount(marketId: string): number {
    return this.getDivergence(marketId).sourceCount;
  }

  clear(marketId: string): void {
    this.sources.delete(marketId);
  }
}
