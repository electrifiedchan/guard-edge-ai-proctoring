// Copies MediaPipe Face Mesh assets from node_modules into public/mediapipe/
// so the browser loads them from the same origin (no CDN dependency).
import { mkdirSync, copyFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "node_modules", "@mediapipe", "face_mesh");
const dest = join(root, "public", "mediapipe");

if (!existsSync(src)) {
  console.warn("⚠️  @mediapipe/face_mesh not found in node_modules — skipping asset copy.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });

const ASSET_EXTS = [".js", ".wasm", ".data", ".binarypb", ".tflite"];
let copied = 0;
for (const file of readdirSync(src)) {
  const lower = file.toLowerCase();
  if (ASSET_EXTS.some((ext) => lower.endsWith(ext))) {
    copyFileSync(join(src, file), join(dest, file));
    copied += 1;
  }
}
console.log(`✓ Copied ${copied} MediaPipe asset(s) → public/mediapipe/`);
