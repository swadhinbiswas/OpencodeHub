type NotificationLike = {
  type?: string | null;
  reason?: string | null;
  isRead?: boolean | null;
  createdAt?: Date | string | null;
};

export type NotificationPriority = "critical" | "high" | "medium" | "low";

export type NotificationPriorityResult = {
  score: number;
  priority: NotificationPriority;
  isBlocking: boolean;
};

const CRITICAL_TYPES = new Set(["security_alert", "merge_blocked"]);
const HIGH_TYPES = new Set(["ci_failed", "review_request", "merge_conflict"]);
const HIGH_REASONS = new Set(["security_alert", "ci_failed", "review_requested", "merge_conflict", "merge_blocked"]);

function getAgeHours(createdAt?: Date | string | null): number {
  if (!createdAt) return 24;
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 24;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60));
}

export function scoreNotificationPriority(notification: NotificationLike): NotificationPriorityResult {
  let score = 0;

  const type = notification.type || "";
  const reason = notification.reason || "";

  if (CRITICAL_TYPES.has(type) || reason === "security_alert") {
    score += 90;
  } else if (HIGH_TYPES.has(type) || HIGH_REASONS.has(reason)) {
    score += 65;
  } else {
    score += 35;
  }

  if (!notification.isRead) score += 20;

  const ageHours = getAgeHours(notification.createdAt);
  if (ageHours <= 2) score += 12;
  else if (ageHours <= 12) score += 8;
  else if (ageHours <= 24) score += 4;

  const isBlocking = score >= 65;
  const priority: NotificationPriority =
    score >= 90 ? "critical" : score >= 70 ? "high" : score >= 45 ? "medium" : "low";

  return { score, priority, isBlocking };
}
