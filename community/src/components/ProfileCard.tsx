import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MapPin, Link as LinkIcon, Building } from "lucide-react";
export function ProfileCard({ profile }: { profile: any }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5 flex gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={profile.avatarUrl} />
          <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{profile.displayName || profile.username} <span className="text-muted-foreground font-normal">@{profile.username}</span></div>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{profile.bio || "No bio"}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {profile.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span>}
            {profile.company && <span className="flex items-center gap-1"><Building className="h-3 w-3" />{profile.company}</span>}
            {profile.website && <a href={profile.website} target="_blank" className="flex items-center gap-1 hover:text-primary"><LinkIcon className="h-3 w-3" />Website</a>}
          </div>
        </div>
        <Button size="sm" variant="outline">Follow</Button>
      </CardContent>
    </Card>
  );
}
