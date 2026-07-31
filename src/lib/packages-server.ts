/**
 * OCI Container Registry (Docker v2 API) & Package Registry Protocol Engine
 * Implements distribution spec for Docker/OCI image manifests, blobs, and NPM tarballs.
 */

import { logger } from "./logger";

export interface OCIManifest {
    schemaVersion: number;
    mediaType: string;
    config: {
        mediaType: string;
        size: number;
        digest: string;
    };
    layers: Array<{
        mediaType: string;
        size: number;
        digest: string;
    }>;
}

/**
 * Handle OCI Version Check GET /v2/
 */
export function handleDockerV2Ping() {
    return {
        status: 200,
        headers: {
            "Docker-Distribution-Api-Version": "registry/2.0",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
    };
}

/**
 * Parse OCI Container Manifest
 */
export function parseOCIManifest(rawJson: string): OCIManifest {
    try {
        const manifest = JSON.parse(rawJson) as OCIManifest;
        if (!manifest.schemaVersion || !manifest.config) {
            throw new Error("Invalid OCI manifest format");
        }
        return manifest;
    } catch (err: any) {
        logger.error({ err: err.message }, "Failed to parse OCI manifest");
        throw err;
    }
}

/**
 * Format NPM Package Metadata
 */
export function formatNPMPackageMetadata(packageName: string, versions: Record<string, any>) {
    const latestVersion = Object.keys(versions).pop() || "1.0.0";
    return {
        name: packageName,
        "dist-tags": {
            latest: latestVersion,
        },
        versions,
    };
}
