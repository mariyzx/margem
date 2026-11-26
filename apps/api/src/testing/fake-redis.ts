/**
 * In-memory stand-in for the subset of ioredis used by the API, with real TTL
 * semantics driven by `Date.now()` (works with `vi.setSystemTime`).
 * Test-only: excluded from the production build.
 */
type Entry = { value: string; expiresAt: number | null };
type Command = { name: string; args: unknown[] };

export class FakeRedis {
  private readonly store = new Map<string, Entry>();
  /** Commands issued outside MULTI, in order. */
  readonly standaloneCalls: Command[] = [];
  /** Each executed MULTI block, as the list of queued commands. */
  readonly transactions: Command[][] = [];

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private applyExpire(key: string, ms: number, flag?: unknown): number {
    const entry = this.live(key);
    if (!entry) return 0;
    if (flag === "NX" && entry.expiresAt !== null) return 0;
    entry.expiresAt = Date.now() + ms;
    return 1;
  }

  private run(name: string, args: unknown[]): unknown {
    const [key] = args as [string];
    switch (name) {
      case "incr": {
        const entry = this.live(key);
        const next = Number(entry?.value ?? 0) + 1;
        this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
        return next;
      }
      case "get":
        return this.live(key)?.value ?? null;
      case "del":
        return this.store.delete(key) ? 1 : 0;
      case "set": {
        const [, value, ...opts] = args as [string, string, ...unknown[]];
        let expiresAt: number | null = null;
        let nx = false;
        for (let i = 0; i < opts.length; i++) {
          const opt = String(opts[i]).toUpperCase();
          if (opt === "EX") expiresAt = Date.now() + Number(opts[++i]) * 1000;
          else if (opt === "PX") expiresAt = Date.now() + Number(opts[++i]);
          else if (opt === "NX") nx = true;
        }
        if (nx && this.live(key)) return null;
        this.store.set(key, { value, expiresAt });
        return "OK";
      }
      case "hincrby": {
        // Hashes are kept as JSON in the same entry, so TTL handling stays shared.
        const [, field, by] = args as [string, string, number];
        const entry = this.live(key);
        const hash = entry ? (JSON.parse(entry.value) as Record<string, number>) : {};
        hash[field] = (hash[field] ?? 0) + Number(by);
        this.store.set(key, { value: JSON.stringify(hash), expiresAt: entry?.expiresAt ?? null });
        return hash[field];
      }
      case "hgetall": {
        const entry = this.live(key);
        if (!entry) return {};
        const hash = JSON.parse(entry.value) as Record<string, number>;
        return Object.fromEntries(Object.entries(hash).map(([k, v]) => [k, String(v)]));
      }
      case "pexpire":
        return this.applyExpire(key, Number(args[1]), args[2]);
      case "expire":
        return this.applyExpire(key, Number(args[1]) * 1000, args[2]);
      case "pttl": {
        const entry = this.live(key);
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : entry.expiresAt - Date.now();
      }
      case "ttl": {
        const entry = this.live(key);
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - Date.now()) / 1000);
      }
      default:
        throw new Error(`FakeRedis: unsupported command ${name}`);
    }
  }

  private standalone(name: string, args: unknown[]): Promise<unknown> {
    this.standaloneCalls.push({ name, args });
    return Promise.resolve(this.run(name, args));
  }

  incr = (...args: unknown[]) => this.standalone("incr", args);
  get = (...args: unknown[]) => this.standalone("get", args);
  del = (...args: unknown[]) => this.standalone("del", args);
  set = (...args: unknown[]) => this.standalone("set", args);
  pexpire = (...args: unknown[]) => this.standalone("pexpire", args);
  expire = (...args: unknown[]) => this.standalone("expire", args);
  pttl = (...args: unknown[]) => this.standalone("pttl", args);
  ttl = (...args: unknown[]) => this.standalone("ttl", args);
  hincrby = (...args: unknown[]) => this.standalone("hincrby", args);
  hgetall = (...args: unknown[]) => this.standalone("hgetall", args);

  multi() {
    const queued: Command[] = [];
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of [
      "incr",
      "get",
      "del",
      "set",
      "pexpire",
      "expire",
      "pttl",
      "ttl",
      "hincrby",
      "hgetall",
    ]) {
      chain[name] = (...args: unknown[]) => {
        queued.push({ name, args });
        return chain;
      };
    }
    chain.exec = () => {
      this.transactions.push(queued);
      return Promise.resolve(queued.map((c) => [null, this.run(c.name, c.args)]));
    };
    return chain;
  }

  /** Raw write that bypasses TTL handling, to simulate legacy keys. */
  seed(key: string, value: string): void {
    this.store.set(key, { value, expiresAt: null });
  }

  keys(): string[] {
    return [...this.store.keys()].filter((key) => this.live(key));
  }

  keysWithoutTtl(): string[] {
    return this.keys().filter((key) => this.store.get(key)!.expiresAt === null);
  }

  clear(): void {
    this.store.clear();
    this.standaloneCalls.length = 0;
    this.transactions.length = 0;
  }
}
