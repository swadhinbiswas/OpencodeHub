export function parseApiErrorMessage(
  status: number,
  data: unknown,
  fallbackPrefix = "API error",
) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return `${fallbackPrefix}: ${status}`;

  const record = data as Record<string, unknown>;
  const directMessage = record.message || record.error || record.detail;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage.trim();
  }

  if (record.errors && Array.isArray(record.errors) && record.errors.length > 0) {
    const messages = record.errors
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const msg = (entry as Record<string, unknown>).message;
          if (typeof msg === "string") return msg;
        }
        return null;
      })
      .filter((entry): entry is string => !!entry);
    if (messages.length > 0) return messages.join("; ");
  }

  return `${fallbackPrefix}: ${status}`;
}
