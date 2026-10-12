import {
  createPublicClient,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  keccak256,
  formatUnits,
  parseUnits,
  decodeEventLog,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { resilientTransport } from "./rpc";
import { createEventHistory } from "./history";
export { setReadProvider } from "./rpc";
import deployment from "./deployment.json";
import verified from "./verified.json";
import abis from "./abis.json";
export const cfg = deployment;
export const addresses = Object.fromEntries(
  Object.entries(verified.contracts).map(([k, v]) => [k, v.address]),
) as Record<string, Address>;
export const abi = abis as Record<string, Abi>;
export const client = createPublicClient({
  chain: mainnet,
  transport: resilientTransport,
});
export const nftAbi = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function totalMinted() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
  "function approve(address,uint256)",
]);
export const permitAbi = parseAbi([
  "function allowance(address,address,address) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
const poolTuple =
  "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const quoterAbi = parseAbi([
  `function quoteExactInputSingle((${poolTuple} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountOut,uint256 gasEstimate)`,
  `function quoteExactOutputSingle((${poolTuple} poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns (uint256 amountIn,uint256 gasEstimate)`,
]);
const stateAbi = parseAbi([
  "function getSlot0(bytes32) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
]);
export type Pool = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type State = {
  block: bigint;
  time: bigint;
  fetched: number;
  pool: Pool;
  sqrt: bigint;
  lpFee: number;
  decimals: number;
  supply: bigint;
  burned: bigint;
  launchFee: bigint;
  normalFee: bigint;
  decay: bigint;
  weight: bigint;
  counts: bigint[];
  costs: bigint[];
  weights: bigint[];
  backlog: bigint;
  streamEnd: bigint;
  lock: bigint;
  floor: bigint;
  duration: bigint;
  teamCredit: bigint;
};
export type Pepe = {
  id: bigint;
  level: number;
  weight: bigint;
  pending: bigint;
  last: bigint;
  image?: string;
  name?: string;
};
export type Listing = {
  tokenId: bigint;
  startPrice: bigint;
  startedAt: bigint;
  price: bigint;
};
export type Activity = {
  event: string;
  args: Record<string, unknown>;
  block: bigint;
  hash: Hex;
  index: number;
};
export const read = async <T = bigint>(
  name: string,
  fn: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
): Promise<T> =>
  client.readContract({
    address: addresses[name],
    abi: abi[name] || (name === "collection" ? nftAbi : permitAbi),
    functionName: fn,
    args,
    blockNumber,
  }) as Promise<T>;
