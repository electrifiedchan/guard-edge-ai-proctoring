const { chromium } = require("playwright");

/** Both setup modals must be able to commit the switch themselves:
 *  1. red modal (local), Ollama answering  -> "Take the red pill"          -> /upload
 *  2. blue modal (cloud), key installed    -> "Take the blue pill with …"  -> /upload
 *  3. the backend actually flipped each time, not just the UI
 *
 *  Red is LOCAL and blue is CLOUD; `.pill-online` is the red hotspot painted
 *  into the image, which is why the class name and the mode read crosswise.
 */
const PORT = process.env.PORT || "3000";
const url = (p) => `http://localhost:${PORT}${p}`;
const API = "http://localhost:8080/api/v1/llm/mode";

const effective = async () => (await (await fetch(API)).json()).effective;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Park the backend on the opposite mode first, so a passing step proves the
  // button moved it rather than that it was already there.
  await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "cloud", provider: "nvidia" }),
  });
  console.log("start mode:", await effective());

  // --- 1. red (local): open setup from the card, commit from inside it ---
  await page.goto(url("/choose-model"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // The card is only rendered on .pill-slot:hover (globals.css:658), so the
  // gear inside it is unreachable without hovering the hotspot first. :last-child
  // is the gear — the card's first button now commits, which is what this test
  // is deliberately routing around: it exercises the modal's own commit.
  await page.hover(".pill-online .pill-zone");
  await page.waitForTimeout(500);
  await page.click(".pill-online .pill-card button:last-child");
  await page.waitForTimeout(600);

  // Scoped to the dialog: the hover card behind it now has its own "Take the
  // red pill", and an unscoped match would resolve to both.
  const dialog = page.locator('[role="dialog"]');
  const red = dialog.getByRole("button", { name: /take the red pill/i });
  console.log("1. red commit button:", JSON.stringify((await red.textContent()).trim()));
  await page.screenshot({ path: "shot-red-modal.png" });
  await red.click();
  await page.waitForTimeout(2000);
  console.log("   lands on:", new URL(page.url()).pathname);
  console.log("   backend now:", await effective(), "(want ollama)");

  // --- 2. blue (cloud): same, from the dashboard entry so ?next= is exercised ---
  await page.goto(url("/choose-model?next=/dashboard"), { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.hover(".pill-offline .pill-zone");
  await page.waitForTimeout(500);
  await page.click(".pill-offline .pill-card button:last-child");
  await page.waitForTimeout(600);

  // Same scoping as red. The modal's label carries the provider ("…with NVIDIA")
  // while the card behind it says just "Take the blue pill", so the regex is
  // deliberately a prefix match rather than an exact one.
  const blue = page
    .locator('[role="dialog"]')
    .getByRole("button", { name: /take the blue pill/i });
  console.log("2. blue commit button:", JSON.stringify((await blue.textContent()).trim()));
  await page.screenshot({ path: "shot-blue-modal.png" });
  await blue.click();
  await page.waitForTimeout(2000);
  console.log("   lands on:", new URL(page.url()).pathname);
  console.log("   backend now:", await effective(), "(want cloud)");

  await browser.close();
})();
