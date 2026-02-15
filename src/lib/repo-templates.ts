/**
 * Repository Template Library
 * Handle creating repositories from templates
 */

import { getDatabase, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import {
    finalizeRepoInit,
    getDiskPath,
    initRepoInStorage,
    isCloudStorage,
    resolveRepoPath,
} from "@/lib/git-storage";

interface CreateFromTemplateOptions {
    templateRepoId: string;
    newOwnerId: string;
    newOwnerUsername: string;
    newName: string;
    newDescription?: string;
    visibility?: "public" | "private" | "internal";
    includeAllBranches?: boolean;
    diskPath?: string;
    sshCloneUrl?: string;
    httpCloneUrl?: string;
    hasIssues?: boolean;
    hasWiki?: boolean;
    hasActions?: boolean;
    licenseType?: string;
}

interface CreateResult {
    success: boolean;
    repositoryId?: string;
    error?: string;
}

/**
 * Create a new repository from a template
 */
export async function createFromTemplate(options: CreateFromTemplateOptions): Promise<CreateResult> {
    const db = getDatabase();

    // Get template repository
    const template = await db.query.repositories.findFirst({
        where: eq(schema.repositories.id, options.templateRepoId),
    });

    if (!template) {
        return { success: false, error: "Template repository not found" };
    }

    if (!template.isTemplate) {
        return { success: false, error: "Repository is not marked as a template" };
    }

    const newRepoId = uuidv4();
    const newSlug = options.newName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const newDiskPath = options.diskPath || (await getDiskPath(options.newOwnerUsername, newSlug));

    const templatePath = await resolveRepoPath(template.diskPath);
    const localRepoPath = await initRepoInStorage(options.newOwnerUsername, newSlug);

    try {
        await fs.rm(localRepoPath, { recursive: true, force: true });
        await fs.mkdir(path.dirname(localRepoPath), { recursive: true });

        // Clone template (bare clone for efficiency)
        const git = simpleGit();

        if (options.includeAllBranches) {
            // Clone with all branches
            await git.clone(templatePath, localRepoPath, ["--bare"]);
        } else {
            // Clone only default branch
            await git.clone(templatePath, localRepoPath, ["--bare", "--single-branch"]);
        }

        // Remove template-specific refs
        const newGit = simpleGit(localRepoPath);

        // Update origin to remove upstream reference
        try {
            await newGit.remote(["remove", "origin"]);
        } catch {
            // Origin may not exist in bare repos
        }

        // Create new repository record
        // @ts-expect-error - Drizzle multi-db union type issue
        const [newRepo] = await db.insert(schema.repositories).values({
            id: newRepoId,
            name: options.newName,
            slug: newSlug,
            description: options.newDescription || `Created from template: ${template.name}`,
            ownerId: options.newOwnerId,
            ownerType: "user",
            visibility: options.visibility || "public",
            defaultBranch: template.defaultBranch,
            diskPath: newDiskPath,
            sshCloneUrl: options.sshCloneUrl,
            httpCloneUrl: options.httpCloneUrl,
            hasIssues: options.hasIssues ?? template.hasIssues ?? true,
            hasWiki: options.hasWiki ?? template.hasWiki ?? true,
            hasActions: options.hasActions ?? template.hasActions ?? true,
            licenseType: options.licenseType ?? template.licenseType,
            isTemplate: false, // New repo is not a template by default
        }).returning();

        if (await isCloudStorage()) {
            await finalizeRepoInit(options.newOwnerUsername, newSlug);
        }

        logger.info({
            templateId: options.templateRepoId,
            newRepoId,
            newName: options.newName
        }, "Created repository from template");

        return { success: true, repositoryId: newRepoId };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logger.error({ error: errorMessage, templateId: options.templateRepoId }, "Failed to create from template");

        // Cleanup on failure
        try {
            await fs.rm(localRepoPath, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Get all template repositories
 */
export async function getTemplateRepositories() {
    const db = getDatabase();

    return db.query.repositories.findMany({
        where: eq(schema.repositories.isTemplate, true),
        columns: {
            id: true,
            name: true,
            description: true,
            ownerId: true,
            language: true,
            topics: true,
            starCount: true,
        },
    });
}

/**
 * Mark a repository as a template
 */
export async function setAsTemplate(repoId: string, isTemplate: boolean): Promise<boolean> {
    const db = getDatabase();

    try {
        // @ts-expect-error - Drizzle multi-db union type issue
        await db.update(schema.repositories)
            .set({ isTemplate })
            .where(eq(schema.repositories.id, repoId));

        logger.info({ repoId, isTemplate }, "Repository template status updated");
        return true;
    } catch (error) {
        logger.error({ repoId, error }, "Failed to update template status");
        return false;
    }
}
