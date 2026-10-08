import fs from "node:fs";
import { createPublicClient, http, keccak256, toBytes } from "viem";
import { mainnet } from "viem/chains";
const d = JSON.parse(
  fs.readFileSync(new URL("../src/deployment.json", import.meta.url)),
);
const client = createPublicClient({
  chain: mainnet,
  transport: http(d.rpc, { batch: true }),
});
const abi = {};
const report = {
  sourceCommit: d.sourceCommit,
  rpc: d.rpc,
  chainId: await client.getChainId(),
  block: Number(await client.getBlockNumber()),
  contracts: {},
};
if (report.chainId !== d.chainId) throw Error("Chain mismatch");
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
for (const name of ["OG", "OGHook", "OGDistributor", "OGAuction"]) {
  const artifact = JSON.parse(
    fs.readFileSync(
      new URL(
        `../../test/scratch/forge-out/${name}.sol/${name}.json`,
        import.meta.url,
      ),
    ),
  );
  abi[name] = artifact.abi;
  const accepted = JSON.parse(
    fs.readFileSync(new URL(`../../abi/${name}.json`, import.meta.url)),
  );
  if (
    JSON.stringify(canonical(accepted)) !==
    JSON.stringify(canonical(artifact.abi))
  )
    throw Error(`${name}: accepted ABI mismatch`);
  const hash = keccak256(
    toBytes(JSON.stringify(canonical(artifact.abi))),
  ).slice(2);
  if (d.abiHashes[name] && hash !== d.abiHashes[name])
    throw Error(`${name}: pinned ABI hash mismatch ${hash}`);
  let address =
    name === "OG"
      ? d.token
      : name === "OGHook"
        ? d.hook
        : name === "OGDistributor"
          ? await client.readContract({
              address: d.hook,
              abi: abi.OGHook,
              functionName: "distributor",
            })
          : await client.readContract({
              address: report.contracts.OGDistributor.address,
              abi: abi.OGDistributor,
              functionName: "auction",
            });
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw Error(`${name}: no runtime`);
  const runtime = artifact.deployedBytecode;
  let compiled = runtime.object.replace(/^0x/, "");
  let actual = code.slice(2);
  for (const refs of Object.values(runtime.immutableReferences || {}))
    for (const { start, length } of refs) {
      compiled =
        compiled.slice(0, start * 2) +
        "0".repeat(length * 2) +
        compiled.slice((start + length) * 2);
      actual =
        actual.slice(0, start * 2) +
        "0".repeat(length * 2) +
        actual.slice((start + length) * 2);
    }
  if (compiled !== actual)
    throw Error(
      `${name}: deployed bytecode differs from accepted compilation outside immutable references`,
    );
  report.contracts[name] = {
    address,
    abiHash: hash,
    codeHash: keccak256(code),
    runtimeMatchesAccepted: true,
  };
}
const collection = await client.readContract({
  address: d.hook,
  abi: abi.OGHook,
  functionName: "COLLECTION",
});
const { parseAbi } = await import("viem");
const collectionAbi = parseAbi([
  "function tokenURI(uint256) view returns (string)",
]);
for (const [name, address] of Object.entries({ collection, ...d.v4 })) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw Error(`No code at ${name}`);
  report.contracts[name] = { address, codeHash: keccak256(code) };
}
for (let id = 1; id <= 3; id++) {
  const uri = await client.readContract({
    address: collection,
    abi: collectionAbi,
    functionName: "tokenURI",
    args: [BigInt(id)],
  });
  const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  fs.writeFileSync(
    new URL(`../public/pepe-${id}.svg`, import.meta.url),
    Buffer.from(meta.image.split(",")[1], "base64"),
  );
}
fs.writeFileSync(
  new URL("../src/abis.json", import.meta.url),
  JSON.stringify(abi),
);
fs.writeFileSync(
  new URL("../src/verified.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
fs.writeFileSync(
  new URL("../../artifacts/chain-verification.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
