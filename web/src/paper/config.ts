/** The ONLY Papertrade execution configuration. No launch values are inferred. */
import type { Address, TypedData } from "viem";
export const contractNames = ["Exchange", "BatchExecutor", "SessionKeyManager", "DepositProxyFactory", "PriceOracle", "PaperToken", "PaperTokenomics", "PaperStaking"] as const;
export type Operation = "registerProxy" | "registerSession" | "open" | "close" | "status" | "cancel" | "stake" | "unstake" | "claim" | "withdraw";
export type LaunchConfig = {
  chainId: 999;
  version: string | null;
  addresses: Record<typeof contractNames[number], Address | null>;
  relayerUrl: string | null;
  // Official paths, methods, typed domains and schemas must be supplied verbatim.
  operations: Partial<Record<Operation, { path: string; method: "GET" | "POST" }>>;
  eip712: Partial<Record<Operation, { domain: Record<string, string | number>; primaryType: string; types: TypedData }>>;
  proxyDerivation: { saltEncoding: string; initCodeHash: string } | null;
};
export const paperConfig: LaunchConfig = {
  chainId: 999, version: null,
  addresses: { Exchange: null, BatchExecutor: null, SessionKeyManager: null, DepositProxyFactory: null, PriceOracle: null, PaperToken: null, PaperTokenomics: null, PaperStaking: null },
  relayerUrl: null, operations: {}, eip712: {}, proxyDerivation: null,
};
export const launchMessage = "Enabled at Papertrade launch";
export function configured(c: LaunchConfig = paperConfig) {
  return c.chainId === 999 && !!c.version && !!c.relayerUrl?.startsWith("https://") &&
    contractNames.every(name => /^0x[0-9a-fA-F]{40}$/.test(c.addresses[name] ?? "") &&
      !/^0x0{40}$/i.test(c.addresses[name]!) && !/^0x0{36}dead$/i.test(c.addresses[name]!)) &&
    !!c.proxyDerivation && ["registerProxy", "registerSession", "open", "close", "status", "cancel", "stake", "unstake", "claim", "withdraw"].every(op => !!c.operations[op as Operation]) &&
    ["registerSession", "open", "close", "stake", "unstake", "claim", "withdraw"].every(op => {
      const t = c.eip712[op as Operation];
      return !!t?.primaryType && !!t.types[t.primaryType]?.length && t.domain.chainId === 999;
    });
}
