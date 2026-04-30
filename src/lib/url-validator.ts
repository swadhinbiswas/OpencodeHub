/**
 * URL Validator — SSRF Protection
 * Validates webhook/callback URLs to prevent Server-Side Request Forgery.
 * Blocks requests to private/internal networks, non-HTTP schemes, and localhost.
 */

import dns from "dns/promises";
import { URL } from "url";
import { logger } from "./logger";

/**
 * Private and reserved IP ranges that should be blocked
 */
const PRIVATE_IP_RANGES = [
  // IPv4 private ranges
  { start: parseIPv4("10.0.0.0"), end: parseIPv4("10.255.255.255") }, // 10.0.0.0/8
  { start: parseIPv4("172.16.0.0"), end: parseIPv4("172.31.255.255") }, // 172.16.0.0/12
  { start: parseIPv4("192.168.0.0"), end: parseIPv4("192.168.255.255") }, // 192.168.0.0/16
  { start: parseIPv4("127.0.0.0"), end: parseIPv4("127.255.255.255") }, // 127.0.0.0/8 (loopback)
  { start: parseIPv4("169.254.0.0"), end: parseIPv4("169.254.255.255") }, // 169.254.0.0/16 (link-local, AWS metadata)
  { start: parseIPv4("0.0.0.0"), end: parseIPv4("0.255.255.255") }, // 0.0.0.0/8
  { start: parseIPv4("100.64.0.0"), end: parseIPv4("100.127.255.255") }, // 100.64.0.0/10 (Carrier-grade NAT)
  { start: parseIPv4("192.0.0.0"), end: parseIPv4("192.0.0.255") }, // 192.0.0.0/24 (IETF protocol)
  { start: parseIPv4("198.18.0.0"), end: parseIPv4("198.19.255.255") }, // 198.18.0.0/15 (benchmark)
  { start: parseIPv4("224.0.0.0"), end: parseIPv4("255.255.255.255") }, // Multicast + reserved
];

/**
 * Blocked hostnames (case-insensitive)
 */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal", // GCP metadata
  "169.254.169.254", // AWS/Azure/GCP metadata IP
  "metadata.google.internal.",
]);

function parseIPv4(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  );
}

function isIPv4Private(ip: string): boolean {
  const numeric = parseIPv4(ip);
  return PRIVATE_IP_RANGES.some(
    (range) => numeric >= range.start && numeric <= range.end,
  );
}

function isIPv6Private(ip: string): boolean {
  // Strip brackets if present (URL.hostname may return [::1] instead of ::1)
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  // ::1 (loopback)
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // fe80::/10 (link-local)
  if (lower.startsWith("fe80:")) return true;
  // fd00::/8 (unique local)
  if (lower.startsWith("fd")) return true;
  // fc00::/7
  if (lower.startsWith("fc")) return true;
  // ::ffff:127.0.0.1 (IPv4-mapped)
  if (lower.startsWith("::ffff:")) {
    const ipv4Part = lower.slice(7);
    if (ipv4Part.includes(".")) return isIPv4Private(ipv4Part);
  }
  return false;
}

/**
 * Validate a URL for webhook/callback use.
 * Returns { valid: true } or { valid: false, reason: string }
 */
export async function validateWebhookUrl(
  url: string,
): Promise<{ valid: true } | { valid: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // Only HTTP and HTTPS are allowed
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      reason: `Scheme "${parsed.protocol}" is not allowed. Only HTTP/HTTPS are supported.`,
    };
  }

  // Check blocked hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `Hostname "${hostname}" is not allowed` };
  }

  // If hostname is already an IP, check it directly
  if (isIPv4Address(hostname)) {
    if (isIPv4Private(hostname)) {
      return {
        valid: false,
        reason: `IP address "${hostname}" is in a private/reserved range`,
      };
    }
    return { valid: true };
  }

  if (isIPv6Address(hostname)) {
    if (isIPv6Private(hostname)) {
      return {
        valid: false,
        reason: `IPv6 address "${hostname}" is in a private/reserved range`,
      };
    }
    return { valid: true };
  }

  // Resolve hostname to IP(s) and check each
  try {
    const addresses = await dns
      .resolve4(parsed.hostname)
      .catch(() => [] as string[]);
    const addresses6 = await dns
      .resolve6(parsed.hostname)
      .catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      return {
        valid: false,
        reason: `Unable to resolve hostname "${parsed.hostname}"`,
      };
    }

    for (const addr of addresses) {
      if (isIPv4Private(addr)) {
        return {
          valid: false,
          reason: `Hostname "${parsed.hostname}" resolves to private IP "${addr}"`,
        };
      }
    }

    for (const addr of addresses6) {
      if (isIPv6Private(addr)) {
        return {
          valid: false,
          reason: `Hostname "${parsed.hostname}" resolves to private IPv6 "${addr}"`,
        };
      }
    }
  } catch (err) {
    logger.warn(
      { hostname: parsed.hostname, err },
      "DNS resolution failed for webhook URL",
    );
    return {
      valid: false,
      reason: `DNS resolution failed for "${parsed.hostname}"`,
    };
  }

  return { valid: true };
}

/**
 * Synchronous validation (scheme + hostname only, no DNS resolution).
 * Use for Zod schema validation where async is not possible.
 */
export function isAllowedWebhookUrlSync(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (isIPv4Address(hostname) && isIPv4Private(hostname)) return false;
    if (isIPv6Address(hostname) && isIPv6Private(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function isIPv4Address(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s);
}

function isIPv6Address(s: string): boolean {
  return s.includes(":");
}
