import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encodeFunctionData } from "viem";
import { withPreview } from "./browser-support.mjs";
import abis from "../src/abis.json" with { type: "json" };
const output = resolve(process.argv[3] || "../artifacts");
await mkdir(output, { recursive: true });
const results = { status: "running", checks: [], requests: [], errors: [] };
await withPreview(process.argv[2] || "../dist", async (browser, url) => {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => results.errors.push(String(e)));
  let failBurn = true,
    failPrimary = false,
    failSecondary = false;
  const burnCall = encodeFunctionData({
    abi: abis.OG,
    functionName: "totalBurned",
  });
  await page.route("https://**", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const body = req.postDataJSON();
    const url = req.url();
    results.requests.push({
      url,
      method: body.method,
      from: body.params?.[0]?.fromBlock,
    });
    const reject = (status, error) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ jsonrpc: "2.0", id: body.id, error }),
      });
    if (
      failBurn &&
      body.method === "eth_call" &&
      body.params[0].data === burnCall
    )
      return reject(200, {
        code: 3,
        message: "execution reverted: forced single-card test",
      });
    if (failPrimary && url.includes("mevblocker"))
      return reject(403, { code: -32000, message: "forced 403 test" });
    if (failSecondary && url.includes("drpc"))
      return reject(429, { code: -32005, message: "forced 429 test" });
    return route.continue();
  });
  const metric = (label) =>
    page
      .locator(".stat")
      .filter({
        has: page.locator(".eyebrow", {
          hasText: new RegExp("^" + label + "$", "i"),
        }),
      });
  try {
    await page.goto(url + "#/home");
    await metric("OG burned")
      .getByRole("button", { name: "Retry this data" })
      .waitFor({ timeout: 45000 });
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".stats-strip .stat:first-child strong")
          ?.textContent.includes("—"),
      {},
      { timeout: 45000 },
    );
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".stats-strip .stat:last-child strong")
          ?.textContent.includes("—") &&
        !document.querySelector(".stats-strip .stat:last-child .read-issue"),
      {},
      { timeout: 120000 },
    );
    assert(
      (await metric("OG burned").locator("strong").innerText()).includes("—"),
    );
    results.isolatedText = await page.locator(".stats-strip").innerText();
    await page.screenshot({
      path: resolve(output, "isolated-read-failure.jpg"),
      type: "jpeg",
      quality: 82,
    });
    // An unrelated missing burn total must not disable the pool's quote.
    await page.locator('header nav a[href="#/trade"]').click();
    await page.locator("#trade-amount").fill("0.001");
    await page.getByRole("button", { name: "Get quote", exact: true }).click();
    await page
      .getByText("Minimum received:", { exact: false })
      .waitFor({ timeout: 45000 });
    results.checks.push(
      "Failed burn read affects burned/market-cap cards; price, holder payouts and Trade quote keep working.",
    );
    await page.locator('header nav a[href="#/home"]').click();
    await metric("OG burned")
      .getByRole("button", { name: "Retry this data" })
      .waitFor();
    failBurn = false;
    await metric("OG burned")
      .getByRole("button", { name: "Retry this data" })
      .click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".stats-strip .stat:nth-child(3) strong")
          ?.textContent.includes("—") &&
        !document.querySelector(".stats-strip .stat:nth-child(3) .read-issue"),
      {},
      { timeout: 45000 },
    );
    results.checks.push(
      "Small card Retry repairs the failed field and dependent market cap.",
    );
    failPrimary = true;
    failSecondary = true;
    results.requests = [];
    await page.reload();
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
    assert(
      results.requests.some(
        (r) => r.url.includes("blastapi") && r.method === "eth_call",
      ),
    );
    assert(
      results.requests.some(
        (r) => r.url.includes("blastapi") && r.method === "eth_getLogs",
      ),
    );
    results.checks.push(
      "Browser 403 on primary plus 429 on secondary rotates to real Blast; state and persisted history resume with adaptive log ranges.",
    );
    await page.screenshot({
      path: resolve(output, "rpc-fallback.jpg"),
      type: "jpeg",
      quality: 82,
    });
    // Restore providers but fail a card again; background refresh must clear it without clicking.
    failPrimary = false;
    failSecondary = false;
    failBurn = true;
    await page.reload();
    await metric("OG burned")
      .getByRole("button", { name: "Retry this data" })
      .waitFor({ timeout: 45000 });
    failBurn = false;
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".stats-strip .stat:nth-child(3) strong")
          ?.textContent.includes("—") &&
        !document.querySelector(".stats-strip .stat:nth-child(3) .read-issue"),
      {},
      { timeout: 45000 },
    );
    results.checks.push(
      "Background 15-second refresh automatically recovers a failed card.",
    );
    assert.equal(results.errors.length, 0);
    results.status = "passed";
  } catch (e) {
    results.status = "failed";
    results.error = String(e);
    results.text = await page.locator("main").innerText();
    await page.screenshot({
      path: resolve(output, "recovery-failure.jpg"),
      type: "jpeg",
      quality: 82,
      fullPage: true,
    });
    process.exitCode = 1;
  } finally {
    await writeFile(
      resolve(output, "recovery-results.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
    console.log(
      JSON.stringify(
        { ...results, requests: results.requests.length },
        null,
        2,
      ),
    );
  }
});
