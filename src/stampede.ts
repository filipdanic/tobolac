export class StampedeGuard {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = task().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}
