import assert from "node:assert/strict";
import { createPublicClient, http, keccak256, encodeFunctionData } from "viem";
import * as C from "../src/chain";
import pinnedAbis from "../src/abis.json";
const endpoint = process.argv[2];
if (!endpoint)
  throw Error(
    "Pass the worker-provided mainnet RPC URL as the first argument.",
  );
C.setReadProvider({
  request: async ({ method, params }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: params || [],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (data.error) throw Object.assign(Error(data.error.message), data.error);
    return data.result;
  },
});
const state = await C.loadState();
await C.verifyRuntime();
const logs = await C.events(state.block, () => {});
const totals = C.eventTotals(logs);
assert.equal(
  totals.ids.length,
  Number(state.counts.reduce((a, b) => a + b, 0n)),
);
const rows = await C.pepes(totals.ids, state.block);
const listed = await C.listings(state.block);
const buy = await C.quote(state.pool, true, C.amount("0.001", 18));
const sell = await C.quote(state.pool, false, C.amount("1000", state.decimals));
assert(buy > 0n && sell > 0n);
const owner = await C.read<`0x${string}`>(
  "collection",
  "ownerOf",
  [1n],
  state.block,
);
const ids = await C.owned(owner, () => {});
assert(ids.includes(1n));
assert.equal(
  ids.length,
  Number(await C.read("collection", "balanceOf", [owner], state.block)),
);
const ownerPepes = await C.pepes(ids, state.block);
assert((await C.metadata(1n)).image?.startsWith("data:image/svg+xml"));
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
// Pin integrity is checked independently from a successful runtime call.
for (const name of ["OG", "OGHook"] as const) {
  const data = canonical(pinnedAbis[name]);
  const hash = keccak256(new TextEncoder().encode(data)).slice(2);
  assert.equal(hash, C.cfg.abiHashes[name]);
}
console.log(
  JSON.stringify(
    {
      status: "passed",
      block: String(state.block),
      state,
      totals,
      active: rows,
      auctions: listed,
      sales: logs.filter((e) => e.event === "AuctionSold"),
      buyQuote: buy,
      sellQuote: sell,
      ownerOfToken1: owner,
      owned: ownerPepes,
      logCount: logs.length,
      checks: [
        "runtime hashes and contract relationships",
        "pinned OG and hook canonical ABI hashes",
        "all state fields at mainnet block",
        "complete event reconstruction equals activePerLevel",
        "all active Pepe levels and pending ETH",
        "current and past auctions",
        "real buy and sell quotes",
        "owned NFT scan and rewards with real public owner",
        "on-chain artwork",
      ],
    },
    (_, v) => (typeof v === "bigint" ? String(v) : v),
    2,
  ),
);
