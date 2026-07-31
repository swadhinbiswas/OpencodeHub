/**
 * SAML 2.0 Service Provider (SP) Metadata Endpoint
 * GET /api/auth/saml/metadata
 * Exposes SAML SP XML metadata for IdP discovery
 */

import type { APIRoute } from "astro";
import { generateSPMetadata } from "@/lib/saml";

export const GET: APIRoute = async ({ url }) => {
    const baseUrl = new URL(url).origin;
    const spEntityId = `${baseUrl}/api/auth/saml/metadata`;
    const callbackUrl = `${baseUrl}/api/auth/saml/callback`;

    const metadataXml = generateSPMetadata({
        spEntityId,
        callbackUrl,
    });

    return new Response(metadataXml, {
        status: 200,
        headers: {
            "Content-Type": "application/samlmetadata+xml",
        },
    });
};
