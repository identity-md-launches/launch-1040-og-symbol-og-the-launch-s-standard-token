/** Launch-only signing primitives. Not imported by the pre-launch UI. */
import { isAddressEqual, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Provider } from "../wallet";
import { configured, launchMessage, paperConfig, type LaunchConfig, type Operation } from "./config";
function officialTypedData(config: LaunchConfig, operation: Operation, message: Record<string, unknown>) {
  if (!configured(config)) throw Error(launchMessage);
  const schema = config.eip712[operation];
  if (!schema) throw Error("Official EIP-712 definition missing.");
  return { ...schema, message };
}
export function createMemorySession(config: LaunchConfig = paperConfig) {
  if (!configured(config)) throw Error(launchMessage);
  let account: ReturnType<typeof privateKeyToAccount> | undefined = privateKeyToAccount(generatePrivateKey());
  const address = account.address;
  return {
    address,
    async sign(operation: "open" | "close", message: Record<string, unknown>) {
      if (!account || (operation !== "open" && operation !== "close")) throw Error("Session unavailable or action requires the real wallet.");
      return account.signTypedData(officialTypedData(config, operation, message));
    },
    // Drops references; JS cannot guarantee physical memory zeroization.
    destroy() { account = undefined; },
  };
}
export async function signWithWallet(provider: Provider, owner: Address, operation: Exclude<Operation, "status" | "cancel" | "registerProxy">, message: Record<string, unknown>, config: LaunchConfig = paperConfig): Promise<Hex> {
  const data = officialTypedData(config, operation, message);
  const [chain, accounts] = await Promise.all([provider.request({ method: "eth_chainId" }), provider.request({ method: "eth_accounts" })]);
  if (Number(chain) !== 999 || !(accounts as Address[])[0] || !isAddressEqual((accounts as Address[])[0], owner)) throw Error("Wallet account or chain changed. Reconcile before signing.");
  return await provider.request({ method: "eth_signTypedData_v4", params: [owner, JSON.stringify(data, (_, value) => typeof value === "bigint" ? value.toString() : value)] }) as Hex;
}
