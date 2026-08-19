"use client";

import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system" | "github-dark" | "dracula" | "rose-pine" | "tokyo-night";

const THEME_OPTIONS: { value: Theme; label: string; swatch?: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Default Dark" },
  { value: "github-dark", label: "GitHub Dark", swatch: "#0d1117" },
  { value: "dracula", label: "Dracula", swatch: "#282a36" },
  { value: "rose-pine", label: "Rosé Pine", swatch: "#191724" },
  { value: "tokyo-night", label: "Tokyo Night", swatch: "#1a1b26" },
  { value: "system", label: "System" },
];

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("theme") as Theme) || "system";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeTheme: string = theme === "system" ? (isSystemDark ? "dark" : "light") : theme;

  if (activeTheme === "light") {
    html.classList.remove("dark");
    html.removeAttribute("data-theme");
  } else {
    html.classList.add("dark");
    if (activeTheme !== "dark" && activeTheme !== "system") {
      html.setAttribute("data-theme", activeTheme);
    } else {
      html.removeAttribute("data-theme");
    }
  }
}

function resolveTheme(theme: Theme): "light" | "dark" | "custom" {
  if (typeof window === "undefined") {
    return theme === "light" ? "light" : theme === "dark" ? "dark" : "custom";
  }
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return "custom";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const changeTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  }, []);

  const resolved = useMemo(() => resolveTheme(theme), [theme]);

  const Icon = resolved === "light" ? Sun : resolved === "dark" ? Moon : Palette;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/50 bg-background transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Toggle theme"
        >
          <Icon className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-popover border-border/50 backdrop-blur-xl">
        {THEME_OPTIONS.map((option) => {
          const isActive = theme === option.value || (theme === "system" && option.value === "system");
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => changeTheme(option.value)}
              className={cn("cursor-pointer", isActive && "bg-accent/60")}
            >
              {option.swatch ? (
                <span
                  className="mr-2 h-4 w-4 rounded-full border border-border/80"
                  style={{ backgroundColor: option.swatch }}
                />
              ) : option.value === "light" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : option.value === "dark" ? (
                <Moon className="mr-2 h-4 w-4" />
              ) : option.value === "system" ? (
                <Monitor className="mr-2 h-4 w-4" />
              ) : null}
              <span className="flex-1">{option.label}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;