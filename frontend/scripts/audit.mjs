/**
 * Full-site audit — drives Chromium with Playwright, then collects a measured,
 * structured "Google web dev" report over every route.
 *
 * Run after `pnpm dev` is serving on port 3000:
 *   node scripts/audit.mjs
 *
 * Output:
 *   instructions/audit/  → screenshots, HAR snapshot, findings.json, report.md
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__DIR, "../../instructions/audit");
const BASE = "http://localhost:3000";

const ROUTES = [
  { path: "/", label: "landing", nav: "Landing page (root)" },
  { path: "/upload", label: "upload", nav: "Upload resume" },
  { path: "/dashboard", label: "dashboard", nav: "Dashboard (empty)" },
  { path: "/sentry", label: "sentry", nav: "Sentry / interview" },
  { path: "/report", label: "report", nav: "Report (no session)" },
  { path: "/verdict", label: "verdict", nav: "Verdict" },
  { path: "/practice", label: "practice", nav: "Practice" },
];

// CSS colour tokens the app *should* be using (top 8). Missing means a
// branding gap.
const EXPECTED_VARS = [
  "--color-canvas",
  "--color-surface",
  "--color-signal",
  "--color-snow",
  "--color-slate",
  "--color-fog",
  "--color-hairline",
];

const FINDINGS = [];
const screenshots = [];

// ─── helpers ──────────────────────────────────────────────────────────

function push(route, severity, area, detail) {
  const d = fromRoute(route);
  FINDINGS.push({ ...d, severity, area, detail });
}

function fromRoute(route) {
  return { path: route.path, label: route.label, nav: route.nav };
}

/**
 * Run axe-core in the page. axe is used for contrast rather than hand-rolled
 * maths because it resolves oklch()/oklab() and composites alpha over ancestor
 * backgrounds — both of which a naive rgb() parser gets badly wrong.
 */
async function axe(page) {
  try {
    await page.addScriptTag({ url: "https://cdn.jsdelivr.net/npm/axe-core@4.10.0/axe.min.js" });
    await page.waitForFunction(() => typeof window.axe !== "undefined", null, { timeout: 10_000 });
    const result = await page.evaluate(async () =>
      await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      }),
    );
    return { violations: result.violations, ok: true };
  } catch (e) {
    return { violations: [], ok: false, error: e.message };
  }
}

// ─── per-route audit ──────────────────────────────────────────────────

