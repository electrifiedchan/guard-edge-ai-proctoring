const { chromium } = require("playwright");

/** Card + modal shape for both pills.
 *
 *  Red is LOCAL and blue is CLOUD (MODES in lib/llmMode.ts). The CSS classes
 *  name the hotspot painted into morpheus.png, not the connectivity, so
 *  `.pill-online` is the red pill in his left hand and now opens the Ollama
 *  card — the API-key modal moved to `.pill-offline` when the mapping swapped.
 */
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
  // Next takes the next free port when 3000 is busy, so allow an override
  // rather than editing this file every time another project claims 3000.
  const port = process.env.PORT || "3000";
  await page.goto(`http://localhost:${port}/choose-model`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const scrolls = await page.evaluate(() => ({
    scrollable: document.documentElement.scrollHeight > window.innerHeight,
    h: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }));
  console.log("scrollable:", JSON.stringify(scrolls));

  // Red pill card (local): commit button + the gear that opens setup
  await page.hover(".pill-online .pill-zone");
  await page.waitForTimeout(700);
  const redBtn = await page.textContent(".pill-online .pill-card button");
  console.log("red commit button:", JSON.stringify(redBtn.trim()));
  const gearLabel = await page.getAttribute(
    ".pill-online .pill-card button:last-child",
    "aria-label",
  );
  console.log("red gear:", JSON.stringify(gearLabel));
  await page.screenshot({ path: "shot-red-card.png" });

  // Can we actually reach the gear through the gap? (the bridge test)
  await page.click(".pill-online .pill-card button:last-child");
  await page.waitForTimeout(600);
  const dialog = await page.locator('[role="dialog"]').isVisible();
  console.log("modal opened via card gear:", dialog);
  const red = await page.locator('[role="dialog"]').textContent();
  console.log("red modal is the local one:", /Ollama/.test(red));
  console.log("red says running:", /Ollama is running/.test(red));
  await page.screenshot({ path: "shot-red-modal.png" });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Blue pill card (cloud): the API-key modal lives here now
  await page.hover(".pill-offline .pill-zone");
  await page.waitForTimeout(700);
  const blueBtn = await page.textContent(".pill-offline .pill-card button");
  console.log("blue commit button:", JSON.stringify(blueBtn.trim()));
  await page.click(".pill-offline .pill-card button:last-child");
  await page.waitForTimeout(700);
  const blue = await page.locator('[role="dialog"]').textContent();
  console.log("blue mentions masked key:", /nvapi-/.test(blue));
  console.log("blue has paste field:", await page.locator("#api-key").count());
  await page.screenshot({ path: "shot-blue-modal.png" });

  // Groq tab -> should offer the paste field
  await page.click('[role="tab"]:has-text("Groq")');
  await page.waitForTimeout(400);
  console.log("groq tab paste field:", await page.locator("#api-key").count());
  await page.screenshot({ path: "shot-groq-tab.png" });

  await browser.close();
})();
