import { describe, it, expect } from "vitest";
import { formatSCIMUser, SCIM_SCHEMAS, createSCIMError } from "../../src/lib/scim";
import { generateSPMetadata } from "../../src/lib/saml";
import { handleDockerV2Ping } from "../../src/lib/packages-server";

describe("SCIM 2.0 Engine", () => {
    it("formats a user object into a valid SCIM 2.0 resource", () => {
        const mockUser = {
            id: "user-123",
            username: "johndoe",
            email: "john@example.com",
            displayName: "John Doe",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-02T00:00:00Z"),
        };

        const scimUser = formatSCIMUser(mockUser, "https://git.example.com");

        expect(scimUser.schemas).toContain(SCIM_SCHEMAS.USER);
        expect(scimUser.id).toBe("user-123");
        expect(scimUser.userName).toBe("johndoe");
        expect(scimUser.emails[0].value).toBe("john@example.com");
        expect(scimUser.active).toBe(true);
        expect(scimUser.meta.location).toBe("https://git.example.com/api/scim/v2/Users/user-123");
    });

    it("creates standard SCIM error objects", () => {
        const err = createSCIMError(404, "User not found");
        expect(err.schemas).toContain(SCIM_SCHEMAS.ERROR);
        expect(err.status).toBe("404");
        expect(err.detail).toBe("User not found");
    });
});

describe("SAML 2.0 Engine", () => {
    it("generates valid Service Provider metadata XML", () => {
        const xml = generateSPMetadata({
            spEntityId: "https://git.example.com/saml/metadata",
            callbackUrl: "https://git.example.com/saml/callback",
        });

        expect(xml).toContain("https://git.example.com/saml/metadata");
        expect(xml).toContain("https://git.example.com/saml/callback");
        expect(xml).toContain("md:EntityDescriptor");
        expect(xml).toContain("md:SPSSODescriptor");
    });
});

describe("OCI Container Registry Server", () => {
    it("returns 200 with Docker-Distribution-Api-Version header on ping", () => {
        const ping = handleDockerV2Ping();
        expect(ping.status).toBe(200);
        expect(ping.headers["Docker-Distribution-Api-Version"]).toBe("registry/2.0");
    });
});
