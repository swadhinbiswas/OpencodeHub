import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Compass, Plus, LogIn, LogOut, Menu, X, Server } from "lucide-react";

export function Header({ user }: { user?: any }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentPath(window.location.pathname);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const navLinks = [
    { href: "/explore", label: "Explore", icon: Compass },
    { href: "/instances", label: "Instances", icon: Server },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2.5 group">
            <img src="/logo.svg" alt="OpenCodeHub" className="h-9 w-9" />
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight leading-none text-foreground flex items-center gap-1.5">
                OpenCodeHub
                <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Community</span>
              </span>
              <span className="text-[11px] text-muted-foreground leading-tight">Federated Hub</span>
            </div>
          </a>
          <nav className="hidden md:flex items-center gap-1.5">
            {navLinks.map(({ href, label, icon: Icon }) => {
              const isActive = currentPath === href || (href !== "/" && currentPath.startsWith(href));
              return (
                <a key={href} href={href} className={`px-3.5 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-all ${isActive ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"}`}>
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {label}
                </a>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a href="/instances/submit"><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Submit URL</Button></a>
          {user ? (
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm font-medium hidden sm:inline-block">@{user.username}</span>
              <Button size="icon" variant="ghost" onClick={handleLogout} title="Sign out"><LogOut className="h-4 w-4 text-muted-foreground" /></Button>
            </div>
          ) : (
            <a href="/auth/login"><Button size="sm"><LogIn className="h-4 w-4 mr-1" />Sign in</Button></a>
          )}
          <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <a key={href} href={href} className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent">{label}</a>
          ))}
          <a href="/instances/submit" className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent">Submit URL</a>
        </div>
      )}
    </header>
  );
}
