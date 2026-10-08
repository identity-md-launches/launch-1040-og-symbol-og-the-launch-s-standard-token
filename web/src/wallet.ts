import { useEffect, useState } from "react";
import type { Address, Hex } from "viem";
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (x: unknown) => void) => void;
  removeListener?: (event: string, fn: (x: unknown) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: Provider[];
};
export type Wallet = {
  info: { uuid: string; name: string; rdns?: string };
  provider: Provider;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function useWallet() {
  const [choices, setChoices] = useState<Wallet[]>([]),
    [wallet, setWallet] = useState<Wallet>(),
    [account, setAccount] = useState<Address>(),
    [chain, setChain] = useState<number>();
  useEffect(() => {
    const announce = (e: Event) => {
      const w = (e as CustomEvent<Wallet>).detail;
      if (!w?.provider?.request || !w.info?.uuid) return;
      setChoices((old) =>
        old.some((x) => x.info.uuid === w.info.uuid) ? old : [...old, w],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const timer = setTimeout(() => {
      const list =
        window.ethereum?.providers ||
        (window.ethereum ? [window.ethereum] : []);
      setChoices((old) => {
        const next = [...old];
        for (const p of list)
          if (!next.some((w) => w.provider === p))
            next.push({
              provider: p,
              info: {
                uuid: `injected-${next.length}`,
                name: p.isRabby
                  ? "Rabby"
                  : p.isMetaMask
                    ? "MetaMask"
                    : "Injected wallet",
              },
            });
        return next;
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", announce);
    };
  }, []);
  useEffect(() => {
    if (!wallet) return;
    const accounts = (a: unknown) => setAccount((a as Address[])[0]);
    const chains = (c: unknown) => setChain(Number(c));
    const disconnect = () => {
      setAccount(undefined);
      setChain(undefined);
    };
    wallet.provider.on?.("accountsChanged", accounts);
    wallet.provider.on?.("chainChanged", chains);
    wallet.provider.on?.("disconnect", disconnect);
    return () => {
      wallet.provider.removeListener?.("accountsChanged", accounts);
      wallet.provider.removeListener?.("chainChanged", chains);
      wallet.provider.removeListener?.("disconnect", disconnect);
    };
  }, [wallet]);
  return {
    choices,
    account,
    chain,
    wallet,
    connect: async (w: Wallet) => {
      const accounts = (await w.provider.request({
        method: "eth_requestAccounts",
      })) as Address[];
      if (!accounts[0])
        throw Error(
          "No account selected. Choose an account in your wallet and retry.",
        );
      const chainId = await w.provider.request({ method: "eth_chainId" });
      setWallet(w);
      setAccount(accounts[0]);
      setChain(Number(chainId));
    },
    disconnect: () => {
      setWallet(undefined);
      setAccount(undefined);
      setChain(undefined);
    },
    switchChain: async () => {
      await wallet?.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }],
      });
      setChain(
        Number(await wallet?.provider.request({ method: "eth_chainId" })),
      );
    },
    send: async (to: Address, data: Hex, value: bigint, gas: bigint) => {
      if (!wallet || !account) throw Error("Connect an injected wallet first.");
      const [actualChain, actualAccounts] = await Promise.all([
        wallet.provider.request({ method: "eth_chainId" }),
        wallet.provider.request({ method: "eth_accounts" }),
      ]);
      if (
        Number(actualChain) !== 1 ||
        (actualAccounts as Address[])[0]?.toLowerCase() !==
          account.toLowerCase()
      )
        throw Error(
          "Wallet changed. Reconnect and review the transaction again.",
        );
      return (await wallet.provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: account,
            to,
            data,
            value: `0x${value.toString(16)}`,
            gas: `0x${gas.toString(16)}`,
          },
        ],
      })) as Hex;
    },
  };
}
export type WalletState = ReturnType<typeof useWallet>;
