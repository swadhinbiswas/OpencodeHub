export function isAirGappedMode(): boolean {
  const value = (process.env.AIR_GAPPED_MODE || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function getAirGappedMessage(feature: string): string {
  return `${feature} is disabled because AIR_GAPPED_MODE is enabled`;
}

export function assertOnlineFeature(feature: string): void {
  if (isAirGappedMode()) {
    throw new Error(getAirGappedMessage(feature));
  }
}

