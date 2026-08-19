import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, GitFork, Eye, BookOpen } from "lucide-react";
export function RepoCard({ repo, onStar }: { repo: any; onStar?: () => void }) {
  return (
    <Card className="hover:shadow-lg transition-shadow group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <a href={`/explore?repo=${encodeURIComponent(repo.fullName)}`} className="font-semibold text-primary hover:underline truncate">{repo.fullName}</a>
              <Badge variant="outline" className="text-[10px] capitalize">{repo.visibility}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{repo.description || "No description"}</p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              {repo.language && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" />{repo.language}</span>}
              <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5" />{repo.starCount}</span>
              <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{repo.forkCount}</span>
              {repo.instanceName && <Badge variant="secondary" className="text-[10px]">{repo.instanceName}</Badge>}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onStar} className="flex-shrink-0"><Star className="h-4 w-4 mr-1" />Star</Button>
        </div>
      </CardContent>
    </Card>
  );
}
