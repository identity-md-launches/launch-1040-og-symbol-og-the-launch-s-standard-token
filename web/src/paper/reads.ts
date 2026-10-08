import { createPublicClient, fallback, http, parseAbi, formatUnits, parseUnits, type Address, type Abi } from "viem";
import { mainnet } from "viem/chains";
import { addresses, abi, nftAbi } from "../chain";
export const paperReadClient = createPublicClient({ chain: mainnet, transport: fallback([
  http("https://ethereum-rpc.publicnode.com", { timeout: 8000, retryCount: 0, batch: { wait: 20, batchSize: 40 } }),
  http("https://eth.drpc.org", { timeout: 8000, retryCount: 0, batch: { wait: 20, batchSize: 40 } }),
]) });
export type Holder = { account: Address; block: bigint; checked: number; og: bigint; decimals: number; nfts: { id: bigint; level: number; weight: bigint }[] };
export async function readHolder(account: Address, progress: (message: string) => void, signal?: AbortSignal): Promise<Holder> {
  const block = await paperReadClient.getBlockNumber();
  const read = (name: string, functionName: string, args: unknown[] = []) => paperReadClient.readContract({ address: addresses[name], abi: (name === "collection" ? nftAbi : abi[name]) as Abi, functionName, args, blockNumber: block });
  const [og, decimals, count] = await Promise.all([read("OG", "balanceOf", [account]), read("OG", "decimals"), read("collection", "balanceOf", [account])]) as [bigint, number, bigint];
  let ids: bigint[] = [];
  if (count > 0n) {
    try {
      ids = await Promise.all(Array.from({ length: Number(count) }, (_, i) => read("collection", "tokenOfOwnerByIndex", [account, BigInt(i)]))) as bigint[];
    } catch {
      const minted = Number(await read("collection", "totalMinted"));
      for (let start = 0; start <= minted && ids.length < Number(count); start += 30) {
        signal?.throwIfAborted();
        progress(`Checking Pepe ownership · ${Math.min(start, minted)} / ${minted}`);
        const matches = await Promise.all(Array.from({ length: Math.min(30, minted + 1 - start) }, async (_, offset) => {
          const id = BigInt(start + offset);
          try {
            const owner = await read("collection", "ownerOf", [id]) as Address;
            return owner.toLowerCase() === account.toLowerCase() ? id : undefined;
          } catch (e) {
            if (/revert|nonexistent|invalid token/i.test(String(e))) return undefined;
            throw e;
          }
        }));
        ids.push(...matches.filter((id): id is bigint => id !== undefined));
      }
    }
  }
  if (ids.length !== Number(count)) throw Error("Ownership scan incomplete. Refresh holder status to retry.");
  const nfts: Holder["nfts"] = [];
  for (let start = 0; start < ids.length; start += 20) {
    signal?.throwIfAborted();
    nfts.push(...await Promise.all(ids.slice(start, start + 20).map(async id => {
      const [owner, level, weight] = await Promise.all([read("collection", "ownerOf", [id]), read("OGDistributor", "level", [id]), read("OGDistributor", "weight", [id])]);
      if ((owner as Address).toLowerCase() !== account.toLowerCase()) throw Error("Ownership mismatch. Refresh to retry.");
      return { id, level: Number(level), weight: weight as bigint };
    })));
  }
  return { account, block, checked: Date.now(), og, decimals, nfts };
}
// Official Uniswap/Circle Ethereum infrastructure, source links retained in docs/paper-launch.md.
// These are read-only quote targets, never Papertrade execution addresses.
const infra = {
  weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  messenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
} as const;
const quoteAbi = parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"]);
export type RouteQuote = { block: bigint; fetched: number; expires: number; currency: "ETH" | "USDC"; amount: number; gasGwei?: number; ethPrice?: number; outputUsdc?: number; swapGas?: bigint; cctpMinimum?: number; limitations: string[] };
export async function readRoute(currency: "ETH" | "USDC", amount: number): Promise<RouteQuote> {
  if (!(amount > 0) || !Number.isFinite(amount)) throw Error("Enter a positive deposit before requesting a quote.");
  if (await paperReadClient.getChainId() !== 1) throw Error("The public RPC did not return Ethereum mainnet.");
  const block = await paperReadClient.getBlockNumber();
  const result: RouteQuote = { block, fetched: Date.now(), expires: Date.now() + 60000, currency, amount, limitations: [] };
  const [gas, swap] = await Promise.allSettled([
    paperReadClient.getGasPrice(),
    paperReadClient.simulateContract({ address: infra.quoter, abi: quoteAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn: infra.weth, tokenOut: infra.usdc, amountIn: parseUnits(String(currency === "ETH" ? amount : 1), 18), fee: 500, sqrtPriceLimitX96: 0n }], blockNumber: block }),
  ]);
  if (gas.status === "fulfilled") result.gasGwei = Number(formatUnits(gas.value, 9));
  else result.limitations.push("Gas price unavailable from public RPC. Refresh to retry.");
  if (swap.status === "fulfilled") {
    const output = Number(formatUnits(swap.value.result[0], 6));
    result.ethPrice = output / (currency === "ETH" ? amount : 1);
    result.outputUsdc = currency === "ETH" ? output : amount;
    result.swapGas = swap.value.result[3];
  } else result.limitations.push("ETH/USDC swap quote unavailable. Refresh to retry; the calculator's manual price remains a scenario.");
  if (currency === "USDC") result.outputUsdc = amount;
  if (result.outputUsdc) {
    try {
      const fee = await paperReadClient.readContract({ address: infra.messenger, abi: parseAbi(["function getMinFeeAmount(uint256 amount) view returns (uint256)"]), functionName: "getMinFeeAmount", args: [parseUnits(result.outputUsdc.toFixed(6), 6)], blockNumber: block });
      result.cctpMinimum = Number(formatUnits(fee, 6));
    } catch { result.limitations.push("CCTP on-chain minimum fee unavailable. No zero fee is assumed."); }
  }
  return result;
}