export function fmt(n: bigint | undefined, decimals = 18, digits = 4) {
  if (n === undefined) return "—";
  const value = Number(formatUnits(n, decimals));
  return value !== 0 && Math.abs(value) < 10 ** -digits
    ? value.toPrecision(3)
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
export const exact = (n: bigint, decimals = 18) => formatUnits(n, decimals);
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const errorText = (e: unknown) =>
  e instanceof Error
    ? ("shortMessage" in e ? String(e.shortMessage) : e.message).slice(0, 380)
    : String(e).slice(0, 380);
export function amount(text: string, decimals: number) {
  if (
    !/^(?:\d+\.?\d*|\.\d+)$/.test(text) ||
    (text.split(".")[1]?.length || 0) > decimals
  )
    throw Error(`Enter a positive amount with at most ${decimals} decimals.`);
  const n = parseUnits(text, decimals);
  if (n <= 0n || n >= 2n ** 127n)
    throw Error("Enter an amount greater than zero and within the pool limit.");
  return n;
}
export function slippageBps(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw Error(
      "Use a slippage percentage from 0.01 to 10, with at most two decimals.",
    );
  const bps = Math.round(Number(value) * 100);
  if (bps < 1 || bps > 1000)
    throw Error("Use a slippage percentage from 0.01 to 10.");
  return BigInt(bps);
}
export const minOutput = (n: bigint, bps: bigint) =>
  (n * (10000n - bps)) / 10000n;
export const maxInput = (n: bigint, bps: bigint) =>
  (n * (10000n + bps) + 9999n) / 10000n;
export async function verifyRuntime() {
  if ((await client.getChainId()) !== cfg.chainId)
    throw Error("RPC is not Ethereum mainnet. Transactions are disabled.");
  await Promise.all(
    Object.entries(verified.contracts).map(async ([name, c]) => {
      const code = await client.getCode({ address: c.address as Address });
      if (!code || keccak256(code) !== c.codeHash)
        throw Error(
          `Contract verification failed for ${name}. Transactions are disabled.`,
        );
    }),
  );
  const [d, a, t, c, m] = await Promise.all([
    read<Address>("OGHook", "distributor"),
    read<Address>("OGDistributor", "auction"),
    read<Address>("OGHook", "token"),
    read<Address>("OGHook", "COLLECTION"),
    read<Address>("OGHook", "poolManager"),
  ]);
  for (const [actual, expected] of [
    [d, addresses.OGDistributor],
    [a, addresses.OGAuction],
    [t, addresses.OG],
    [c, addresses.collection],
    [m, addresses.poolManager],
  ])
    if (actual.toLowerCase() !== expected.toLowerCase())
      throw Error("Contract relationship verification failed.");
}
export type Snapshot = Partial<State>;
export type StateErrors = Partial<Record<keyof State, string>>;
export const TRADE_FIELDS = [
  "block",
  "time",
  "fetched",
  "pool",
  "sqrt",
  "lpFee",
  "decimals",
  "launchFee",
  "normalFee",
] as const;
export const PEPE_FIELDS = [
  ...TRADE_FIELDS,
  "weight",
  "backlog",
  "streamEnd",
  "lock",
  "costs",
  "weights",
] as const;
export const AUCTION_FIELDS = [
  "block",
  "time",
  "fetched",
  "decimals",
  "floor",
  "duration",
] as const;
export type TradeState = Pick<State, (typeof TRADE_FIELDS)[number]>;
export type PepeState = Pick<State, (typeof PEPE_FIELDS)[number]>;
export type AuctionState = Pick<State, (typeof AUCTION_FIELDS)[number]>;
export function selectState<K extends keyof State>(
  s: Snapshot,
  fields: readonly K[],
): Pick<State, K> | undefined {
  return fields.every((k) => s[k] !== undefined)
    ? (s as Pick<State, K>)
    : undefined;
}
// Each field is published independently; a broken read cannot discard its neighbours.
export async function loadSnapshot(
  publish: (patch: Snapshot, errors: StateErrors) => void,
  keys?: readonly (keyof State)[],
): Promise<Snapshot> {
  const next: Snapshot = {};
  const block = await client.getBlock();
  const b = block.number;
  Object.assign(next, { block: b, time: block.timestamp, fetched: Date.now() });
  publish(next, {});
  const jobs: [keyof State, () => Promise<unknown>][] = [
    ["pool", () => read<Pool>("OGHook", "poolKey", [], b)],
    ["decimals", () => read<number>("OG", "decimals", [], b)],
    ["supply", () => read("OG", "totalSupply", [], b)],
    ["burned", () => read("OG", "totalBurned", [], b)],
    ["launchFee", () => read("OGHook", "launchFeeNow", [], b)],
    ["normalFee", () => read("OGHook", "NORMAL_FEE", [], b)],
    ["decay", () => read("OGHook", "decayMinutesLeft", [], b)],
    ["weight", () => read("OGDistributor", "totalWeight", [], b)],
    ["backlog", () => read("OGDistributor", "backlogLeft", [], b)],
    ["streamEnd", () => read("OGDistributor", "streamEnd", [], b)],
    ["lock", () => read("OGDistributor", "EXIT_LOCK", [], b)],
    ["floor", () => read("OGAuction", "FLOOR", [], b)],
    ["duration", () => read("OGAuction", "DURATION", [], b)],
    ["teamCredit", () => read("OGHook", "teamCredit", [], b)],
    [
      "counts",
      () =>
        Promise.all(
          [1, 2, 3].map((l) => read("OGDistributor", "activePerLevel", [l], b)),
        ),
    ],
    [
      "costs",
      () =>
        Promise.all(
          [1, 2, 3].map((l) => read("OGDistributor", "cumulativeCost", [l], b)),
        ),
    ],
    [
      "weights",
      () =>
        Promise.all(
          [1, 2, 3].map((l) => read("OGDistributor", "levelWeight", [l], b)),
        ),
    ],
  ];
  await Promise.all(
    jobs
      .filter(([key]) => !keys || keys.includes(key) || key === "pool")
      .map(async ([key, run]) => {
        try {
          const value = await run();
          Object.assign(next, { [key]: value });
          publish({ [key]: value }, { [key]: undefined });
          if (key === "pool") {
            try {
              const poolId = keccak256(
                encodeAbiParameters(parseAbiParameters(poolTuple), [
                  value as Pool,
                ]),
              );
              const [sqrt, , , lpFee] = await client.readContract({
                address: addresses.stateView,
                abi: stateAbi,
                functionName: "getSlot0",
                args: [poolId],
                blockNumber: b,
              });
              if (!sqrt) throw Error("Pool is not initialized. Retry shortly.");
              Object.assign(next, { sqrt, lpFee });
              publish({ sqrt, lpFee }, { sqrt: undefined, lpFee: undefined });
            } catch (e) {
              publish({}, { sqrt: errorText(e), lpFee: errorText(e) });
            }
          }
        } catch (e) {
          publish({}, { [key]: errorText(e) });
        }
      }),
  );
  return next;
}
// Full snapshots are useful for validation. UI code consumes progressive snapshots above.
export async function loadState(): Promise<State> {
  const failures: StateErrors = {};
  const s = await loadSnapshot((_, errors) => Object.assign(failures, errors));
  if (Object.values(failures).some(Boolean))
    throw Error(Object.values(failures).filter(Boolean).join("; "));
  return s as State;
}
export function spotPrice(s: Pick<State, "sqrt" | "decimals">) {
  return (2 ** 192 / Number(s.sqrt) ** 2) * 10 ** (s.decimals - 18);
}
export async function quote(
  pool: Pool,
  buy: boolean,
  input: bigint,
  exactOut = false,
) {
  const result = await client.simulateContract({
    address: addresses.quoter,
    abi: quoterAbi,
    functionName: exactOut ? "quoteExactOutputSingle" : "quoteExactInputSingle",
    args: [
      { poolKey: pool, zeroForOne: buy, exactAmount: input, hookData: "0x" },
    ],
  });
  return result.result[0];
}
export function swapData(
  pool: Pool,
  buy: boolean,
  input: bigint,
  minimum: bigint,
  deadline: bigint,
  recipient: Address,
): Hex {
  const params = [
    encodeAbiParameters(
      parseAbiParameters(
        `(${poolTuple} poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)`,
      ),
      [
        {
          poolKey: pool,
          zeroForOne: buy,
          amountIn: input,
          amountOutMinimum: minimum,
          hookData: "0x",
        },
      ],
    ),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      buy ? pool.currency0 : pool.currency1,
      input,
    ]),
    encodeAbiParameters(parseAbiParameters("address,uint256"), [
      buy ? pool.currency1 : pool.currency0,
      minimum,
    ]),
  ];
  // V4_SWAP, then sweep any unspent native input back to the actual connected account.
  const inputs = [
    encodeAbiParameters(parseAbiParameters("bytes,bytes[]"), [
      "0x060c0f",
      params,
    ]),
  ];
  if (buy)
    inputs.push(
      encodeAbiParameters(parseAbiParameters("address,address,uint256"), [
        pool.currency0,
        recipient,
        0n,
      ]),
    );
  return encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: [buy ? "0x1004" : "0x10", inputs, deadline],
  });
}
export type Step = {
  title: string;
  to: Address;
  data: Hex;
  value: bigint;
  detail: string;
};
export function step(
  name: string,
  fn: string,
  args: readonly unknown[],
  title: string,
  detail: string,
  value = 0n,
): Step {
  return {
    title,
    detail,
    to: addresses[name],
    data: encodeFunctionData({
      abi: abi[name] || (name === "collection" ? nftAbi : permitAbi),
      functionName: fn,
      args,
    }),
    value,
  };
}
export async function approvals(
  owner: Address,
  spender: Address,
  cost: bigint,
): Promise<Step[]> {
  const allowance = await read("OG", "allowance", [owner, spender]);
  return allowance >= cost
    ? []
    : [
        step(
          "OG",
          "approve",
          [spender, cost],
          "Approve OG",
          `Allow ${spender} to spend exactly ${exact(cost, await read<number>("OG", "decimals"))} OG.`,
        ),
      ];
}
export async function sellApprovals(
  owner: Address,
  cost: bigint,
  deadline: bigint,
): Promise<Step[]> {
  const steps = await approvals(owner, addresses.permit2, cost);
  const [allowed, expiration] = await read<[bigint, number, number]>(
    "permit2",
    "allowance",
    [owner, addresses.OG, addresses.universalRouter],
  );
  if (allowed < cost || BigInt(expiration) < deadline)
    steps.push(
      step(
        "permit2",
        "approve",
        [addresses.OG, addresses.universalRouter, cost, Number(deadline)],
        "Approve router in Permit2",
        `Permit the Universal Router to spend exactly ${exact(cost, await read<number>("OG", "decimals"))} OG until ${new Date(Number(deadline) * 1000).toLocaleString()}.`,
      ),
    );
  return steps;
}
export async function pepe(id: bigint, block?: bigint): Promise<Pepe> {
  const [level, weight, pending, last] = await Promise.all([
    read<number>("OGDistributor", "level", [id], block),
    read("OGDistributor", "weight", [id], block),
    read("OGDistributor", "pending", [id], block),
    read("OGDistributor", "lastActivation", [id], block),
  ]);
  return { id, level, weight, pending, last };
}
export async function pepeResults(
  ids: bigint[],
  block?: bigint,
  update?: (p: Pepe) => void,
) {
  const items: Pepe[] = [],
    errors: { id: bigint; error: string }[] = [];
  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(
      ids.slice(i, i + 6).map(async (id) => {
        try {
          const p = await pepe(id, block);
          items.push(p);
          update?.(p);
        } catch (e) {
          errors.push({ id, error: errorText(e) });
        }
      }),
    );
  }
  return { items, errors };
}
export async function pepes(ids: bigint[], block?: bigint) {
  const result = await pepeResults(ids, block);
  if (result.errors.length) throw Error(result.errors[0].error);
  return result.items;
}
export async function owned(
  owner: Address,
  progress: (s: string) => void,
  onFound?: (ids: bigint[]) => void,
): Promise<bigint[]> {
  const block = await client.getBlockNumber({ cacheTime: 0 });
  const balance = await read("collection", "balanceOf", [owner], block);
  const key = `og:owned:1:${addresses.collection.toLowerCase()}:${owner.toLowerCase()}`;
  const save = (ids: bigint[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(ids.map(String)));
    } catch {
      /* private mode */
    }
    onFound?.(ids);
    return ids;
  };
  if (!balance) return save([]);
  const found = new Set<bigint>();
  const belongs = async (id: bigint) => {
    try {
      return (
        (
          await read<Address>("collection", "ownerOf", [id], block)
        ).toLowerCase() === owner.toLowerCase()
      );
    } catch (e) {
      if (/revert|nonexistent|invalid token/i.test(errorText(e))) return false;
      throw e;
    }
  };
  // Cache is only a candidate list. Recheck EVERY owner at the current block before showing it.
  let cached: bigint[] = [];
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    if (
      Array.isArray(value) &&
      value.length <= 10000 &&
      value.every((x) => typeof x === "string" && /^\d{1,12}$/.test(x))
    )
      cached = value.map(BigInt);
  } catch {
    /* disabled/corrupt storage */
  }
  for (let i = 0; i < cached.length; i += 12) {
    await Promise.all(
      cached.slice(i, i + 12).map(async (id) => {
        if (await belongs(id)) found.add(id);
      }),
    );
  }
  if (found.size) onFound?.([...found]);
  if (found.size === Number(balance)) return save([...found]);
  // Probe enumeration once: this ERC721A collection may not implement ERC721Enumerable.
  let first: bigint | undefined;
  try {
    first = await read("collection", "tokenOfOwnerByIndex", [owner, 0n], block);
  } catch (e) {
    if (
      !/revert|returned no data|does not exist|function selector/i.test(
        errorText(e),
      )
    )
      throw e;
  }
  if (first !== undefined) {
    const ids = [first];
    for (let offset = 1; offset < Number(balance); offset += 12) {
      ids.push(
        ...(await Promise.all(
          Array.from(
            { length: Math.min(12, Number(balance) - offset) },
            (_, i) =>
              read(
                "collection",
                "tokenOfOwnerByIndex",
                [owner, BigInt(offset + i)],
                block,
              ),
          ),
        )),
      );
      onFound?.([...ids]);
    }
    return save(ids);
  }
  const minted = Number(await read("collection", "totalMinted", [], block));
  for (let start = 0; start <= minted; start += 24) {
    progress(`Finding your Pepes · ${Math.min(start, minted)} / ${minted}`);
    await Promise.all(
      Array.from({ length: Math.min(24, minted + 1 - start) }, async (_, i) => {
        const id = BigInt(start + i);
        if (!found.has(id) && (await belongs(id))) found.add(id);
      }),
    );
    if (found.size) onFound?.([...found]);
    if (found.size === Number(balance)) return save([...found]);
  }
  throw Error(
    "Ownership scan was incomplete. Retry or load a specific token ID.",
  );
}
const metadataCache = new Map<
  string,
  Promise<{ name?: string; image?: string }>
