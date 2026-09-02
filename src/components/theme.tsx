"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Theme control.
 *
 * Three states, not two: `system` is the default and stamps nothing, so the
 * app follows the OS until someone actually chooses. Choosing writes
 * `data-theme` on `<html>`, which is what the explicit blocks in tokens.css
 * key off, and both directions win -- dark on a light machine and light on a
 * dark one.
 *
 * `<html data-theme>` is the single source of truth rather than React state.
 * The inline script below has already set it before React exists, so reading
 * the DOM through `useSyncExternalStore` means the control is correct on its
 * first client render, with no effect and no cascading re-render.
 */

export const THEME_STORAGE_KEY = "brandshift-theme";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * Runs before first paint, so a dark-theme user never sees a white flash.
 * It has to be inline and synchronous; anything deferred is already too late.
 */
export const themeScript = `
(function () {
  try {
    var choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
    }
  } catch (e) {
    /* Private mode, or site data blocked. System preference still applies. */
  }
})();
`;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): ThemeChoice {
  const attribute = document.documentElement.getAttribute("data-theme");
  return attribute === "light" || attribute === "dark" ? attribute : "system";
}

/** The server cannot know the choice, and `system` is the honest default. */
function getServerSnapshot(): ThemeChoice {
  return "system";
}

function setTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Private mode, or site data blocked. The choice still applies to this view.
  }

  for (const listener of listeners) listener();
}

const OPTIONS: Array<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="border-border bg-surface-raised inline-flex items-center gap-0.5 rounded-control border p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={label}
            onClick={() => setTheme(value)}
            className={[
              "ease-out inline-flex size-7 items-center justify-center rounded-[6px]",
              "transition-colors duration-[var(--duration-fast)]",
              "focus-visible:outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-1",
              selected
                ? "bg-accent-subtle text-accent-text"
                : "text-fg-muted hover:bg-surface-hover hover:text-fg-default",
            ].join(" ")}
          >
            <Icon aria-hidden className="size-4" />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
