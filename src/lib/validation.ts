import { z } from "zod";

/**
 * Validation Schemas for OpenCodeHub APIs
 * These schemas prevent injection attacks and ensure data integrity
 */

// Branch Protection
export const BranchProtectionSchema = z.object({
    pattern: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\/*_-]+$/, "Invalid branch pattern"),
    active: z.boolean().optional().default(true),
    requiresPr: z.boolean().optional().default(false),
    requiredApprovals: z.number().int().min(0).max(10).optional().default(1),
    dismissStaleReviews: z.boolean().optional().default(false),
    requireCodeOwnerReviews: z.boolean().optional().default(false),
    allowForcePushes: z.boolean().optional().default(false),
});

// Repository Creation
export const CreateRepositorySchema = z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/, "Invalid repository name"),
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
    username: z.string().min(3).max(39).regex(/^[a-zA-Z0-9_-]+$/, "Invalid username"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8).max(100),
    displayName: z.string().max(100).optional(),
});

// Issue Creation
export const CreateIssueSchema = z.object({
    title: z.string().min(1).max(500),
    body: z.string().max(65535).optional(),
});

// Pull Request Creation
export const CreatePullRequestSchema = z.object({
    title: z.string().min(1).max(500),
    body: z.string().max(65535).optional(),
    head: z.string().min(1).max(255),
    base: z.string().min(1).max(255),
});

// Storage Configuration
export const StorageConfigSchema = z.object({
    type: z.enum(["local", "s3", "gcs", "azure", "rclone", "gdrive", "onedrive"]),
    basePath: z.string().min(1).max(1000).optional(),
    bucket: z.string().max(255).optional(),
    region: z.string().max(100).optional(),
    endpoint: z.string().url().optional().or(z.literal("")),
    accessKeyId: z.string().max(255).optional(),
    secretAccessKey: z.string().max(255).optional(),
    rcloneRemote: z.string().max(255).optional(),
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
    url: z.string().url(),
    events: z.array(z.string()).min(1),
    secret: z.string().max(255).optional(),
    active: z.boolean().optional().default(true),
});
