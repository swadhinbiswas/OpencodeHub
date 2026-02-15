function isProductionRuntime(): boolean {
  return import.meta.env.PROD || process.env.NODE_ENV === "production";
}

function normalizeSiteUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function getSiteUrl(): string {
  const configured = import.meta.env.SITE_URL || process.env.SITE_URL;
  if (configured) {
    return normalizeSiteUrl(configured);
  }

  if (isProductionRuntime()) {
    throw new Error("SITE_URL environment variable is required in production");
  }

  return "http://localhost:4321";
}

