import assert from "node:assert/strict";
import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbiParameters,
  encodeEventTopics,
  encodeAbiParameters,
} from "viem";
import * as C from "../src/chain";
assert.throws(() => C.amount("0", 18));
assert.throws(() => C.amount("-1", 18));
assert.throws(() => C.amount("1e3", 18));
assert.throws(() => C.amount("0.0000000000000000001", 18));
assert.equal(C.amount("1.5", 18), 1500000000000000000n);
assert.equal(C.slippageBps("1.25"), 125n);
assert.throws(() => C.slippageBps("11"));
assert.throws(() => C.slippageBps("0"));
assert.throws(() => C.slippageBps("NaN"));
assert.equal(C.minOutput(10000n, 100n), 9900n);
assert.equal(C.maxInput(101n, 100n), 103n);
assert.throws(() => C.safeURL("javascript:alert(1)", true));
assert.throws(() => C.safeURL("data:text/html,test", true));
assert.equal(C.safeURL("ipfs://hello"), "https://ipfs.io/ipfs/hello");
const state = await C.loadState();
await C.verifyRuntime();
const input = C.amount("0.001", 18),
  output = await C.quote(state.pool, true, input);
assert(output > 0n);
const deadline = state.time + 1200n;
const data = C.swapData(
  state.pool,
  true,
  input,
  C.minOutput(output, 100n),
  deadline,
  C.addresses.OGDistributor,
);
const decoded = decodeFunctionData({ abi: C.routerAbi, data });
assert.equal(decoded.functionName, "execute");
assert.equal(decoded.args[0], "0x1004");
assert.equal(decoded.args[2], deadline);
const [actions, params] = decodeAbiParameters(
  parseAbiParameters("bytes,bytes[]"),
  decoded.args[1][0],
);
assert.equal(actions, "0x060c0f");
assert.equal(params.length, 3);
const [settleCurrency, settleAmount] = decodeAbiParameters(
  parseAbiParameters("address,uint256"),
  params[1],
);
assert.equal(settleCurrency.toLowerCase(), state.pool.currency0.toLowerCase());
assert.equal(settleAmount, input);
const sell = C.swapData(
  state.pool,
  false,
  output,
  1n,
  deadline,
  C.addresses.OGDistributor,
);
assert.equal(
  decodeFunctionData({ abi: C.routerAbi, data: sell }).args[0],
  "0x10",
);
const logs = await C.events(state.block, () => {});
const totals = C.eventTotals(logs);
assert(totals.paid >= 0n);
assert.deepEqual(
  totals.ids.length,
  Number(state.counts.reduce((a, b) => a + b, 0n)),
);
assert((await C.metadata(1n)).image?.startsWith("data:image/svg+xml"));
console.log(
  JSON.stringify(
    {
      status: "passed",
      block: String(state.block),
      checks: [
        "amount precision and bounds",
        "slippage bounds and rounding",
        "unsafe metadata URL rejection",
        "live runtime and relationship verification",
        "real v4 quote",
        "buy/sell action encoding and native refund",
        "event reconstruction agrees with active counts",
        "on-chain NFT metadata",
      ],
      buyQuote: String(output),
      activeCount: totals.ids.length,
    },
    null,
    2,
  ),
);
