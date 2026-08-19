import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Box, Users, ExternalLink } from "lucide-react";
export function InstanceCard({ instance }: { instance: any }) {
  return (
    <Card className="hover:shadow-lg transition-all hover:-translate-y-0.5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Globe className="h-5 w-5 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{instance.name}</CardTitle>
            <CardDescription className="truncate text-xs">{instance.siteUrl}</CardDescription>
          </div>
          <Badge variant={instance.status === "online" ? "default" : "secondary"} className="capitalize">{instance.status || "pending"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground"><Box className="h-4 w-4" />{instance.repoCount ?? 0} repos</span>
          <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-4 w-4" />{instance.userCount ?? 0} users</span>
        </div>
        {instance.version && <div className="text-xs text-muted-foreground">v{instance.version} · {instance.capabilities?.join(", ")}</div>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={()=>window.open(instance.siteUrl, "_blank")}><ExternalLink className="h-4 w-4 mr-1" />Visit</Button>
          <Button size="sm" className="flex-1" onClick={()=>window.location.href=`/instances/${instance.id}`}>Explore</Button>
        </div>
      </CardContent>
    </Card>
  );
}
