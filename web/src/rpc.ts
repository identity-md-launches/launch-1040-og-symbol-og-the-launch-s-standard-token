import { createTransport, type Transport, type EIP1193RequestFn } from "viem";

export type ReadProvider = {
  request(args: {
    method: string;
    params?: readonly unknown[];
  }): Promise<unknown>;
};
export type RpcRequest = { method: string; params?: readonly unknown[] };
export class RpcError extends Error {
  constructor(
    message: string,
    public code?: number,
    public data?: unknown,
  ) {
    super(message);
  }
}
export const isRevert = (e: unknown) =>
  e instanceof RpcError &&
  (e.code === 3 || /execution reverted|revert\b/i.test(e.message));
export const isRangeError = (e: unknown) =>
  e instanceof Error &&
  /block range|range.*(?:large|limit)|too many (?:results|blocks)|query returned more|response size|limit.*blocks/i.test(
    e.message,
  );

// Public URLs only. Browser probes and selection are recorded in docs/rpc-browser-probes.json.
export const PUBLIC_RPCS = [
  "https://rpc.mevblocker.io",
  "https://eth.drpc.org",
  "https://eth-mainnet.public.blastapi.io",
];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function timed<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Read timed out. Retry shortly.")),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export function createRpcReader(
  urls: readonly string[],
  options: {
    fetch?: typeof fetch;
    timeout?: number;
    concurrency?: number;
    backoff?: number;
    interval?: number;
  } = {},
) {
  const fetcher = options.fetch || globalThis.fetch.bind(globalThis);
  const timeout = options.timeout ?? 6000;
  const concurrency = options.concurrency ?? 6;
  const backoff = options.backoff ?? 350;
  const health = urls.map(() => ({ until: 0, failures: 0 }));
  const nextRequest = urls.map(() => 0);
  let provider: ReadProvider | undefined,
    providerUntil = 0,
    cursor = 0,
    active = 0,
    id = 0;
  const queue: (() => void)[] = [];
  const inFlight = new Map<string, Promise<unknown>>();
  async function limited<T>(run: () => Promise<T>) {
    if (active >= concurrency)
      await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      return await run();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  }
  async function publicCall(index: number, args: RpcRequest) {
    // Pace each public host as well as bounding concurrency, including large NFT scans.
    const wait = Math.max(0, nextRequest[index] - Date.now());
    nextRequest[index] = Date.now() + wait + (options.interval ?? 45);
    if (wait) await sleep(wait);
    const response = await fetcher(urls[index], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++id,
        ...args,
        params: args.params || [],
      }),
      signal: AbortSignal.timeout(timeout),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new RpcError(
        `Read service returned HTTP ${response.status}. ${body.error?.message || ""}`,
        response.status,
        body.error?.data,
      );
    if (body.error)
      throw new RpcError(
        body.error.message || "RPC read failed",
        body.error.code,
        body.error.data,
      );
    if (!("result" in body))
      throw new RpcError("Read service returned an incomplete response.");
    return body.result;
  }
  async function attempt(args: RpcRequest) {
    const connected = provider;
    if (connected && Date.now() >= providerUntil) {
      try {
        return await timed(connected.request(args), timeout);
      } catch (e) {
        // A wallet can reject a method or restrict history. Public reads still work.
        if (isRevert(e)) throw e;
        providerUntil = Date.now() + 15000;
      }
    }
    let last: unknown;
    for (let round = 0; round < 2; round++) {
      // Ordinary reads must not move history permanently onto a restricted log host.
      const start = args.method === "eth_getLogs" ? 0 : cursor;
      let rangeFailure: unknown;
      let attempted = false;
      for (let n = 0; n < urls.length; n++) {
        const index = (start + n) % urls.length;
        if (Date.now() < health[index].until) continue;
        attempted = true;
        try {
          const result = await publicCall(index, args);
          health[index] = { failures: 0, until: 0 };
          cursor = index;
          return result;
        } catch (e) {
          if (isRevert(e)) throw e;
          // Splitting the requested range is more useful than repeating it at every host.
          if (args.method === "eth_getLogs" && isRangeError(e)) {
            rangeFailure = e;
            continue;
          }
          last = e;
          const failures = Math.min(health[index].failures + 1, 6);
          health[index] = {
            failures,
            until: Date.now() + Math.min(30000, backoff * 2 ** failures),
          };
          cursor = (index + 1) % urls.length;
        }
      }
      if (rangeFailure) throw rangeFailure;
      if (round === 0) {
        const wait = Math.min(
          1500,
          Math.max(
            backoff,
            Math.min(...health.map((h) => h.until)) - Date.now(),
          ),
        );
        await sleep(wait + Math.floor(Math.random() * backoff));
      } else if (!attempted && !last)
        last = new Error("Read services are recovering. Retrying shortly.");
    }
    throw last || new Error("Ethereum reads are unavailable. Retry shortly.");
  }
  return {
    setProvider(next?: ReadProvider) {
      provider = next;
      providerUntil = 0;
      inFlight.clear();
    },
    request(args: RpcRequest): Promise<unknown> {
      // This transport never forwards signing, permissions or writes to a public server.
      if (
        !/^eth_(?:call|getCode|getBalance|getBlockByNumber|getBlockByHash|blockNumber|chainId|getLogs|estimateGas|gasPrice|getTransactionReceipt|getTransactionByHash|getTransactionCount|maxPriorityFeePerGas|feeHistory)$/.test(
          args.method,
        )
      )
        return Promise.reject(
          new Error(`Unsupported read method: ${args.method}`),
        );
      const key = JSON.stringify(args);
      const existing = inFlight.get(key);
      if (existing) return existing;
      const request = limited(() => attempt(args));
      inFlight.set(key, request);
      void request
        .finally(() => {
          if (inFlight.get(key) === request) inFlight.delete(key);
        })
        .catch(() => {});
      return request;
    },
  };
}
export const rpcReader = createRpcReader(PUBLIC_RPCS);
export const setReadProvider = (provider?: ReadProvider) =>
  rpcReader.setProvider(provider);
export const resilientTransport: Transport = () =>
  createTransport({
    key: "og-reads",
    name: "Wallet-first Ethereum reads",
    type: "custom",
    retryCount: 0,
    request: rpcReader.request as EIP1193RequestFn,
  });
