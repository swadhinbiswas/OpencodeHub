/**
 * SCIM 2.0 ServiceProviderConfig Endpoint
 * GET /api/scim/v2/ServiceProviderConfig
 */

import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
    const config = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        documentationUri: "https://docs.opencodehub.space/administration/security/#scim-provisioning",
        patch: {
            supported: true,
        },
        bulk: {
            supported: false,
            maxOperations: 0,
            maxPayloadSize: 0,
        },
        filter: {
            supported: true,
            maxResults: 200,
        },
        changePassword: {
            supported: false,
        },
        sort: {
            supported: false,
        },
        etag: {
            supported: false,
        },
        authenticationSchemes: [
            {
                name: "OAuth Bearer Token",
                description: "Authentication via OAuth Bearer Token / Personal Access Token",
                specUri: "https://tools.ietf.org/html/rfc6750",
                type: "oauthbearertoken",
                primary: true,
            },
        ],
    };

    return new Response(JSON.stringify(config), {
        status: 200,
        headers: {
            "Content-Type": "application/scim+json",
        },
    });
};
