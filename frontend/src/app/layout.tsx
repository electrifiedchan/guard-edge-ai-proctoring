import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, THEME_SCRIPT } from "@/lib/theme";
import { REFRESH_TO_LANDING_SCRIPT } from "@/lib/refreshPolicy";
import RefreshGuard from "@/components/RefreshGuard";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ── Landing page type stack ──────────────────────────────────────────────
// Declared here (fonts must be module-scope for next/font) but only *applied*
// inside .landing-root, so product pages keep Geist. See globals.css.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "GUARD · Edge AI Proctoring",
  description:
    "Sovereign edge-AI proctoring with on-device vision and voice integrity signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // THEME_SCRIPT below adds/removes `light` on this element before React
      // hydrates, so the client className intentionally differs from the SSR
      // one and React logs a mismatch. The divergence is the whole point of
      // the no-flash script, and it only ever affects this one attribute —
      // so we silence it here rather than give up pre-paint theming.
      // Note: this is shallow, it does not suppress warnings for children.
      suppressHydrationWarning
    >

      <head>
        {/* Must run before first paint, or light-mode users see a dark flash
            on every navigation. Intentionally a blocking inline script —
            do not convert this to a useEffect. See lib/theme.tsx. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* A refresh sends you back to the landing page. Also blocking, and
            for a stronger reason than the theme script: the routes it applies
            to run their own redirect guards on mount, so deciding this in an
            effect would just add another racing router call. Here the reloaded
            route never mounts. See lib/refreshPolicy.ts. */}
        <script dangerouslySetInnerHTML={{ __html: REFRESH_TO_LANDING_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Asks for confirmation before that redirect happens. Paired with the
            script above: this is the "are you sure", that is the "then what". */}
        <RefreshGuard />
        <ThemeProvider>{children}</ThemeProvider>
      </body>

    </html>
  );
}
