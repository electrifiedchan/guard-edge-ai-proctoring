import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // A stray pnpm-lock.yaml sits at the repo root alongside the real one in
  // frontend/, so Turbopack cannot tell which directory is the project root and
  // warns on every boot. Pin it to this folder explicitly.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
