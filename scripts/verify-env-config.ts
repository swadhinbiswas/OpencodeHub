
import { validateEnvironment } from "../src/lib/env-validation";
import { getStorage } from "../src/lib/storage";

// Mock process.env
process.env.STORAGE_TYPE = "gdrive";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
process.env.GOOGLE_FOLDER_ID = "test-folder-id";
// Mock required vars to pass validation
process.env.JWT_SECRET = "a".repeat(32);
process.env.SESSION_SECRET = "a".repeat(32);
process.env.INTERNAL_HOOK_SECRET = "a".repeat(32);
process.env.SITE_URL = "http://localhost:3000";

async function verify() {
    console.log("Running verification...");

    // 1. Test Environment Validation
    console.log("\n1. Testing Environment Validation:");
    const isValid = validateEnvironment(false); // Don't exit on error
    if (isValid) {
        console.log("✅ Validation passed with valid Google Drive vars");
    } else {
        console.error("❌ Validation failed unexpectedly");
        process.exit(1);
    }

    // 2. Test Missing Vars
    console.log("\n2. Testing Missing Google Drive Vars:");
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    const isInvalid = !validateEnvironment(false);
    if (isInvalid) {
        console.log("✅ Validation correctly failed when GOOGLE_CLIENT_ID is missing");
    } else {
        console.error("❌ Validation passed despite missing GOOGLE_CLIENT_ID");
        process.exit(1);
    }
    process.env.GOOGLE_CLIENT_ID = originalClientId; // Restore

    // 3. Test Storage Config Loading
    console.log("\n3. Testing Storage Configuration Loading:");
    try {
        const storage = await getStorage();
        // @ts-ignore - Accessing protected/private property for verification or just checking type
        const config = (storage as any).config;

        if (config.type === 'gdrive' &&
            config.googleClientId === 'test-client-id' &&
            config.googleClientSecret === 'test-client-secret' &&
            config.googleFolderId === 'test-folder-id') {
            console.log("✅ Storage adapter loaded with correct configuration from env");
        } else {
            console.error("❌ Storage adapter loaded with incorrect configuration:", config);
            process.exit(1);
        }
    } catch (error) {
        console.error("❌ Failed to load storage adapter:", error);
        process.exit(1);
    }

    console.log("\n🎉 ALL VERIFICATION CHECKS PASSED!");
}

verify();
