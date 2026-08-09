const { chromium } = require("playwright");

/** End-to-end check of the /choose-model wiring:
 *  1. a first-timer hitting /upload is bounced to the chooser
 *  2. committing a pill returns them to /upload, which now renders
 *  3. the dashboard badge reports the live mode and links back
 *  4. switching from the dashboard returns to the dashboard, not /upload
 */
const PORT = process.env.PORT || "3000";
const url = (p) => `http://localhost:${PORT}${p}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // --- 1. first-timer gate (storage is empty in a fresh context) ---
  await page.goto(url("/upload"), { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  console.log("1. new user /upload lands on:", new URL(page.url()).pathname + new URL(page.url()).search);

  // --- 2. commit the blue pill, expect to arrive at /upload ---
  await page.click(".pill-offline .pill-zone");
  await page.waitForTimeout(1800);
  console.log("2. after blue pill:", new URL(page.url()).pathname);
  console.log("   upload UI rendered:", await page.locator("text=/drag|drop|resume/i").first().isVisible().catch(() => false));

  // --- 3. returning user is NOT bounced ---
  await page.goto(url("/upload"), { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  console.log("3. returning user /upload stays:", new URL(page.url()).pathname);

  // --- 4. dashboard badge ---
  await page.goto(url("/dashboard"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // The guided tour auto-opens for a first-time visitor and covers the header.
  // Its close target is the full-screen backdrop, which the panel sits on top
  // of, so Escape is the reliable dismissal.
  if (await page.locator('[aria-label="Dashboard tour"]').count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
  }

  const badge = page.locator('a[href="/choose-model?next=/dashboard"]');
  console.log("4. dashboard badge visible:", await badge.isVisible());
  console.log("   badge says:", JSON.stringify((await badge.textContent()).trim()));
  await page.screenshot({ path: "shot-dashboard-badge.png" });

  // --- 5. switch from dashboard, expect to come back to dashboard ---
  await badge.click();
  await page.waitForTimeout(1200);
  console.log("5. badge opens:", new URL(page.url()).pathname);
  // Wait for the status fetch to land before clicking. The gate needs it to tell
  // "no key installed" from "not asked yet"; a human hovering to read the card
  // takes far longer than this anyway.
  await page.waitForTimeout(1200);
  await page.click(".pill-online .pill-zone");
  await page.waitForTimeout(1800);
  console.log("   after red pill from dashboard:", new URL(page.url()).pathname);

  // --- 6. badge now reflects the switch ---
  // goto, not reload: RefreshGuard bounces a hard refresh back to "/" on
  // purpose, so reload() would measure that instead of the badge.
  await page.goto(url("/dashboard"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  console.log("6. badge after switch:", JSON.stringify((await badge.textContent()).trim()));
  await page.screenshot({ path: "shot-dashboard-badge.png" });

  await browser.close();
})();