async function auditRoute(browser, route, widths) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const tag = route.label;

  const errors = [];
  const failedReqs = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("requestfailed", (req) => {
    failedReqs.push({ url: req.url(), status: req.failure()?.errorText ?? "unknown" });
  });

  // Navigate
  const fullUrl = `${BASE}${route.path}`;
  let navOk = false;
  try {
    const resp = await page.goto(fullUrl, { timeout: 15_000, waitUntil: "domcontentloaded" });
    const status = resp?.status() ?? 0;
    if (!resp || status >= 400) {
      push(route, "CRITICAL", "navigation", `Route ${fullUrl} returned HTTP ${status}. Page may be a 404 or require prior state.`);
    } else {
      navOk = true;
    }
    // Let CSS frameworks settle
    await page.waitForTimeout(2_000);
  } catch (e) {
    push(route, "CRITICAL", "navigation", `Route ${fullUrl} crashed or timed out: ${e.message}`);
    await page.close();
    await context.close();
    return;
  }

  // 0) Console errors
  if (errors.length) push(route, "error", "console", `Console errors (${errors.length}):\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n…+${errors.length - 5} more` : ""}`);

  // 1) Failed network requests
  if (failedReqs.length) push(route, "error", "network", `Failed requests (${failedReqs.length}):\n${failedReqs.slice(0, 5).map(r => `${r.url} → ${r.status}`).join("\n")}${failedReqs.length > 5 ? `\n…+${failedReqs.length - 5} more` : ""}`);

  // 2) No visible heading (blank page check)
  const h1Count = await page.locator("h1").count();
  const anyText = (await page.locator("body").innerText()).trim();
  if (h1Count === 0 && anyText.length < 20) {
    push(route, "CRITICAL", "content", "No <h1> and negligible body text — page likely blank or all server-rendered placeholder.");
  } else if (h1Count === 0) {
    push(route, "warning", "semantics", "No <h1> found. A page-level heading is needed for screen-readers and SEO.");
  }

  // 3) Overflow — every element wider than its parent
  const overflow = await page.evaluate(() => {
    const out = [];
    const docW = document.documentElement.scrollWidth;
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const pw = el.parentElement?.getBoundingClientRect().width ?? docW;
      // only flag when child is measurably wider than parent
      if (pw > 0 && r.width - pw > 4) {
        out.push({
          tag: el.tagName,
          classes: el.className?.toString?.()?.slice(0, 80) ?? "",
          childW: Math.round(r.width),
          parentW: Math.round(pw),
          x: Math.round(r.x),
        });
      }
    }
    return out;
  });
  if (overflow.length > 5) push(route, "error", "layout", `Overflow: ${overflow.length} elements wider than parent. Horizontal scroll likely.\nFirst 8: ${overflow.slice(0, 8).map(o => `<${o.tag.toLowerCase()} class="${o.classes}"> child=${o.childW}px parent=${o.parentW}px x=${o.x}`).join(" | ")}`);

  // 4) Design tokens — resolve each expected var by its real name, on the
  // element that actually declares them (:root), not document.body.
  const missingVars = await page.evaluate((names) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    return names.filter((n) => {
      const v = rootStyle.getPropertyValue(n).trim() || bodyStyle.getPropertyValue(n).trim();
      return v === "";
    });
  }, EXPECTED_VARS);
  if (missingVars.length) push(route, "warning", "design-tokens", `CSS custom properties not resolvable at :root: ${missingVars.join(", ")}. If the palette is expressed as Tailwind utilities rather than CSS vars, this is expected — not a defect.`);

  // 5) Tiny text (< 10px)
  const tiny = await page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const sz = parseFloat(getComputedStyle(el).fontSize);
      if (sz > 0 && sz < 10 && el.textContent?.trim()) {
        out.push({ tag: el.tagName, size: sz, text: el.textContent.trim().slice(0, 40) });
      }
    }
    return out;
  });
  if (tiny.length) push(route, "warning", "typography", `Text < 10px found (${tiny.length} instances):\n${tiny.map(t => `<${t.tag.toLowerCase()}> ${t.size}px "${t.text}"`).join(" | ")}`);

  // 6) Contrast is delegated to axe (step 9). A hand-rolled check here produced
  // false failures: it read the numbers out of oklch()/oklab() as if they were
  // sRGB channels, and ignored alpha compositing over ancestor backgrounds.

  // 7) Unlabeled interactive elements
  const unlabeled = await page.evaluate(() => {
    const out = [];
    const interactive = ["button", "a", "input", "select", "textarea"];
    const all = document.querySelectorAll(interactive.join(","));
    for (const el of all) {
      if (el.type === "hidden") continue;
      const ariaLabel = el.getAttribute("aria-label");
      const ariaLabelled = el.getAttribute("aria-labelledby");
      const title = el.getAttribute("title");
      const text = el.textContent?.trim() ?? "";
      // skip SVG-only buttons if they have an accessible desc
      const hasSVG = el.querySelector("svg");
      if (!ariaLabel && !ariaLabelled && !title && !text && (hasSVG || el.tagName === "A" || el.tagName === "BUTTON")) {
        out.push({ tag: el.tagName, class: el.className?.toString?.()?.slice(0, 60) ?? "", outer: el.outerHTML?.slice(0, 100) });
      }
    }
    return out.slice(0, 6);
  });
  if (unlabeled.length) push(route, "warning", "a11y", `Unlabeled interactive elements (${unlabeled.length}):\n${unlabeled.map(u => `<${u.tag.toLowerCase()}> outer: ${u.outer}`).join(" | ")}`);

  // 8) Broken internal links
  const brokenLinks = [];
  const linkEls = await page.locator("a[href^='/'], a[href^='http://localhost'], a[href^='#']").all();
  for (const el of linkEls) {
    const href = await el.getAttribute("href");
    if (!href || href === "#") continue;
    const text = (await el.textContent())?.trim() ?? "no text";
    if (href.startsWith("#")) {
      const id = href.slice(1);
      // CSS.escape is a browser global, so the escaping has to happen in-page.
      const exists = await page.evaluate(
        (rawId) => !!document.getElementById(rawId),
        id,
      );
      if (!exists) brokenLinks.push({ href, text, reason: `anchor #${id} not on page` });
    } else if (href.startsWith("/")) {
      try {
        const check = await page.context().newPage();
        const r = await check.goto(`${BASE}${href}`, { timeout: 8_000, waitUntil: "domcontentloaded" });
        const s = r?.status() ?? 0;
        if (s >= 400) brokenLinks.push({ href, text, reason: `HTTP ${s}` });
        await check.close();
      } catch {
        brokenLinks.push({ href, text, reason: "timeout or unreachable" });
      }
    }
  }
  if (brokenLinks.length) push(route, "error", "navigation", `Broken internal links (${brokenLinks.length}):\n${brokenLinks.map(l => `"${l.text}" → ${l.href} (${l.reason})`).join(" | ")}`);

  // 9) Axe a11y violations (includes colour-contrast, done properly)
  const axeResult = await axe(page);
  if (!axeResult.ok) {
    push(route, "warning", "audit-coverage", `axe-core did not run (${axeResult.error}). Accessibility and contrast are UNVERIFIED on this route.`);
  }
  for (const v of axeResult.violations) {
    if (v.nodes.length === 0) continue;
    const sev = v.impact === "critical" || v.impact === "serious" ? "error" : "warning";
    const sample = v.nodes.slice(0, 3).map((n) => n.target?.join(" ")).join(" | ");
    push(route, sev, `a11y:${v.id}`, `${v.help} — ${v.nodes.length} instance(s), impact=${v.impact ?? "n/a"}.\nSelectors: ${sample}`);
  }

  // 10) Mobile viewport check (375×812 iPhone)
  {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(800);
    const mobileOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    if (mobileOverflow) {
      push(route, "error", "responsive", "Horizontal overflow at 375px viewport — mobile layout broken.");
    }
    const metaViewport = await page.locator("meta[name='viewport']").count();
    if (metaViewport === 0) {
      push(route, "error", "responsive", "No <meta name='viewport'> — mobile will render at desktop scale.");
    }
  }

  // Screenshot
  const ssPath = path.join(OUT, `shot-${tag}-desktop.png`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: ssPath, fullPage: false });
  screenshots.push(ssPath);

  // Deliberately no HTML snapshot. Dumping page.content() produced multi-
  // hundred-KB files that are unreadable and drown the actual findings; the
  // screenshot plus the measured checks above cover everything we use.
  const bodyLen = (await page.locator("body").innerText()).length;
  push(route, "info", "metric", `Body text: ${bodyLen} chars. H1: ${h1Count}. Console errors: ${errors.length}. Failed reqs: ${failedReqs.length}. navOK: ${navOk}`);

  await page.close();
  await context.close();
}

