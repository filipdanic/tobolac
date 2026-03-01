import type { CacheStatsSnapshot, EvictionReason, StatsAccessor } from "./types";

interface MutableStats {
  hits: number;
  misses: number;
  stales: number;
  evictions: {
    ttl: number;
    lru: number;
    manual: number;
  };
}

function emptyStats(): MutableStats {
  return {
    hits: 0,
    misses: 0,
    stales: 0,
    evictions: {
      ttl: 0,
      lru: 0,
      manual: 0
    }
  };
}

class NamespaceStats {
  private stats = emptyStats();

  hit(): void {
    this.stats.hits += 1;
  }

  miss(): void {
    this.stats.misses += 1;
  }

  stale(): void {
    this.stats.stales += 1;
  }

  eviction(reason: EvictionReason): void {
    this.stats.evictions[reason] += 1;
  }

  snapshot(): CacheStatsSnapshot {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      stales: this.stats.stales,
      evictions: { ...this.stats.evictions },
      hitRate: total === 0 ? 0 : this.stats.hits / total
    };
  }

  reset(): void {
    this.stats = emptyStats();
  }
}

export class StatsTracker {
  private readonly perNamespace = new Map<string, NamespaceStats>();

  private ensure(namespace: string): NamespaceStats {
    let namespaceStats = this.perNamespace.get(namespace);
    if (!namespaceStats) {
      namespaceStats = new NamespaceStats();
      this.perNamespace.set(namespace, namespaceStats);
    }
    return namespaceStats;
  }

  hit(namespace: string): void {
    this.ensure(namespace).hit();
  }

  miss(namespace: string): void {
    this.ensure(namespace).miss();
  }

  stale(namespace: string): void {
    this.ensure(namespace).stale();
  }

  eviction(namespace: string, reason: EvictionReason): void {
    this.ensure(namespace).eviction(reason);
  }

  namespaceAccessor(namespace: string): StatsAccessor {
    const accessor = (() => this.ensure(namespace).snapshot()) as StatsAccessor;
    accessor.reset = () => this.ensure(namespace).reset();
    return accessor;
  }

  globalAccessor(): StatsAccessor {
    const accessor = (() => {
      const stats = Array.from(this.perNamespace.values()).map((namespace) => namespace.snapshot());
      const totalHits = stats.reduce((sum, s) => sum + s.hits, 0);
      const totalMisses = stats.reduce((sum, s) => sum + s.misses, 0);
      const totalStales = stats.reduce((sum, s) => sum + s.stales, 0);
      const evictions = stats.reduce(
        (acc, s) => {
          acc.ttl += s.evictions.ttl;
          acc.lru += s.evictions.lru;
          acc.manual += s.evictions.manual;
          return acc;
        },
        { ttl: 0, lru: 0, manual: 0 }
      );
      const total = totalHits + totalMisses;
      return {
        hits: totalHits,
        misses: totalMisses,
        stales: totalStales,
        evictions,
        hitRate: total === 0 ? 0 : totalHits / total
      };
    }) as StatsAccessor;

    accessor.reset = () => {
      for (const namespace of this.perNamespace.values()) {
        namespace.reset();
      }
    };

    return accessor;
  }
}
