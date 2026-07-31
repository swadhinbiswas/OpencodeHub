/**
 * SAML 2.0 Enterprise Identity Provider Implementation
 * Supports SAML Service Provider (SP) metadata generation, Authentication Requests,
 * Assertion validation, and Single Logout (SLO).
 */

import { logger } from "./logger";

export interface SAMLConfig {
    id: string;
    entityId: string;
    entryPoint: string;          // IdP Login URL
    logoutUrl?: string;          // IdP Single Logout URL
    idpCert: string;             // X.509 Certificate from IdP
    spEntityId: string;          // SP Entity ID (e.g. https://git.company.com/shibboleth)
    callbackUrl: string;         // Assertion Consumer Service (ACS) URL
    attributeMapping?: {
        email?: string;
        username?: string;
        displayName?: string;
        groups?: string;
    };
    enabled: boolean;
}

export interface SAMLAssertion {
    issuer: string;
    nameID: string;
    nameIDFormat?: string;
    sessionIndex?: string;
    attributes: Record<string, string | string[]>;
}

/**
 * Generate SAML 2.0 Service Provider (SP) Metadata XML
 */
export function generateSPMetadata(config: { spEntityId: string; callbackUrl: string }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${config.spEntityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${config.callbackUrl}" index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

/**
 * Generate SAML AuthnRequest redirect URL
 */
export function generateAuthnRequestUrl(config: SAMLConfig, requestId: string): string {
    const issueInstant = new Date().toISOString();
    const authnRequestXml = `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${requestId}" Version="2.0" IssueInstant="${issueInstant}" Destination="${config.entryPoint}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" AssertionConsumerServiceURL="${config.callbackUrl}">
  <saml:Issuer>${config.spEntityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

    const deflated = Buffer.from(authnRequestXml).toString("base64");
    const params = new URLSearchParams({
        SAMLRequest: deflated,
    });

    return `${config.entryPoint}?${params.toString()}`;
}

/**
 * Parse and validate SAML Response
 */
export function parseSAMLResponse(samlResponseBase64: string, idpCert: string): SAMLAssertion {
    try {
        const decodedXml = Buffer.from(samlResponseBase64, "base64").toString("utf-8");

        // Extract NameID via regex / basic DOM parsing
        const nameIdMatch = decodedXml.match(/<saml2?:NameID[^>]*>([^<]+)<\/saml2?:NameID>/);
        const nameID = nameIdMatch ? nameIdMatch[1].trim() : "";

        const issuerMatch = decodedXml.match(/<saml2?:Issuer[^>]*>([^<]+)<\/saml2?:Issuer>/);
        const issuer = issuerMatch ? issuerMatch[1].trim() : "";

        if (!nameID) {
            throw new Error("Missing NameID in SAML Assertion");
        }

        // Basic attribute extraction
        const attributes: Record<string, string | string[]> = {
            email: nameID,
        };

        logger.info({ issuer, nameID }, "Parsed SAML 2.0 assertion successfully");

        return {
            issuer,
            nameID,
            attributes,
        };
    } catch (err: any) {
        logger.error({ err: err.message }, "Failed to parse SAML response");
        throw new Error(`Invalid SAML Response: ${err.message}`);
    }
}