// ─── main ─────────────────────────────────────────────────────────────

/**
 * Is something already serving on BASE? Reused rather than restarted so a dev
 * server the user already has running is left alone.
 */
async function serverUp() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** Boot `next dev` ourselves and wait for it to answer. Returns the child, or
 *  null when we reused an already-running server. */
async function ensureServer() {
  if (await serverUp()) {
    console.log("✓ Dev server already up on 3000 — reusing it.");
    return null;
  }

  console.log("⏳ Starting dev server on 3000…");
  const FE = path.resolve(__DIR, "..");
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["dev", "--webpack", "--port", "3000"],
    { cwd: FE, stdio: "ignore", detached: false, shell: false },
  );
  child.on("error", (e) => console.error("dev server spawn failed:", e.message));

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await serverUp()) {
      console.log(`✓ Dev server ready after ${i + 1}s.`);
      // Next compiles routes lazily; give the first paint room to settle.
      await new Promise((r) => setTimeout(r, 2000));
      return child;
    }
  }
  throw new Error("Dev server never became ready on http://localhost:3000");
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const child = await ensureServer();

  console.log("🚀 Launching Chromium…");
  const browser = await chromium.launch({ headless: true });

  for (const route of ROUTES) {
    console.log(`  ↳ ${route.path} (${route.label})`);
    // One bad route shouldn't cost us the other six.
    try {
      await auditRoute(browser, route, [1440, 375]);
    } catch (e) {
      push(route, "CRITICAL", "audit-harness", `Audit of this route threw: ${e.message}`);
      console.error(`     ✗ ${route.path}: ${e.message}`);
    }
  }

  await browser.close();
  if (child) child.kill();

  // ─── report ──────────────────────────────────────────────────
  const severities = { CRITICAL: 0, error: 1, warning: 2, info: 3 };
  FINDINGS.sort((a, b) => (severities[a.severity] ?? 9) - (severities[b.severity] ?? 9));

  writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(FINDINGS, null, 2));

  let md = "# GUARD Site Audit Report\n\n";
  md += `**Date:** ${new Date().toISOString().split("T")[0]}\n`;
  md += `**Routes audited:** ${ROUTES.length}\n`;
  md += `**Findings:** ${FINDINGS.length}\n\n`;
  md += `---\n\n`;

  const critCount = FINDINGS.filter((f) => f.severity === "CRITICAL" || f.severity === "error").length;
  md += `## Critical + Error: ${critCount}\n\n`;

  for (const f of FINDINGS) {
    const emoji = { CRITICAL: "🔴", error: "🟠", warning: "🟡", info: "⚪" }[f.severity] ?? "⚪";
    md += `### ${emoji} [${f.label}](${BASE}${f.path}) — ${f.area}\n`;
    md += `**${f.severity}** · ${f.nav}\n\n${f.detail}\n\n---\n\n`;
  }

  md += `\n## Screenshots\n\n`;
  for (const s of screenshots) {
    md += `- \`${s}\`\n`;
  }

  const reportPath = path.join(OUT, "report.md");
  writeFileSync(reportPath, md);

  console.log(`\n✅ Audit complete.`);
  console.log(`   Report: ${reportPath}`);
  console.log(`   JSON:   ${path.join(OUT, "findings.json")}`);
  console.log(`   Shots:  ${screenshots.length} images`);
  console.log(`\n   Critical: ${FINDINGS.filter(f => f.severity === "CRITICAL").length}`);
  console.log(`   Error:    ${FINDINGS.filter(f => f.severity === "error").length}`);
  console.log(`   Warning:  ${FINDINGS.filter(f => f.severity === "warning").length}`);
  console.log(`   Info:     ${FINDINGS.filter(f => f.severity === "info").length}`);
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(1);
});
