"use client";

import { Monitor, Moon, Sun, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark" | "system" | "github-dark" | "dracula" | "rose-pine" | "tokyo-night";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("theme") as Theme) || "system";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const activeTheme = theme === "system" ? (isSystemDark ? "dark" : "light") : theme;

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

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

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border/50 bg-background transition-all hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          aria-label="Toggle theme"
        >
          <Palette className="h-4 w-4" />
          <span className="sr-only">Toggle theme</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-popover border-border/50 backdrop-blur-xl">
        <DropdownMenuItem onClick={() => changeTheme("light")} className="cursor-pointer">
          <Sun className="mr-2 h-4 w-4" />
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("dark")} className="cursor-pointer">
          <Moon className="mr-2 h-4 w-4" />
          <span>Default Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("github-dark")} className="cursor-pointer">
          <span className="mr-2 h-4 w-4 rounded-full bg-card border border-border/80"></span>
          <span>GitHub Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("dracula")} className="cursor-pointer">
          <span className="mr-2 h-4 w-4 rounded-full bg-[#282a36] border border-border/80"></span>
          <span>Dracula</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("rose-pine")} className="cursor-pointer">
          <span className="mr-2 h-4 w-4 rounded-full bg-[#191724] border border-border/80"></span>
          <span>Rosé Pine</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("tokyo-night")} className="cursor-pointer">
          <span className="mr-2 h-4 w-4 rounded-full bg-[#1a1b26] border border-border/80"></span>
          <span>Tokyo Night</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeTheme("system")} className="cursor-pointer border-t mt-1 pt-1">
          <Monitor className="mr-2 h-4 w-4" />
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ThemeToggle;
