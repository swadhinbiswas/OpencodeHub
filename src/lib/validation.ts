import { z } from "zod";
import { sanitizeHtml } from "./sanitize";
import { lookup } from "dns";
import { promisify } from "util";

const dnsLookup = promisify(lookup);

/**
 * Check if an IPv4 address falls within a CIDR range
 */
function isIPv4InCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const mask = ~((1 << (32 - parseInt(bits))) - 1);
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  if (ipNum === null || rangeNum === null) return false;
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if an IPv6 address falls within a CIDR range
 */
function isIPv6InCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const prefixLen = parseInt(bits);
  const ipBuf = ipv6ToBuffer(ip);
  const rangeBuf = ipv6ToBuffer(range);
  if (!ipBuf || !rangeBuf) return false;
  const fullBytes = Math.floor(prefixLen / 8);
  const remainingBits = prefixLen % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (ipBuf[i] !== rangeBuf[i]) return false;
  }
  if (remainingBits > 0) {
    const mask = ~((1 << (8 - remainingBits)) - 1) & 0xff;
    if ((ipBuf[fullBytes] & mask) !== (rangeBuf[fullBytes] & mask)) return false;
  }
  return true;
}

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts.reduce((acc, part) => (acc << 8) + parseInt(part), 0) >>> 0;
}

function ipv6ToBuffer(ip: string): Buffer | null {
  try {
    // Expand compressed IPv6
    const sections = ip.split(":");
    if (sections.length > 8) return null;
    // Handle :: expansion
    const fullSections = [];
    let foundDoubleColon = false;
    for (const s of sections) {
      if (s === "") {
        if (foundDoubleColon) return null;
        foundDoubleColon = true;
        const remaining = 8 - sections.length + 1;
        for (let i = 0; i < remaining; i++) fullSections.push("0000");
      } else {
        fullSections.push(s.padStart(4, "0"));
      }
    }
    while (fullSections.length < 8) fullSections.push("0000");
    const hex = fullSections.join("");
    return Buffer.from(hex, "hex");
  } catch {
    return null;
  }
}

/**
 * Resolve hostname and check if the resolved IP is private/reserved
 */
async function isPrivateOrReservedIP(hostname: string): Promise<boolean> {
  // Always block these hostnames before DNS resolution
  const alwaysBlockedHostnames = [
    "localhost",
    "127.0.0.1",
    "::1",
    "metadata.google.internal",
  ];
  if (alwaysBlockedHostnames.includes(hostname.toLowerCase())) return true;

  try {
    const { address } = await dnsLookup(hostname);
    const ip = address.toLowerCase();

    // Block 0.0.0.0
    if (ip === "0.0.0.0") return true;

    // Block 169.254.0.0/16 (link-local)
    if (ip.startsWith("169.254.")) return true;

    // Block 10.0.0.0/8 (RFC 1918)
    if (ip.startsWith("10.")) return true;

    // Block 172.16.0.0/12 (RFC 1918)
    if (isIPv4InCidr(ip, "172.16.0.0/12")) return true;

    // Block 192.168.0.0/16 (RFC 1918)
    if (ip.startsWith("192.168.")) return true;

    // Block 127.0.0.0/8 (loopback)
    if (ip.startsWith("127.")) return true;

    // IPv6 private/reserved ranges
    if (ip.includes(":")) {
      // fc00::/7 (unique local addresses)
      if (isIPv6InCidr(ip, "fc00::/7")) return true;
      // fe80::/10 (link-local)
      if (isIPv6InCidr(ip, "fe80::/10")) return true;
      // ::1 (loopback)
      if (ip === "::1") return true;
      // ::0 (unspecified)
      if (ip === "::") return true;
    }
  } catch {
    // DNS resolution failed — reject to be safe
    return true;
  }

  return false;
}

/**
 * Validation Schemas for OpenCodeHub APIs
 * These schemas prevent injection attacks and ensure data integrity
 */

// Branch Protection
export const BranchProtectionSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9\/*_-]+$/, "Invalid branch pattern"),
  active: z.boolean().optional().default(true),
  requiresPr: z.boolean().optional().default(false),
  requiredApprovals: z.number().int().min(0).max(10).optional().default(1),
  dismissStaleReviews: z.boolean().optional().default(false),
  requireCodeOwnerReviews: z.boolean().optional().default(false),
  allowForcePushes: z.boolean().optional().default(false),
});

// Repository Creation
export const CreateRepositorySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid repository name"),
  description: z.string().max(500).optional(),
  visibility: z.enum(["public", "private", "internal"]).default("public"),
  defaultBranch: z.string().min(1).max(255).default("main"),
  hasIssues: z.boolean().optional().default(true),
  hasWiki: z.boolean().optional().default(true),
  hasActions: z.boolean().optional().default(true),
  allowForking: z.boolean().optional().default(true),
});

// User Registration
export const RegisterUserSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(39)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid username"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8).max(100),
  displayName: z.string().max(100).optional(),
});

// Issue Creation
export const CreateIssueSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(65535).transform(sanitizeHtml).optional(),
});

// Pull Request Creation
export const CreatePullRequestSchema = z.object({
  title: z.string().min(1).max(500),
  body: z.string().max(65535).transform(sanitizeHtml).optional(),
  head: z.string().min(1).max(255),
  base: z.string().min(1).max(255),
});

// Storage Configuration
export const StorageConfigSchema = z.object({
  type: z.enum(["local", "s3"]),
  basePath: z.string().min(1).max(1000).optional(),
  bucket: z.string().max(255).optional(),
  region: z.string().max(100).optional(),
  endpoint: z.string().url().optional().or(z.literal("")),
  accessKeyId: z.string().max(255).optional(),
  secretAccessKey: z.string().max(255).optional(),
});

// General Config
export const GeneralConfigSchema = z.object({
  siteName: z.string().min(1).max(100).optional(),
  siteDescription: z.string().max(500).optional(),
  allowSignups: z.boolean().optional(),
  smtpHost: z.string().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().max(255).optional(),
  smtpPass: z.string().max(255).optional(),
  smtpFrom: z.string().email().optional(),
});

// Webhook Configuration
export const WebhookConfigSchema = z.object({
  url: z
    .string()
    .url()
    .refine(
      async (url) => {
        try {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol)) return false;
          const h = parsed.hostname.toLowerCase();
          // Check if the resolved IP is private/reserved via DNS lookup
          return !(await isPrivateOrReservedIP(h));
        } catch {
          return false;
        }
      },
      {
        message:
          "Webhook URL must use HTTP/HTTPS and must not target private/reserved addresses",
      },
    ),
  events: z.array(z.string()).min(1),
  secret: z.string().max(255).optional(),
  active: z.boolean().optional().default(true),
});
