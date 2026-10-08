import { configured, launchMessage, paperConfig, type LaunchConfig, type Operation } from "./config";
/** An official codec owns every wire field and receipt validation; no guessed API. */
export interface OfficialCodec {
  encode(operation: Operation, payload: unknown): unknown;
  decode(operation: Operation, response: unknown): unknown;
}
export class RelayerAdapter {
  constructor(private config: LaunchConfig = paperConfig, private codec?: OfficialCodec, private transport: typeof fetch = fetch) {}
  async request(operation: Operation, payload: unknown, signal?: AbortSignal) {
    if (!configured(this.config) || !this.codec) throw Error(`${launchMessage}. Official configuration and codec are required.`);
    const endpoint = this.config.operations[operation]!;
    const base = new URL(this.config.relayerUrl!);
    const url = new URL(endpoint.path, base);
    if (url.origin !== base.origin) throw Error("Relayer operation must use the official origin.");
    const encoded = this.codec.encode(operation, payload);
    if (endpoint.method === "GET") {
      if (!encoded || typeof encoded !== "object") throw Error("Official query fields required.");
      for (const [key, value] of Object.entries(encoded)) {
        if (typeof value !== "string") throw Error("Query fields must be strings.");
        url.searchParams.set(key, value);
      }
    }
    // No automatic retry: a timeout can mean accepted. Query the SAME intent ID.
    const response = await this.transport(url, {
      method: endpoint.method, credentials: "omit", redirect: "error", signal: signal ?? AbortSignal.timeout(15000),
      headers: endpoint.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: endpoint.method === "POST" ? JSON.stringify(encoded) : undefined,
    });
    if (!response.ok) throw Error(`Relayer returned ${response.status}. Reconcile the original intent before submitting again.`);
    return this.codec.decode(operation, await response.json());
  }
}
