const { chromium } = require("playwright");

/** The hover card commits on its own now, with the gear beside it:
 *  1. ready state shows the receipt line + "Take the ___ pill" + a gear
 *  2. that button flips the backend and navigates
 *  3. the gear still opens the setup modal instead of committing
 *  4. the not-ready state keeps its single full-width setup button
 *
 *  Red is LOCAL, blue is CLOUD. `.pill-online` is the red hotspot in Morpheus's
 *  left hand — the class names the pixel, not the connectivity — so the red
 *  card commits `ollama` and the blue one commits `cloud`.
 */
const PORT = process.env.PORT || "3000";
const url = (p) => `http://localhost:${PORT}${p}`;
const API = "http://localhost:8080/api/v1/llm/mode";

const effective = async () => (await (await fetch(API)).json()).effective;

const open = async (page, which) => {
  // .pill-card only exists under .pill-slot:hover (globals.css:658).
  await page.hover(`.pill-${which} .pill-zone`);
  await page.waitForTimeout(500);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Park on cloud so a pass on the red card proves the button moved it to local.
  await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "cloud", provider: "nvidia" }),
  });
  console.log("start mode:", await effective());

  await page.goto(url("/choose-model"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // --- 1. the ready red card (local) ---
  await open(page, "online");
  const card = page.locator(".pill-online .pill-card");
  console.log("1. red receipt:", JSON.stringify((await card.locator("p").last().textContent()).trim()));
  const redBtns = card.locator("button");
  console.log("   controls:", await redBtns.count());
  console.log("   commit:", JSON.stringify((await redBtns.first().textContent()).trim()));
  console.log("   gear:", JSON.stringify(await redBtns.last().getAttribute("aria-label")));
  await page.screenshot({ path: "shot-card-red.png" });

  // --- 2. the gear opens setup, does not commit ---
  await redBtns.last().click();
  await page.waitForTimeout(800);
  console.log("2. gear opened modal:", await page.locator('[role="dialog"]').count() > 0);
  console.log("   still on chooser:", new URL(page.url()).pathname);
  console.log("   backend untouched:", await effective());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // --- 3. the commit button flips it and leaves ---
  await open(page, "online");
  await page.locator(".pill-online .pill-card button").first().click();
  await page.waitForTimeout(2000);
  console.log("3. lands on:", new URL(page.url()).pathname);
  console.log("   backend now:", await effective(), "(want ollama)");

  // --- 4. blue card (cloud), same shape ---
  await page.goto(url("/choose-model?next=/dashboard"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await open(page, "offline");
  const blue = page.locator(".pill-offline .pill-card");
  console.log("4. blue receipt:", JSON.stringify((await blue.locator("p").last().textContent()).trim()));
  console.log("   commit:", JSON.stringify((await blue.locator("button").first().textContent()).trim()));
  console.log("   gear:", JSON.stringify(await blue.locator("button").last().getAttribute("aria-label")));
  await page.screenshot({ path: "shot-card-blue.png" });

  await blue.locator("button").first().click();
  await page.waitForTimeout(2000);
  console.log("   lands on:", new URL(page.url()).pathname);
  console.log("   backend now:", await effective(), "(want cloud)");

  await browser.close();
})();
