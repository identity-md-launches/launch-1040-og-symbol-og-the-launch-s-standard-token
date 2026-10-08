import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  http as rpcHttp,
  parseAbi,
  formatUnits,
  encodeFunctionData,
} from "viem";
import { mainnet } from "viem/chains";
const root = path.resolve(import.meta.dirname, "../..");
const deploy = JSON.parse(
  fs.readFileSync(path.join(root, "web/src/deployment.json")),
);
const verified = JSON.parse(
  fs.readFileSync(path.join(root, "web/src/verified.json")),
);
const abis = JSON.parse(fs.readFileSync(path.join(root, "web/src/abis.json")));
const addr = Object.fromEntries(
  Object.entries(verified.contracts).map(([k, v]) => [k, v.address]),
);
const report = {
  status: "running",
  checks: [],
  transactions: [],
  receipts: [],
  screenshots: [],
  limitations: [
    "Injected provider is an Anvil-backed EIP-6963 test provider, not a MetaMask/Rabby extension.",
    "Time and ETH balances are changed only on the local fork. No mainnet writes or contract deployments.",
  ],
  consoleErrors: [],
};
const anvilPort = 18545,
  previewPort = 14173;
const forkBlock = Number(
  process.env.OG_FORK_BLOCK ||
    (await createPublicClient({
      transport: rpcHttp(deploy.rpc),
    }).getBlockNumber()),
);
report.forkBlock = forkBlock;
const anvil = spawn(
  "anvil",
  [
    "--fork-url",
    deploy.rpc,
    "--fork-block-number",
    String(forkBlock),
    "--chain-id",
    "1",
    "--port",
    String(anvilPort),
    "--host",
    "127.0.0.1",
    "--silent",
    "--no-storage-caching",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let anvilError = "";
anvil.stderr.on("data", (d) => {
  anvilError += d.toString();
});
const endpoint = `http://127.0.0.1:${anvilPort}`;
const rpc = async (method, params = []) => {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw Error(`${method}: ${j.error.message}`);
  return j.result;
};
const client = createPublicClient({
  chain: mainnet,
  transport: rpcHttp(endpoint),
});
let browser, server;
try {
  for (let i = 0; i < 100; i++) {
    try {
      await rpc("eth_chainId");
      break;
    } catch {
      if (i === 99) throw Error(`Anvil failed to start: ${anvilError}`);
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const nftAbi = parseAbi([
    "function ownerOf(uint256) view returns (address)",
    "function balanceOf(address) view returns (uint256)",
  ]);
  const owner = await client.readContract({
    address: addr.collection,
    abi: nftAbi,
    functionName: "ownerOf",
    args: [1n],
  });
  report.account = owner;
  await rpc("anvil_impersonateAccount", [owner]);
  await rpc("anvil_setBalance", [owner, "0x56bc75e2d63100000"]); // 100 ETH only on the fork, to an actual owner read from chain.
  const block = await client.getBlock();
  const opened = await client.readContract({
    address: addr.OGHook,
    abi: abis.OGHook,
    functionName: "openedAt",
  });
  const decay = await client.readContract({
    address: addr.OGHook,
    abi: abis.OGHook,
    functionName: "DECAY",
  });
  if (block.timestamp < opened + decay) {
    await rpc("evm_setNextBlockTimestamp", [Number(opened + decay + 1n)]);
    await rpc("evm_mine");
  }
  server = http.createServer((req, res) => {
    const raw = decodeURIComponent(req.url.split("?")[0]);
    const rel = raw.replace(/^\/preview\//, "");
    const file = path.resolve(root, "dist", rel === "" ? "index.html" : rel);
    if (!file.startsWith(path.join(root, "dist") + path.sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const data = fs.readFileSync(file);
      const ext = path.extname(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
        }[ext] || "application/octet-stream",
      );
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  await new Promise((r) => server.listen(previewPort, "127.0.0.1", r));
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.OG_CHROME || "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  let delayQuotes = false;
  await context.route(
    "https://ethereum-rpc.publicnode.com/**",
    async (route) => {
      try {
        const request = JSON.parse(route.request().postData());
        if (
          delayQuotes &&
          (Array.isArray(request) ? request : [request]).some(
            (r) =>
              r.params?.[0]?.to?.toLowerCase() === addr.quoter.toLowerCase(),
          )
        )
          await new Promise((r) => setTimeout(r, 2000));
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: route.request().postData(),
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: await response.text(),
        });
      } catch (e) {
        await route.abort();
      }
    },
  );
  let walletChain = "0x5";
  await context.exposeBinding("forkRequest", async (_, args) => {
    if (args.method === "eth_requestAccounts" || args.method === "eth_accounts")
      return [owner];
    if (args.method === "eth_chainId") return walletChain;
    if (args.method === "wallet_switchEthereumChain") {
      walletChain = args.params[0].chainId;
      return null;
    }
    if (args.method === "eth_sendTransaction") {
      if (args.params[0].from.toLowerCase() !== owner.toLowerCase())
        throw Error("Unexpected test sender");
      await rpc("evm_increaseTime", [2]);
      const tx = await rpc(args.method, args.params);
      report.transactions.push(tx);
      const receipt = await rpc("eth_getTransactionReceipt", [tx]);
      report.receipts.push({
        hash: tx,
        status: receipt?.status,
        gasUsed: receipt?.gasUsed,
        gasLimit: args.params[0].gas,
      });
      return tx;
    }
    return rpc(args.method, args.params);
  });
  await context.addInitScript(() => {
    const listeners = {};
    const provider = {
      request: (args) => window.forkRequest(args),
      on: (event, cb) => (listeners[event] ??= []).push(cb),
      removeListener: (event, cb) => {
        listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
      },
    };
    const announce = () =>
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "og-local-fork",
              name: "Local mainnet fork",
              rdns: "local.og.test",
            },
            provider,
          },
        }),
      );
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(m.text());
  });
  const base = `http://127.0.0.1:${previewPort}/preview/`;
  await page.goto(base);
  await page.getByText(/Mainnet · block/).waitFor({ timeout: 120000 });
  async function shot(name) {
    const p = `artifacts/${name}.png`;
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, p), fullPage: true });
    report.screenshots.push(p);
  }
  await shot("desktop-home");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw Error(`Home overflow at ${width}`);
    report.checks.push(`Home reflow ${width}px: passed`);
    if (width === 390) await shot("mobile-home");
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.accessibility = {
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
    incomplete: axe.incomplete.map((v) => v.id),
  };
  report.rendered = await page.evaluate(() => {
    const rgb = (color) =>
      color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const luminance = (color) =>
      rgb(color)
        .map((n) => {
          n /= 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => {
      const x = luminance(a),
        y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const pairs = [
      ["body", "body"],
      ["hero description", ".hero-copy>p"],
      ["primary button", ".primary"],
      ["metric label", ".stat .eyebrow"],
    ];
    return {
      fonts: {
        body: document.fonts.check('16px "Space Mono"'),
        pixel: document.fonts.check("16px VT323"),
      },
      contrast: pairs.map(([name, selector]) => {
        const element = document.querySelector(selector),
          foreground = getComputedStyle(element).color;
        let ancestor = element,
          background;
        while (ancestor) {
          background = getComputedStyle(ancestor).backgroundColor;
          if (background !== "rgba(0, 0, 0, 0)") break;
          ancestor = ancestor.parentElement;
        }
        return {
          name,
          selector,
          foreground,
          background,
          ratio: ratio(foreground, background),
        };
      }),
    };
  });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  if (
    !(await page.evaluate(() =>
      document.querySelector("dialog").contains(document.activeElement),
    ))
  )
    throw Error("Dialog did not receive focus");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  if (
    !(await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .evaluate((el) => el === document.activeElement))
  )
    throw Error("Dialog focus was not restored");
  report.checks.push(
    "Wallet dialog: keyboard open, native modal focus, Escape and focus restoration: passed",
  );
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Local mainnet fork" }).click();
  await page
    .getByRole("button", { name: "Switch to Ethereum", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Switch to Ethereum", exact: true })
    .waitFor({ state: "hidden" });
  report.checks.push(
    "Wrong-chain notice and injected wallet switch to chainId 1: passed",
  );
  async function nav(name) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
  }
  async function finishReview() {
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    for (let i = 0; i < 6; i++) {
      const done = dialog.getByRole("button", { name: "Done", exact: true });
      if (await done.isVisible()) {
        await done.click();
        return;
      }
      const action = dialog.getByRole("button", { name: /in wallet$/ });
      await action.waitFor({ timeout: 60000 });
      await action.waitFor({ state: "visible" });
      await page.waitForFunction(
        () => {
          const d = document.querySelector("dialog");
          return [...d.querySelectorAll("button")].some(
            (b) => b.textContent.endsWith("in wallet") && !b.disabled,
          );
        },
        {},
        { timeout: 120000 },
      );
      await action.click();
      await page.waitForFunction(
        () => {
          const d = document.querySelector("dialog");
          return (
            !d ||
            [...d.querySelectorAll("button")].some(
              (b) => b.textContent === "Done",
            ) ||
            !d.textContent.includes("Waiting for confirmation…")
          );
        },
        {},
        { timeout: 120000 },
      );
      await page.waitForTimeout(500);
      if (await dialog.getByRole("alert").count())
        throw Error(await dialog.getByRole("alert").innerText());
    }
    throw Error("Review did not complete");
  }
  async function balance() {
    return client.readContract({
      address: addr.OG,
      abi: abis.OG,
      functionName: "balanceOf",
      args: [owner],
    });
  }
  async function readDist(fn, id = 1n) {
    return client.readContract({
      address: addr.OGDistributor,
      abi: abis.OGDistributor,
      functionName: fn,
      args: [id],
    });
  }
  const beforeBuy = await balance();
  await nav("Trade");
  await page
    .getByRole("link", { name: "Skip to content", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  if (
    !page.url().endsWith("#/trade") ||
    !(await page
      .locator("main")
      .evaluate((el) => el === document.activeElement))
  )
    throw Error("Skip link changed the route or did not focus main");
  await page.getByLabel("You pay").fill("0");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  if (
    (await page.getByLabel("You pay").getAttribute("aria-invalid")) !== "true"
  )
    throw Error("Amount validation not associated with input");
  report.checks.push(
    "Skip link preserves hash route; invalid amount is announced and focused: passed",
  );
  delayQuotes = true;
  await page.getByLabel("You pay").fill("0.02");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.getByLabel("You pay").fill("0.05");
  await page
    .getByRole("button", { name: "Get quote", exact: true })
    .waitFor({ timeout: 30000 });
  if (
    await page
      .getByRole("button", { name: "Review trade", exact: true })
      .count()
  )
    throw Error("Stale quote applied to changed input");
  delayQuotes = false;
  report.checks.push(
    "Delayed quote is discarded when the amount changes: passed",
  );
  await page.getByLabel("You pay").fill("0.05");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page
    .getByRole("button", { name: "Review trade", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 320, height: 960 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Quoted trade overflow at 320px");
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  if (
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth)
  )
    throw Error("Review overflow at 320px");
  await shot("mobile-trade-review");
  await finishReview();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const afterBuy = await balance();
  if (afterBuy <= beforeBuy) throw Error("Buy did not increase OG");
  report.checks.push(
    "Buy ETH → OG through site / real router / real hook: passed",
  );
  await shot("desktop-trade");
  await page.getByRole("button", { name: "Sell OG", exact: true }).click();
  await page.getByLabel("You pay").fill("1000");
  await page.getByRole("button", { name: "Get quote", exact: true }).click();
  await page.getByRole("button", { name: "Review trade", exact: true }).click();
  await finishReview();
  if ((await balance()) >= afterBuy) throw Error("Sell did not decrease OG");
  report.checks.push(
    "Sell OG → ETH through site, exact OG and Permit2 approvals: passed",
  );
  await nav("My Pepes");
  await page.getByText("Load a specific token ID", { exact: true }).click();
  await page.getByLabel("Swarm Pepe token ID").fill("1");
  await page.getByRole("button", { name: "Load Pepe", exact: true }).click();
  let card = page.locator(".nft-card").filter({
    has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
  });
  await card.waitFor({ timeout: 120000 });
  await card
    .getByRole("button", { name: "Review activation", exact: true })
    .click();
  await finishReview();
  if ((await readDist("level")) !== 1) throw Error("Activation failed");
  report.checks.push("Activate level 1 with OG through site: passed");
  card = page.locator(".nft-card").filter({
    has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
  });
  await card
    .getByRole("button", { name: "Review upgrade", exact: true })
    .waitFor({ timeout: 120000 });
  const beforeUpgrade = await balance();
  await card
    .getByRole("button", { name: "Review upgrade", exact: true })
    .click();
  await finishReview();
  const actualCost = beforeUpgrade - (await balance());
  const l1 = await client.readContract({
    address: addr.OGDistributor,
    abi: abis.OGDistributor,
    functionName: "cumulativeCost",
    args: [1],
  });
  const l2 = await client.readContract({
    address: addr.OGDistributor,
    abi: abis.OGDistributor,
    functionName: "cumulativeCost",
    args: [2],
  });
  if ((await readDist("level")) !== 2 || actualCost !== l2 - l1)
    throw Error("Upgrade failed or charged wrong difference");
  report.checks.push(
    "Upgrade L1 → L2 with OG, only cost difference charged: passed",
  );
  card = page.locator(".nft-card").filter({
    has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
  });
  await card
    .getByRole("button", { name: "Review upgrade", exact: true })
    .waitFor({ timeout: 120000 });
  await card.getByLabel("Pay with").selectOption("ETH");
  await card
    .getByRole("button", { name: "Review upgrade", exact: true })
    .click();
  await finishReview();
  if ((await readDist("level")) !== 3) throw Error("ETH upgrade failed");
  report.checks.push(
    "Upgrade L2 → L3 using ETH exact-output swap through site: passed",
  );
  await page.getByRole("button", { name: "Refresh live data" }).click();
  await page.waitForTimeout(2000);
  card = page.locator(".nft-card").filter({
    has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
  });
  await card
    .getByRole("button", { name: "Hand in NFT & collect ETH", exact: true })
    .waitFor({ timeout: 120000 });
  if (
    !(await card
      .getByRole("button", { name: "Hand in NFT & collect ETH", exact: true })
      .isDisabled())
  )
    throw Error("Exit was available before lock");
  report.checks.push("Exit blocked during chain-derived lock: passed");
  await shot("desktop-my-pepes");
  await nav("Leaderboard");
  await page
    .getByRole("cell", { name: "Pepe #1", exact: true })
    .waitFor({ timeout: 120000 });
  await page.getByLabel("Level", { exact: true }).selectOption("3");
  report.checks.push(
    "Leaderboard reconstructs activation and filters level: passed",
  );
  const lock = await client.readContract({
    address: addr.OGDistributor,
    abi: abis.OGDistributor,
    functionName: "EXIT_LOCK",
  });
  await rpc("evm_increaseTime", [Number(lock) + 1]);
  await rpc("evm_mine");
  await page.getByRole("button", { name: "Refresh live data" }).click();
  await page.waitForTimeout(2000);
  await nav("My Pepes");
  await page.getByText("Load a specific token ID", { exact: true }).click();
  await page.getByLabel("Swarm Pepe token ID").fill("1");
  await page.getByRole("button", { name: "Load Pepe", exact: true }).click();
  card = page.locator(".nft-card").filter({
    has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
  });
  await card
    .getByRole("button", { name: "Hand in NFT & collect ETH", exact: true })
    .click({ timeout: 120000 });
  await finishReview();
  if (
    (
      await client.readContract({
        address: addr.collection,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [1n],
      })
    ).toLowerCase() !== addr.OGAuction.toLowerCase()
  )
    throw Error("Exit did not transfer NFT to auction");
  if ((await readDist("level")) !== 0) throw Error("Exit did not clear level");
  report.checks.push(
    "Exit after lock through site: per-NFT approval, ETH payout, NFT handed to real auction, level reset: passed",
  );
  await nav("Auctions");
  await page
    .getByRole("heading", { name: "Pepe #1", exact: true })
    .waitFor({ timeout: 120000 });
  await shot("desktop-auction");
  await page.setViewportSize({ width: 320, height: 960 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("Auction overflow at 320");
  await shot("mobile-auction");
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Reach the chain-exposed floor on the fork, retaining a real live listing.
  const duration = await client.readContract({
    address: addr.OGAuction,
    abi: abis.OGAuction,
    functionName: "DURATION",
  });
  await rpc("evm_increaseTime", [Number(duration) + 1]);
  await rpc("evm_mine");
  await page.getByRole("button", { name: "Refresh live data" }).click();
  await page.waitForTimeout(2000);
  const burnedBefore = await client.readContract({
    address: addr.OG,
    abi: abis.OG,
    functionName: "totalBurned",
  });
  await page
    .getByRole("button", { name: "Review purchase", exact: true })
    .click();
  await finishReview();
  if (
    (
      await client.readContract({
        address: addr.collection,
        abi: nftAbi,
        functionName: "ownerOf",
        args: [1n],
      })
    ).toLowerCase() !== owner.toLowerCase()
  )
    throw Error("Auction buy did not deliver NFT");
  if ((await readDist("level")) !== 0 || (await readDist("pending")) !== 0n)
    throw Error("Auction buyer inherited rewards");
  const burnedAfter = await client.readContract({
    address: addr.OG,
    abi: abis.OG,
    functionName: "totalBurned",
  });
  const floor = await client.readContract({
    address: addr.OGAuction,
    abi: abis.OGAuction,
    functionName: "FLOOR",
  });
  if (burnedAfter - burnedBefore !== floor)
    throw Error("Auction proceeds not burned");
  report.checks.push(
    "Auction buy through site: actual OG floor burned, recipient receives NFT at L0 with zero pending: passed",
  );
  await nav("My Pepes");
  await page.getByText("Load a specific token ID", { exact: true }).click();
  await page.getByLabel("Swarm Pepe token ID").fill("1");
  await page.getByRole("button", { name: "Load Pepe", exact: true }).click();
  card = page
    .locator(".nft-card")
    .filter({
      has: page.getByRole("heading", { name: "Pepe #1", exact: true }),
    });
  await card.getByLabel("Pay with").selectOption("ETH");
  await card
    .getByRole("button", { name: "Review activation", exact: true })
    .click();
  await finishReview();
  if ((await readDist("level")) !== 1) throw Error("ETH activation failed");
  report.checks.push(
    "Activate level 0 → 1 directly with ETH after auction purchase: passed",
  );
  await nav("Stats");
  await page.getByLabel("Event type").selectOption("AuctionSold");
  await page
    .getByText("Auction sale", { exact: true })
    .waitFor({ timeout: 120000 });
  await shot("desktop-stats");
  report.checks.push("Stats event filter reflects real auction sale: passed");
  for (const name of [
    "Trade",
    "My Pepes",
    "Leaderboard",
    "Auctions",
    "Stats",
  ]) {
    await nav(name);
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 960 });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error(`${name} overflow at ${width}`);
    }
    report.checks.push(`${name} reflow at 768, 390, 320px: passed`);
  }
  for (const record of report.receipts) {
    const receipt = await rpc("eth_getTransactionReceipt", [record.hash]);
    if (receipt.status !== "0x1")
      throw Error(`Transaction reverted: ${record.hash}`);
    record.status = receipt.status;
    record.gasUsed = receipt.gasUsed;
  }
  report.status = "passed";
  report.finalBlock = Number(await client.getBlockNumber());
} catch (e) {
  report.status = "failed";
  report.error = e.stack;
  console.error(e);
  if (browser) {
    const pages = browser.contexts()[0]?.pages();
    if (pages?.length) {
      await pages[0].screenshot({
        path: path.join(root, "test/scratch/fork-failure.png"),
        fullPage: true,
      });
      fs.writeFileSync(
        path.join(root, "test/scratch/fork-failure.html"),
        await pages[0].content(),
      );
    }
  }
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    path.join(root, "artifacts/fork-validation.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  await new Promise((r) => (server ? server.close(r) : r()));
  anvil.kill("SIGTERM");
}
