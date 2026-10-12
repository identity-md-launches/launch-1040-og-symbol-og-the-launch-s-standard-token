import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
export async function withPreview(root, run) {
  root = resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ).replace(/^\/preview\/?/, "");
      const file = resolve(root, path || "index.html");
      if (!file.startsWith(root + "/") || !req.url.startsWith("/preview/")) {
        res.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      const type =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".woff2": "font/woff2",
          ".woff": "font/woff",
        }[extname(file)] || "application/octet-stream";
      res
        .writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.OG_CHROME ||
        "/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell",
      args: ["--no-sandbox"],
    });
    await run(browser, `http://127.0.0.1:${server.address().port}/preview/`);
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
}
