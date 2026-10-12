import assert from "node:assert/strict";
import { createRpcReader } from "../src/rpc";
import { createEventHistory } from "../src/history";
const checks: string[] = [];
const ok = (result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
  });
let calls: string[] = [],
  active = 0,
  peak = 0;
const reader = createRpcReader(
  ["https://one.invalid", "https://two.invalid", "https://three.invalid"],
  {
    backoff: 1,
    timeout: 50,
    concurrency: 2,
    fetch: (async (url, init) => {
      calls.push(String(url));
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      if (String(url).includes("one"))
        return new Response("{}", { status: 403 });
      if (String(url).includes("two"))
        return new Response("{}", { status: 429 });
      return ok(
        JSON.parse(String(init?.body)).method === "eth_chainId" ? "0x1" : "0x2",
      );
    }) as typeof fetch,
  },
);
assert.equal(await reader.request({ method: "eth_chainId" }), "0x1");
assert.deepEqual(calls, [
  "https://one.invalid",
  "https://two.invalid",
  "https://three.invalid",
]);
checks.push("403 and 429 rotate to a working provider");
calls = [];
await Promise.all(
  Array.from({ length: 8 }, (_, i) =>
    reader.request({ method: "eth_getBalance", params: [String(i), "latest"] }),
  ),
);
assert(peak <= 2);
assert(calls.every((x) => x.includes("three")));
checks.push("concurrency limit and failed-provider cooldown");
let walletCalls = 0;
reader.setProvider({
  request: async () => {
    walletCalls++;
    return "0xwallet";
  },
});
assert.equal(await reader.request({ method: "eth_blockNumber" }), "0xwallet");
assert.equal(walletCalls, 1);
reader.setProvider({ request: () => new Promise(() => {}) });
assert.equal(await reader.request({ method: "eth_blockNumber" }), "0x2");
reader.setProvider(undefined);
checks.push(
  "wallet-first reads, hung-wallet timeout and public fallback, disconnect",
);
await assert.rejects(
  () => reader.request({ method: "eth_sendTransaction", params: [] }),
  /Unsupported read/,
);
checks.push(
  "public transport refuses writes and wallet authorization requests",
);
let dedup = 0;
const single = createRpcReader(["https://one.invalid"], {
  fetch: (async () => {
    dedup++;
    await new Promise((r) => setTimeout(r, 4));
    return ok("0x1");
  }) as typeof fetch,
});
await Promise.all([
  single.request({ method: "eth_chainId" }),
  single.request({ method: "eth_chainId" }),
]);
assert.equal(dedup, 1);
checks.push("identical concurrent requests are shared");
let revertCalls = 0;
const reverted = createRpcReader(["https://a.invalid", "https://b.invalid"], {
  fetch: (async () => {
    revertCalls++;
    return new Response(
      JSON.stringify({
        error: { code: 3, message: "execution reverted", data: "0xabcd" },
      }),
    );
  }) as typeof fetch,
});
await assert.rejects(() => reverted.request({ method: "eth_call" }));
assert.equal(revertCalls, 1);
checks.push(
  "contract reverts retain their error and are not endlessly retried",
);
const memory = new Map<string, string>();
const storage = {
  getItem: (k: string) => memory.get(k) || null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
};
const hash = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
let logActive = 0,
  logPeak = 0,
  fail = false,
  reorg = false;
let ranges: [bigint, bigint][] = [];
const fetchLogs = async (from: bigint, to: bigint) => {
  ranges.push([from, to]);
  if (to - from > 9n) throw Error("up to a 10 block range");
  if (fail && from >= 150n) throw Error("HTTP 403");
  logActive++;
  logPeak = Math.max(logPeak, logActive);
  await new Promise((r) => setTimeout(r, 1));
  logActive--;
  return Array.from({ length: Number(to - from + 1n) }, (_, i) => ({
    block: from + BigInt(i),
    hash: hash(from + BigInt(i)),
    index: 0,
    value: reorg ? 2n : 1n,
  }));
};
const options = {
  key: "test-history",
  start: 100n,
  fetch: fetchLogs,
  getHash: async (n: bigint) => hash(reorg ? n + 10000n : n),
  storage,
  chunk: 40n,
};
let history = createEventHistory(options);
let result = await history.sync(179n, () => {});
assert.equal(result.length, 80);
assert(logPeak <= 3);
assert.equal(history.snapshot().complete, true);
checks.push(
  "adaptive log shrinking down to provider limit and three-worker bound",
);
history = createEventHistory(options);
ranges = [];
result = await history.sync(189n, () => {});
assert.equal(result.length, 90);
assert(ranges.every(([from]) => from >= 148n));
assert.equal(new Set(result.map((e) => e.hash)).size, 90);
checks.push(
  "persistent checkpoint resumes with 32-block overlap without duplicates",
);
reorg = true;
ranges = [];
history = createEventHistory(options);
result = await history.sync(189n, () => {});
assert.equal(ranges[0][0], 100n);
assert(result.every((e) => e.value === 2n));
checks.push("checkpoint block-hash mismatch discards old-fork history");
const broken = createEventHistory({ ...options, key: "partial", chunk: 10n });
fail = true;
await assert.rejects(() => broken.sync(179n, () => {}));
assert.equal(broken.snapshot().complete, false);
assert.equal(broken.snapshot().through, 149n);
assert.equal(broken.snapshot().logs.length, 50);
fail = false;
assert.equal((await broken.sync(179n, () => {})).length, 80);
checks.push(
  "failed log range never advances checkpoint; completed ranges survive and resume",
);
storage.setItem("corrupt", "bad-json");
const corrupted = createEventHistory({ ...options, key: "corrupt" });
assert.equal((await corrupted.sync(109n, () => {})).length, 10);
const blockedStorage = {
  getItem: () => {
    throw Error("disabled");
  },
  setItem: () => {
    throw Error("quota");
  },
  removeItem: () => {
    throw Error("disabled");
  },
};
assert.equal(
  (
    await createEventHistory({ ...options, storage: blockedStorage }).sync(
      109n,
      () => {},
    )
  ).length,
  10,
);
checks.push("corrupt, disabled and full localStorage do not break live reads");
console.log(JSON.stringify({ status: "passed", checks }, null, 2));