>();
export function metadata(id: bigint) {
  const key = id.toString();
  if (!metadataCache.has(key))
    metadataCache.set(
      key,
      (async () => {
        const uri = await read<string>("collection", "tokenURI", [id]);
        let meta: { name?: string; image?: string };
        if (uri.startsWith("data:application/json")) {
          const [header, ...rest] = uri.split(",");
          meta = JSON.parse(
            header.includes(";base64")
              ? atob(rest.join(","))
              : decodeURIComponent(rest.join(",")),
          );
        } else {
          const response = await fetch(safeURL(uri), {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw Error("Metadata could not load");
          meta = await response.json();
        }
        return {
          name: typeof meta.name === "string" ? meta.name : undefined,
          image:
            typeof meta.image === "string"
              ? safeURL(meta.image, true)
              : undefined,
        };
      })().catch((e) => {
        metadataCache.delete(key);
        throw e;
      }),
    );
  return metadataCache.get(key)!;
}
export function safeURL(url: string, image = false) {
  if (url.startsWith("ipfs://"))
    return "https://ipfs.io/ipfs/" + url.slice(7).replace(/^ipfs\//, "");
  if (
    url.startsWith("https://") ||
    (image && /^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(url))
  )
    return url;
  throw Error("Metadata uses an unsupported URL.");
}
export async function listings(block: bigint) {
  const count = await read("OGAuction", "auctionCount", [], block);
  const result: Listing[] = [];
  for (let offset = 0n; offset < count; offset += 100n)
    result.push(
      ...(await read<Listing[]>(
        "OGAuction",
        "currentAuctions",
        [offset, 100n],
        block,
      )),
    );
  return result;
}
const historyNames = new Set([
  "FeeSplit",
  "TeamPaid",
  "Activated",
  "Upgraded",
  "Exited",
  "AuctionListed",
  "AuctionSold",
]);
const historyEvents = [
  ...new Map(
    Object.values(abi)
      .flat()
      .filter(
        (entry): entry is AbiEvent =>
          entry.type === "event" && historyNames.has(entry.name),
      )
      .map((entry) => [entry.name, entry]),
  ).values(),
];
const history = createEventHistory<Activity>({
  key: `og:events:v4:${cfg.chainId}:${cfg.deploymentBlock}:${addresses.OGHook.toLowerCase()}`,
  start: BigInt(cfg.deploymentBlock),
  getHash: async (blockNumber) => (await client.getBlock({ blockNumber })).hash,
  validate: (e) => {
    if (!historyNames.has(e.event) || !e.args || typeof e.args !== "object")
      return false;
    const required =
      e.event === "FeeSplit"
        ? ["team", "rewards", "surplus", "grossETH"]
        : e.event === "TeamPaid"
          ? ["amount"]
          : e.event === "Exited"
            ? ["tokenId", "ethPaid"]
            : e.event === "AuctionSold"
              ? ["tokenId", "burned"]
              : ["tokenId"];
    return required.every((key) => typeof e.args[key] === "bigint");
  },
  fetch: async (from, to) => {
    const logs = await client.getLogs({
      address: [addresses.OGHook, addresses.OGDistributor, addresses.OGAuction],
      events: historyEvents,
      fromBlock: from,
      toBlock: to,
    });
    return logs.flatMap((l) => {
      if (
        l.removed ||
        l.blockNumber === null ||
        l.transactionHash === null ||
        l.logIndex === null
      )
        return [];
      const name =
        l.address.toLowerCase() === addresses.OGHook.toLowerCase()
          ? "OGHook"
          : l.address.toLowerCase() === addresses.OGAuction.toLowerCase()
            ? "OGAuction"
            : "OGDistributor";
      try {
        const e = decodeEventLog({
          abi: abi[name],
          data: l.data,
          topics: l.topics,
        });
        return [
          {
            event: e.eventName!,
            args: e.args as unknown as Record<string, unknown>,
            block: l.blockNumber,
            hash: l.transactionHash,
            index: l.logIndex,
          },
        ];
      } catch {
        return [];
      } // Only application ABI events contribute to these totals.
    });
  },
});
export const events = history.sync;
export const cachedEvents = history.snapshot;
export function eventTotals(logs: Activity[]) {
  let paid = 0n,
    team = 0n,
    holders = 0n,
    teamPaid = 0n;
  const ids = new Set<bigint>();
  for (const e of logs) {
    const a = e.args;
    if (e.event === "FeeSplit") {
      team += a.team as bigint;
      holders += (a.rewards as bigint) + (a.surplus as bigint);
    }
    if (e.event === "TeamPaid") teamPaid += a.amount as bigint;
    if (e.event === "Exited") {
      paid += a.ethPaid as bigint;
      ids.delete(a.tokenId as bigint);
    }
    if (e.event === "Activated" || e.event === "Upgraded")
      ids.add(a.tokenId as bigint);
  }
  return { paid, team, holders, teamPaid, ids: [...ids] };
}
export function streamRate(
  p: Pepe,
  s: Pick<State, "streamEnd" | "time" | "weight" | "backlog">,
) {
  const remaining = s.streamEnd > s.time ? s.streamEnd - s.time : 0n;
  return remaining && s.weight
    ? (s.backlog * p.weight * 3600n) / remaining / s.weight
    : 0n;
}
