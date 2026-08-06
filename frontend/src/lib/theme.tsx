"use client";

/**
 * Theme system — dark (default) / light, persisted to localStorage.
 *
 * Design notes for whoever touches this next:
 *
 * 1. The theme is applied as a `.light` class on <html>, NOT `.dark`. Dark is
 *    the base defined in `@theme`, and `.light` overrides those same CSS
 *    variables in globals.css. That means every component using semantic
 *    utilities (bg-canvas, text-snow, border-hairline) flips for free, and
 *    the dark path costs zero extra CSS.
 *
 * 2. The landing page is permanently dark. `/cube.mp4` is an opaque video
 *    with black baked in, masked against a matching black page — on white it
 *    reads as a grey blob. `useForceDark()` below pins it, and the toggle is
 *    simply not rendered there.
 *
 * 3. Theme must be applied BEFORE first paint or the page flashes dark→light
 *    on every load for light-mode users. That is what `THEME_SCRIPT` does,
 *    injected synchronously in <head>. Do not move it into a useEffect.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "guard.theme";

/**
 * Runs synchronously in <head> before paint, so the correct theme is on
 * <html> before the browser draws anything (prevents the flash of wrong
 * theme). Kept as a string because it must be a blocking inline script.
 *
 * Mirrors the resolution order in `resolveInitialTheme()` — if you change
 * one, change both.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});
var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
if(t==="light")document.documentElement.classList.add("light");
}catch(e){}})();`;

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* private mode / storage disabled — fall through to system preference */
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always "dark" on the server so SSR markup is deterministic; the inline
  // script has already fixed the real DOM by the time this hydrates.
  const [theme, setThemeState] = useState<Theme>("dark");

  useLayoutEffect(() => {
    setThemeState(resolveInitialTheme());
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* non-fatal: theme just won't persist across reloads */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* non-fatal */
      }
      return next;
    });
  }, []);

  // Reflect state onto <html>. Skipped while a route has pinned dark mode
  // (see useForceDark) so the class isn't fought over on the landing page.
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.forceDark === "true") return;
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  // Follow the OS only while the user has made no explicit choice.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_KEY)) return;
      } catch {
        /* storage unreadable — treat as no explicit choice */
      }
      setThemeState(e.matches ? "light" : "dark");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/**
 * Pins the current route to dark regardless of user preference, and restores
 * the preference on unmount. Used by the landing page — see the note at the
 * top of this file for why the cube cannot survive a light background.
 */
export function useForceDark() {
  const { theme } = useTheme();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.forceDark = "true";
    root.classList.remove("light");

    return () => {
      delete root.dataset.forceDark;
      // Re-apply whatever the user actually had, now that we're leaving.
      try {
        const stored = localStorage.getItem(THEME_KEY);
        const restore =
          stored === "light" || stored === "dark" ? stored : theme;
        root.classList.toggle("light", restore === "light");
      } catch {
        root.classList.toggle("light", theme === "light");
      }
    };
  }, [theme]);
}
