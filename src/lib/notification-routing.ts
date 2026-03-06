import type { NotificationPreference } from "@/db/schema/notification-preferences";

export type NotificationRouteChannel = "in_app" | "email" | "slack" | "browser_push";

export type NotificationRoutingDecision = {
  channels: NotificationRouteChannel[];
  primaryChannel: NotificationRouteChannel;
};

const CHANNEL_PRIORITY: NotificationRouteChannel[] = ["in_app", "email", "slack", "browser_push"];

export function getRoutingDecision(
  eventType: string | null | undefined,
  preferences: NotificationPreference[]
): NotificationRoutingDecision {
  const pref = preferences.find((item) => item.eventType === (eventType || ""));

  const channels: NotificationRouteChannel[] = [];
  if (pref?.inAppEnabled ?? true) channels.push("in_app");
  if (pref?.emailEnabled ?? true) channels.push("email");
  if (pref?.slackEnabled ?? false) channels.push("slack");
  if (pref?.browserPushEnabled ?? false) channels.push("browser_push");

  const primaryChannel = CHANNEL_PRIORITY.find((channel) => channels.includes(channel)) || "in_app";

  return {
    channels,
    primaryChannel,
  };
}

export function channelEnabled(
  channel: NotificationRouteChannel,
  decision: NotificationRoutingDecision
): boolean {
  return decision.channels.includes(channel);
}

export function computePersonalizationBoost(options: {
  eventType: string | null | undefined;
  readByType: Record<string, number>;
  unreadByType: Record<string, number>;
  baselineReadRatio: number;
}): number {
  const eventType = options.eventType || "unknown";
  const read = options.readByType[eventType] || 0;
  const unread = options.unreadByType[eventType] || 0;
  const total = read + unread;

  if (total === 0) return 0;

  const typeReadRatio = read / total;
  const delta = typeReadRatio - options.baselineReadRatio;

  if (delta >= 0.35) return 12;
  if (delta >= 0.2) return 8;
  if (delta >= 0.1) return 5;
  if (delta <= -0.35) return -10;
  if (delta <= -0.2) return -7;
  if (delta <= -0.1) return -4;
  return 0;
}
