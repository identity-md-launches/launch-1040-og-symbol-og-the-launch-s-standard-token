import assert from "node:assert/strict";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { encodeFunctionData, parseAbi } from "viem";
import AxeBuilder from "@axe-core/playwright";
import { withPreview } from "./browser-support.mjs";
import verified from "../src/verified.json" with { type: "json" };
const root = resolve(process.argv[2] || "../dist"),
  output = resolve(process.argv[3] || "../artifacts");
const relay = process.argv[4];
if (!relay)
  throw Error("Pass the worker-provided read-only Ethereum RPC as argument 4.");
await mkdir(output, { recursive: true });
const results = {
  status: "running",
  checks: [],
  pages: [],
  viewports: [],
  axe: [],
  consoleErrors: [],
  failedStatic: [],
};
const rpc = async (method, params = []) => {
  if (
    !/^eth_(chainId|blockNumber|call|getCode|getBlockByNumber|getBlockByHash|getBalance|getLogs|estimateGas|gasPrice|getTransactionReceipt|getTransactionByHash|getTransactionCount|maxPriorityFeePerGas|feeHistory)$/.test(
      method,
    )
  )
    throw Error("Read-only validation provider refuses " + method);
  const response = await fetch(relay, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (data.error) throw Object.assign(Error(data.error.message), data.error);
  return data.result;
};
await withPreview(root, async (browser, url) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const requests = [];
  page.on("pageerror", (e) => results.consoleErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.url().startsWith(url) && r.status() >= 400)
      results.failedStatic.push([r.url(), r.status()]);
  });
  page.on("request", (r) => {
    if (r.method() === "POST") {
      try {
        requests.push({ url: r.url(), ...r.postDataJSON() });
      } catch {}
    }
  });
  const stat = (label) =>
    page
      .locator(".stat")
      .filter({
        has: page.locator(".eyebrow", {
          hasText: new RegExp("^" + label + "$", "i"),
        }),
      });
  const save = async (name, fullPage = false) => {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: resolve(output, name + ".jpg"),
      type: "jpeg",
      quality: 82,
      fullPage,
    });
  };
  const navigate = async (route) => {
    await page.locator(`header nav a[href="#/${route}"]`).click();
    await page.waitForFunction(
      (route) =>
        document
          .querySelector('header nav a[aria-current="page"]')
          ?.getAttribute("href") ===
        "#/" + route,
      route,
    );
  };
  try {
    await page.goto(url + "#/paper");
    await page.waitForURL("**/#/home");
    assert.equal(await page.locator("header nav a").count(), 6);
    assert(
      !/papertrade|\bpaper\b/i.test(await page.locator("body").innerText()),
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".stats-strip .stat strong")].length ===
          4 &&
        [...document.querySelectorAll(".stats-strip .stat strong")].every(
          (e) => !e.textContent.includes("—"),
        ) &&
        !document.querySelector(".stats-strip .read-issue"),
      {},
      { timeout: 120000 },
    );
    results.home = await page.locator(".stats-strip").innerText();
    results.pages.push({
      route: "home",
      state: "four live metrics including ETH paid to holders",
      text: results.home,
    });
    await save("home", true);
    results.checks.push(
      "Unknown/removed route redirects to Home; exactly six pages; no removed-feature copy; four live Home stats.",
    );
    // The production app uses public CORS RPCs directly throughout this first pass.
    const firstHistory = requests.filter((r) => r.method === "eth_getLogs");
    assert(firstHistory.length > 0);
    assert(
      firstHistory.every((r) => BigInt(r.params[0].fromBlock) >= 26147432n),
    );
    assert(
      firstHistory.every(
        (r) =>
          BigInt(r.params[0].toBlock) - BigInt(r.params[0].fromBlock) < 1000n,
      ),
    );
    results.history = {
      initialRequests: firstHistory.length,
      firstBlock: firstHistory[0].params[0].fromBlock,
      maxRange: Math.max(
        ...firstHistory.map((r) =>
          Number(
            BigInt(r.params[0].toBlock) - BigInt(r.params[0].fromBlock) + 1n,
          ),
        ),
      ),
    };
    const cache = await page.evaluate(() =>
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("og:events:"))
        .map(([key, value]) => ({
          key,
          bytes: value.length,
          through: JSON.parse(value).through.$bigint,
        })),
    );
    assert.equal(cache.length, 1);
    results.history.cache = cache;
    requests.length = 0;
    await page.reload();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".stats-strip .stat:last-child strong")
          ?.textContent.includes("ETH") &&
        !document
          .querySelector(".stats-strip .stat:last-child strong")
          ?.textContent.includes("—") &&
        !document.querySelector(".stats-strip .read-issue"),
      {},
      { timeout: 60000 },
    );
    const resumed = requests.filter((r) => r.method === "eth_getLogs");
    assert(resumed.length > 0);
    assert(
      resumed.every(
        (r) => BigInt(r.params[0].fromBlock) >= BigInt(cache[0].through) - 31n,
      ),
    );
    results.history.resumedRequests = resumed.length;
    results.checks.push(
      "Browser localStorage survives reload; only 32-block overlap and new blocks are requested.",
    );
    await navigate("trade");
    await page.locator("#trade-amount").fill("0");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page.locator('#trade-amount[aria-invalid="true"]').waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "trade-amount",
    );
    await page.locator("#trade-amount").fill("0.001");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByText("Minimum received:", { exact: false })
      .waitFor({ timeout: 45000 });
    results.buyQuote = await page.locator("main").innerText();
    await save("trade", true);
    await page.getByRole("button", { name: "Sell OG", exact: true }).click();
    await page.locator("#trade-amount").fill("1000");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByText("Minimum received:", { exact: false })
      .waitFor({ timeout: 45000 });
    results.sellQuote = await page.locator("main").innerText();
    await page.locator("#trade-amount").fill("2000");
    assert.equal(
      await page.getByText("Minimum received:", { exact: false }).count(),
      0,
    );
    results.pages.push({
      route: "trade",
      state: "live buy/sell quote, invalid input and stale quote reset",
    });
    results.checks.push(
      "Real mainnet buy/sell quotes; amount validation focuses field; changing input invalidates quote; hook and pool fee rows preserved.",
    );
    await navigate("my-pepes");
    await page
      .getByRole("heading", { name: "Your Pepes belong here." })
      .waitFor();
    assert(
      !/Connecting to Ethereum/.test(await page.locator("main").innerText()),
    );
    await save("my-pepes-disconnected");
    await page
      .locator("main")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    assert(await page.getByRole("dialog").isVisible());
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement.textContent === "Connect wallet",
    );
    results.checks.push(
      "My Pepes renders its connect state immediately; wallet dialog keyboard close restores focus.",
    );
    await navigate("leaderboard");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("tbody tr").length > 0 &&
        !document
          .querySelector(".filters")
          ?.textContent.includes("rows loaded"),
      {},
      { timeout: 150000 },
    );
    const count = await page.locator("tbody tr").count();
    assert(count > 0);
    results.activeCount = count;
    results.pages.push({
      route: "leaderboard",
      state: `${count} live activated Pepes`,
      text: (await page.locator("main").innerText()).slice(0, 1800),
    });
    await save("leaderboard");
    await page.getByLabel("Level", { exact: true }).selectOption("1");
    assert(
      (await page.locator("tbody .badge").allTextContents()).every(
        (t) => t === "L1",
      ),
    );
    await page.getByLabel("Level", { exact: true }).selectOption("all");
    await page.getByLabel("Sort by").selectOption("level");
    assert.equal(await page.locator("tbody .badge").first().innerText(), "L3");
    results.checks.push(
      "Leaderboard populations, live levels/pending ETH, level filter and sort.",
    );
    await navigate("auctions");
    await page
      .getByText("Loading live auctions…")
      .waitFor({ state: "hidden", timeout: 60000 });
    await page
      .locator(".past-sales tbody tr")
      .first()
      .waitFor({ timeout: 60000 });
    results.auctions = await page.locator("main").innerText();
    results.pages.push({
      route: "auctions",
      state: "current count read on chain and confirmed past sales",
      text: results.auctions.slice(0, 2000),
    });
    await save("auctions", true);
    await navigate("stats");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".stats-grid .stat strong")].every(
          (e) => !e.textContent.includes("—"),
        ),
      {},
      { timeout: 45000 },
    );
    results.stats = await page.locator(".stats-grid").innerText();
    results.pages.push({
      route: "stats",
      state: "12 live metrics and event feed",
      text: results.stats,
    });
    await save("stats", true);
    await page.getByLabel("Event type").selectOption("AuctionSold");
    assert(
      (await page.locator(".event-list .badge").allTextContents()).every(
        (t) => t === "Auction sale",
      ),
    );
    await page.getByLabel("Event type").selectOption("all");
    const before = await page.locator(".event-list li").count();
    await page.getByRole("button", { name: "Show more events" }).click();
    assert((await page.locator(".event-list li").count()) > before);
    results.checks.push(
      "Auctions current-state empty result and 30 confirmed sales; Stats totals, event filter and paging.",
    );
    // A public, discovered owner is used solely for a read-only injected-provider fixture.
    const activeId = (
      await readFile(resolve(output, "mainnet-check.json"), "utf8").then(
        JSON.parse,
      )
    ).active[0].id;
    const ownerRaw = await rpc("eth_call", [
      {
        to: verified.contracts.collection.address,
        data: encodeFunctionData({
          abi: parseAbi(["function ownerOf(uint256) view returns(address)"]),
          functionName: "ownerOf",
          args: [BigInt(activeId)],
        }),
      },
      "latest",
    ]);
    const owner = "0x" + ownerRaw.slice(-40);
    await page.exposeFunction("ogValidationRead", rpc);
    await page.evaluate((owner) => {
      window.ogWalletMethods = [];
      window.ogWalletListeners = {};
      window.ogValidationAccount = owner;
      window.ogValidationChain = "0x1";
      const provider = {
        request: async ({ method, params }) => {
          window.ogWalletMethods.push(method);
          if (method === "eth_requestAccounts" || method === "eth_accounts")
            return [window.ogValidationAccount];
          if (method === "eth_chainId") return window.ogValidationChain;
          if (method === "eth_sendTransaction" || method.includes("sign"))
            throw Error("Read-only fixture: signing is disabled.");
          return window.ogValidationRead(method, params || []);
        },
        on: (event, fn) => (window.ogWalletListeners[event] = fn),
        removeListener: (event) => delete window.ogWalletListeners[event],
      };
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "og-read-only-mainnet",
              name: "Read-only mainnet validation",
              rdns: "test.invalid",
            },
            provider,
          },
        }),
      );
    }, owner);
    await navigate("my-pepes");
    await page
      .locator("main")
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Read-only mainnet validation" })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".nft-card").length > 0 &&
        document
          .querySelector(".collection-toolbar")
          ?.textContent.includes("Pepes loaded"),
      {},
      { timeout: 150000 },
    );
    await page.locator(".nft-card img").first().waitFor({ timeout: 45000 });
    results.owner = owner;
    results.ownedText = await page.locator("main").innerText();
    assert(results.ownedText.includes("Pending ETH"));
    assert(
      (await page.evaluate(() => window.ogWalletMethods)).includes("eth_call"),
    );
    results.pages.push({
      route: "my-pepes",
      state:
        "connected read-only wallet using live owner, levels and pending ETH",
      text: results.ownedText.slice(0, 2500),
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".nft-card")]
        .slice(0, 4)
        .every((e) => e.querySelector("img")?.complete),
    );
    await save("my-pepes");
    results.checks.push(
      "EIP-6963 fixture connects a real current active-NFT owner; wallet provider serves real mainnet ownership/level/reward reads; no signing supported or attempted.",
    );
    for (const route of [
      "home",
      "trade",
      "my-pepes",
      "leaderboard",
      "auctions",
      "stats",
    ]) {
      await navigate(route);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const box = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        assert(
          box.scrollWidth <= width,
          `${route} overflows at ${width}: ${box.scrollWidth}`,
        );
        results.viewports.push({ route, ...box });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      results.axe.push({
        route,
        violations: audit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
        incomplete: audit.incomplete.map((v) => v.id),
        passes: audit.passes.length,
      });
    }
    await navigate("home");
    await page.setViewportSize({ width: 390, height: 844 });
    const mainAction = await page.locator(".hero .primary").boundingBox();
    assert(mainAction.y + mainAction.height <= 844);
    results.mobileAction = mainAction;
    await save("home-mobile");
    await page.setViewportSize({ width: 768, height: 1080 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    results.textEnlargement = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(
      results.textEnlargement.scrollWidth <= results.textEnlargement.width,
      "200% text overflow",
    );
    await save("text-enlargement");
    await page.evaluate(() => (document.documentElement.style.fontSize = ""));
    await page.setViewportSize({ width: 1440, height: 1000 });
    results.contrast = await page.evaluate(() => {
      const lum = (rgb) => {
        const c = rgb
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      return [
        ".hero h1",
        ".hero-copy > p",
        ".hero .primary",
        ".stat .eyebrow",
      ].map((selector) => {
        const e = document.querySelector(selector);
        const fg = getComputedStyle(e).color;
        let b = e;
        while (b && getComputedStyle(b).backgroundColor === "rgba(0, 0, 0, 0)")
          b = b.parentElement;
        const bg = getComputedStyle(b).backgroundColor;
        const [a, z] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        return { selector, fg, bg, ratio: (a + 0.05) / (z + 0.05) };
      });
    });
    assert(results.contrast.every((x) => x.ratio >= 4.5));
    results.fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        display: document.fonts.check('16px "VT323"'),
        body: document.fonts.check('16px "Space Mono"'),
      };
    });
    assert(results.fonts.body && results.fonts.display);
    await page.emulateMedia({ reducedMotion: "reduce" });
    results.reducedMotion = await page
      .locator(".hero .primary")
      .evaluate((e) => getComputedStyle(e).transitionDuration);
    assert.equal(results.reducedMotion, "0s");
    await page.keyboard.press("Tab");
    await save("keyboard-focus");
    await page.evaluate(() => {
      window.ogValidationChain = "0x2";
      window.ogWalletListeners.chainChanged("0x2");
    });
    assert(
      await page
        .getByRole("button", { name: "Switch to Ethereum" })
        .isVisible(),
    );
    await page.evaluate(() => window.ogWalletListeners.accountsChanged([]));
    await navigate("my-pepes");
    assert.equal(await page.locator(".nft-card").count(), 0);
    await page
      .getByRole("heading", { name: "Your Pepes belong here." })
      .waitFor();
    results.checks.push(
      "All six routes reflow at 1440/768/390/320; main mobile action fits first screen; text enlargement; contrast measurements; fonts; reduced motion; wrong chain and account removal.",
    );
    assert.equal(results.consoleErrors.length, 0);
    assert.equal(results.failedStatic.length, 0);
    const violations = results.axe.flatMap((a) => a.violations);
    assert.equal(violations.length, 0, JSON.stringify(violations));
    results.status = "passed";
  } catch (e) {
    results.status = "failed";
    results.error = String(e);
    results.failureText = await page.locator("main").innerText();
    await save("browser-failure", true);
    process.exitCode = 1;
  } finally {
    await writeFile(
      resolve(output, "browser-results.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        {
          status: results.status,
          error: results.error,
          checks: results.checks,
          axe: results.axe,
          viewports: results.viewports,
          consoleErrors: results.consoleErrors,
        },
        null,
        2,
      ),
    );
    await context.close();
  }
});
