// QA screenshot runner. Captures full-page shots at desktop (1440) and mobile
// (375, emulated) for each route, checks for console errors and horizontal
// overflow at 375, and writes PNGs to qa/<outdir>/.
//
// Usage:
//   node qa/shoot.mjs <outdir> <route> [route...]
//   BASE=http://localhost:3000 node qa/shoot.mjs dashboard /dashboard /dashboard/bookings
//
// Names files after the route's last non-empty segment (or "index").
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const [, , outdir, ...routes] = process.argv;
if (!outdir || routes.length === 0) {
  console.error("usage: node qa/shoot.mjs <outdir> <route> [route...]");
  process.exit(1);
}

const nameFor = (route) => {
  const seg = route.split("?")[0].split("/").filter(Boolean);
  return seg.length ? seg[seg.length - 1] : "index";
};

const dir = path.join("qa", outdir);
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();
let hadError = false;

for (const route of routes) {
  const name = nameFor(route);
  for (const view of [
    { key: "1440", width: 1440, height: 900, mobile: false },
    { key: "375", width: 375, height: 812, mobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: view.mobile ? 2 : 1,
      isMobile: view.mobile,
      hasTouch: view.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    const url = BASE + route;
    await page.goto(url, { waitUntil: "networkidle" });
    // Hide the Next.js dev-tools badge (dev-only; never in production).
    await page.addStyleTag({ content: "nextjs-portal{display:none !important}" });
    await page.waitForTimeout(400); // let fonts/animations settle

    // horizontal overflow check at mobile
    let overflow = 0;
    if (view.mobile) {
      overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    }

    const file = path.join(dir, `${name}-${view.key}.png`);
    await page.screenshot({ path: file, fullPage: true });

    const flags = [];
    if (errors.length) flags.push(`${errors.length} console error(s)`);
    if (overflow > 0) flags.push(`H-OVERFLOW ${overflow}px`);
    if (flags.length) hadError = true;
    console.log(
      `${flags.length ? "✗" : "✓"} ${file}${flags.length ? "  — " + flags.join(", ") : ""}`,
    );
    if (errors.length) errors.slice(0, 3).forEach((e) => console.log("    ! " + e.slice(0, 140)));
    await ctx.close();
  }
}

await browser.close();
process.exit(hadError ? 2 : 0);
