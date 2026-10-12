// A resumable, deployment-scoped log index. No indexer or hosted backend is required.
type Indexed = { block: bigint; hash: string; index: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type HistorySnapshot<T> = {
  logs: T[];
  through: bigint;
  target: bigint;
  complete: boolean;
  persistent: boolean;
};
const encode = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? { $bigint: v.toString() } : v,
  );
const decode = (value: string) =>
  JSON.parse(value, (_, v) =>
    v &&
    typeof v === "object" &&
    Object.keys(v).length === 1 &&
    /^-?\d+$/.test(v.$bigint)
      ? BigInt(v.$bigint)
      : v,
  );
export function createEventHistory<T extends Indexed>(options: {
  key: string;
  start: bigint;
  fetch: (from: bigint, to: bigint) => Promise<T[]>;
  getHash: (block: bigint) => Promise<string | null>;
  storage?: StorageLike;
  chunk?: bigint;
  concurrency?: number;
  validate?: (log: T) => boolean;
}) {
  let logs: T[] = [],
    through = options.start - 1n,
    checkpointHash: string | null = null;
  let target = through,
    complete = false,
    hydrated = false,
    validated = false;
  let storage: StorageLike | undefined;
  try {
    storage =
      options.storage ||
      (typeof localStorage === "undefined" ? undefined : localStorage);
  } catch {
    /* private browsing */
  }
  let chunk = options.chunk ?? 500n;
  let running: Promise<T[]> | undefined;
  const sort = (items: T[]) =>
    [...new Map(items.map((e) => [`${e.hash}:${e.index}`, e])).values()].sort(
      (a, b) =>
        a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1,
    );
  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      const raw = storage?.getItem(options.key);
      if (!raw) return;
      const saved = decode(raw);
      if (
        saved.version !== 3 ||
        typeof saved.through !== "bigint" ||
        saved.through < options.start - 1n ||
        !Array.isArray(saved.logs) ||
        !/^0x[\da-f]{64}$/i.test(saved.hash)
      )
        throw Error("Invalid history cache");
      if (
        !saved.logs.every(
          (e: T) =>
            typeof e.block === "bigint" &&
            e.block >= options.start &&
            e.block <= saved.through &&
            /^0x[\da-f]{64}$/i.test(e.hash) &&
            Number.isSafeInteger(e.index) &&
            e.index >= 0 &&
            (!options.validate || options.validate(e)),
        )
      )
        throw Error("Invalid cached log");
      logs = sort(saved.logs);
      through = saved.through;
      checkpointHash = saved.hash;
    } catch {
      logs = [];
      through = options.start - 1n;
      checkpointHash = null;
      try {
        storage?.removeItem(options.key);
      } catch {
        /* storage can be disabled */
      }
    }
  }
  function snapshot(): HistorySnapshot<T> {
    hydrate();
    return {
      logs: [...logs],
      through,
      target,
      complete,
      persistent: !!storage,
    };
  }
  async function persist() {
    if (through < options.start) return;
    // Store only a checkpoint whose block hash was actually read. A failed hash read
    // leaves the previous durable checkpoint intact; it never loses in-memory logs.
    try {
      const hash = await options.getHash(through);
      if (!hash) return;
      checkpointHash = hash;
      storage?.setItem(
        options.key,
        encode({ version: 3, through, hash, logs }),
      );
    } catch {
      /* quota, private mode or temporary hash read failure */
    }
  }
  async function range(from: bigint, to: bigint): Promise<T[]> {
    try {
      return await options.fetch(from, to);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Authentication/outage errors cannot be fixed by querying thousands of smaller ranges.
      if (
        to === from ||
        !/range|limit|too (?:many|large)|timeout|timed out|size|exceed/i.test(
          message,
        )
      )
        throw e;
      chunk = chunk > 1n ? chunk / 2n : 1n;
      const middle = (from + to) / 2n;
      return [
        ...(await range(from, middle)),
        ...(await range(middle + 1n, to)),
      ];
    }
  }
  async function scan(
    to: bigint,
    progress: (message: string) => void,
    update?: (s: HistorySnapshot<T>) => void,
  ) {
    hydrate();
    target = to;
    complete = false;
    if (through > to) {
      logs = [];
      through = options.start - 1n;
      checkpointHash = null;
    }
    if (!validated && through >= options.start) {
      const hash = await options.getHash(through);
      if (hash !== checkpointHash) {
        logs = [];
        through = options.start - 1n;
        checkpointHash = null;
      }
    }
    validated = true;
    // The last 32 blocks are replaced, not appended, so removed/reordered events disappear.
    const restart =
      through - 31n > options.start ? through - 31n : options.start;
    let next = logs.filter((e) => e.block < restart);
    let cursor = restart;
    while (cursor <= to) {
      const batch: { from: bigint; to: bigint }[] = [];
      for (let n = 0; n < (options.concurrency ?? 3) && cursor <= to; n++) {
        const end = cursor + chunk - 1n < to ? cursor + chunk - 1n : to;
        batch.push({ from: cursor, to: end });
        cursor = end + 1n;
      }
      progress(
        `Syncing events · block ${batch[0].from.toLocaleString()} / ${to.toLocaleString()}`,
      );
      const results = await Promise.allSettled(
        batch.map((r) => range(r.from, r.to)),
      );
      // Advance only over contiguous successful ranges. Gaps never become "zero events".
      let failure: unknown;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === "rejected") {
          failure = result.reason;
          break;
        }
        next = sort([...next, ...result.value]);
        logs = next;
        through = batch[i].to;
      }
      await persist();
      update?.(snapshot());
      if (failure) throw failure;
      if (chunk < 1000n) chunk = chunk * 2n > 1000n ? 1000n : chunk * 2n;
    }
    complete = true;
    update?.(snapshot());
    progress("");
    return [...logs];
  }
  return {
    snapshot,
    sync(
      to: bigint,
      progress: (message: string) => void,
      update?: (s: HistorySnapshot<T>) => void,
    ) {
      if (running) return running;
      const task = scan(to, progress, update);
      running = task;
      void task
        .finally(() => {
          running = undefined;
        })
        .catch(() => {});
      return task;
    },
  };
}
