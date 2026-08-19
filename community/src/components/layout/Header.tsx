import { Button } from "@/components/ui/button";
import { Github, Compass, Globe, Plus, User, LogIn } from "lucide-react";
export function Header({ user }: { user?: any }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2 font-bold text-lg"><Github className="h-6 w-6" />OpenCodeHub Community</a>
          <nav className="hidden md:flex items-center gap-1">
            <a href="/explore" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md flex items-center gap-1"><Compass className="h-4 w-4" />Explore</a>
            <a href="/instances" className="px-3 py-2 text-sm font-medium hover:bg-accent rounded-md flex items-center gap-1"><Globe className="h-4 w-4" />Instances</a>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <a href="/instances/submit"><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Submit URL</Button></a>
          {user ? <a href="/u/me" className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><User className="h-4 w-4" /></a> : <a href="/auth/login"><Button size="sm"><LogIn className="h-4 w-4 mr-1" />Sign in</Button></a>}
        </div>
      </div>
    </header>
  );
}
