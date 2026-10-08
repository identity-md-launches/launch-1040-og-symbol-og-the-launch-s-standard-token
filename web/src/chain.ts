import {
  createPublicClient,
  http,
  parseAbi,
  encodeAbiParameters,
  parseAbiParameters,
  encodeFunctionData,
  keccak256,
  formatUnits,
  parseUnits,
  decodeEventLog,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
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
  transport: http(cfg.rpc, {
    batch: { wait: 20, batchSize: 50 },
    timeout: 20000,
    retryCount: 2,
  }),
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
export async function loadState(): Promise<State> {
  const block = await client.getBlock();
  const b = block.number;
  const [
    pool,
    decimals,
    supply,
    burned,
    launchFee,
    normalFee,
    decay,
    weight,
    backlog,
    streamEnd,
    lock,
    floor,
    duration,
    teamCredit,
    counts,
    costs,
    weights,
  ] = await Promise.all([
    read<Pool>("OGHook", "poolKey", [], b),
    read<number>("OG", "decimals", [], b),
    read("OG", "totalSupply", [], b),
    read("OG", "totalBurned", [], b),
    read("OGHook", "launchFeeNow", [], b),
    read("OGHook", "NORMAL_FEE", [], b),
    read("OGHook", "decayMinutesLeft", [], b),
    read("OGDistributor", "totalWeight", [], b),
    read("OGDistributor", "backlogLeft", [], b),
    read("OGDistributor", "streamEnd", [], b),
    read("OGDistributor", "EXIT_LOCK", [], b),
    read("OGAuction", "FLOOR", [], b),
    read("OGAuction", "DURATION", [], b),
    read("OGHook", "teamCredit", [], b),
    Promise.all(
      [1, 2, 3].map((l) => read("OGDistributor", "activePerLevel", [l], b)),
    ),
    Promise.all(
      [1, 2, 3].map((l) => read("OGDistributor", "cumulativeCost", [l], b)),
    ),
    Promise.all(
      [1, 2, 3].map((l) => read("OGDistributor", "levelWeight", [l], b)),
    ),
  ]);
  const poolId = keccak256(
    encodeAbiParameters(parseAbiParameters(poolTuple), [pool]),
  );
  const [sqrt, , , lpFee] = await client.readContract({
    address: addresses.stateView,
    abi: stateAbi,
    functionName: "getSlot0",
    args: [poolId],
    blockNumber: b,
  });
  if (!sqrt)
    throw Error("Pool is not initialized. Refresh after initialization.");
  return {
    block: b,
    time: block.timestamp,
    fetched: Date.now(),
    pool,
    sqrt,
    lpFee,
    decimals,
    supply,
    burned,
    launchFee,
    normalFee,
    decay,
    weight,
    counts,
    costs,
    weights,
    backlog,
    streamEnd,
    lock,
    floor,
    duration,
    teamCredit,
  };
}
export function spotPrice(s: State) {
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
export async function pepes(ids: bigint[], block?: bigint) {
  const result: Pepe[] = [];
  for (let i = 0; i < ids.length; i += 25) {
    result.push(
      ...(await Promise.all(
        ids.slice(i, i + 25).map(async (id) => {
          const [level, weight, pending, last] = await Promise.all([
            read<number>("OGDistributor", "level", [id], block),
            read("OGDistributor", "weight", [id], block),
            read("OGDistributor", "pending", [id], block),
            read("OGDistributor", "lastActivation", [id], block),
          ]);
          return { id, level, weight, pending, last };
        }),
      )),
    );
  }
  return result;
}
export async function owned(
  owner: Address,
  progress: (s: string) => void,
): Promise<bigint[]> {
  const block = await client.getBlockNumber();
  const balance = await read("collection", "balanceOf", [owner], block);
  if (!balance) return [];
  try {
    return await Promise.all(
      Array.from({ length: Number(balance) }, (_, i) =>
        read("collection", "tokenOfOwnerByIndex", [owner, BigInt(i)], block),
      ),
    );
  } catch {
    /* ERC721A collection does not necessarily expose enumeration. */
  }
  const minted = Number(await read("collection", "totalMinted", [], block));
  const found: bigint[] = [];
  for (let start = 0; start <= minted; start += 50) {
    progress(`Finding your Pepes · ${Math.min(start, minted)} / ${minted}`);
    const batch = await Promise.all(
      Array.from({ length: Math.min(50, minted + 1 - start) }, async (_, i) => {
        const id = BigInt(start + i);
        try {
          return (
            await read<Address>("collection", "ownerOf", [id], block)
          ).toLowerCase() === owner.toLowerCase()
            ? id
            : undefined;
        } catch (e) {
          if (/revert|nonexistent|invalid token/i.test(errorText(e)))
            return undefined;
          throw e;
        }
      }),
    );
    found.push(...batch.filter((x): x is bigint => x !== undefined));
    if (found.length === Number(balance)) return found;
  }
  if (found.length !== Number(balance))
    throw Error(
      "Ownership scan was incomplete. Retry or load a specific token ID.",
    );
  return found;
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
async function logRange(from: bigint, to: bigint): Promise<Activity[]> {
  try {
    const logs = await client.getLogs({
      address: [addresses.OGHook, addresses.OGDistributor, addresses.OGAuction],
      fromBlock: from,
      toBlock: to,
    });
    return logs.flatMap((l) => {
      try {
        const name =
          l.address.toLowerCase() === addresses.OGHook.toLowerCase()
            ? "OGHook"
            : l.address.toLowerCase() === addresses.OGAuction.toLowerCase()
              ? "OGAuction"
              : "OGDistributor";
        const e = decodeEventLog({
          abi: abi[name],
          data: l.data,
          topics: l.topics,
        });
        return [
          {
            event: e.eventName!,
            args: e.args as unknown as Record<string, unknown>,
            block: l.blockNumber!,
            hash: l.transactionHash!,
            index: l.logIndex!,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch (e) {
    if (to - from < 20n) throw e;
    const mid = (from + to) / 2n;
    return [...(await logRange(from, mid)), ...(await logRange(mid + 1n, to))];
  }
}
let eventCache: Activity[] = [];
let lastEventBlock = BigInt(cfg.deploymentBlock) - 1n;
export async function events(to: bigint, progress: (s: string) => void) {
  let from = lastEventBlock - 20n;
  if (from < BigInt(cfg.deploymentBlock)) from = BigInt(cfg.deploymentBlock);
  if (from > to) {
    eventCache = [];
    from = BigInt(cfg.deploymentBlock);
  }
  const next = eventCache.filter((e) => e.block < from);
  for (let start = from; start <= to; start += 2000n) {
    progress(`Syncing events · block ${start.toLocaleString()}`);
    next.push(
      ...(await logRange(start, start + 1999n < to ? start + 1999n : to)),
    );
  }
  eventCache = next;
  lastEventBlock = to;
  return [...next].sort((a, b) =>
    a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1,
  );
}
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
export function streamRate(p: Pepe, s: State) {
  const remaining = s.streamEnd > s.time ? s.streamEnd - s.time : 0n;
  return remaining && s.weight
    ? (s.backlog * p.weight * 3600n) / remaining / s.weight
    : 0n;
}
