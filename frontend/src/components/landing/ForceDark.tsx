"use client";

import { useForceDark } from "@/lib/theme";

/**
 * Pins the landing page to dark mode. Renders nothing.
 *
 * Exists because app/page.tsx is a server component and cannot call hooks.
 *
 * Why the landing page opts out of theming: the hero cube is `/cube.mp4`, an
 * opaque video with black baked into it, composited by a radial mask against
 * a matching black page (see Hero.tsx). On a light background that becomes a
 * grey blob with a visible halo. MP4 cannot carry an alpha channel, and no
 * blend mode fixes it — `screen` needs a dark backdrop and `multiply` kills
 * the cube's glow. Re-exporting as VP9/WebM with alpha would work but Safari
 * won't play it.
 */
export default function ForceDark() {
  useForceDark();
  return null;
}
