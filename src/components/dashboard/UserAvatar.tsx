import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
    user: {
        username: string;
        displayName?: string | null;
        avatarUrl?: string | null;
    };
    className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
    return (
        <Avatar className={className}>
            <AvatarImage src={user.avatarUrl || undefined} alt={user.username} />
            <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xl">
                {user.username[0].toUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}
