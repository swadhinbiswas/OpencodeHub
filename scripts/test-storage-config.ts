
import { getStorage, getStorageConfig, resetStorage } from "../src/lib/storage";

async function main() {
    console.log("--- Testing Storage Configuration ---");

    // 1. Check what getStorageConfig sees from env
    console.log("1. Environment Config:");
    const envConfig = getStorageConfig();
    console.log(`TYPE: ${envConfig.type}`);
    console.log(`PATH: ${envConfig.basePath}`);

    if (envConfig.type !== "local") {
        console.error("FAIL: Expected 'local' from env, got", envConfig.type);
    } else {
        console.log("PASS: Environment config is 'local'");
    }

    // 2. Check what getStorage returns (might verify DB logic too if DB connection works)
    console.log("\n2. Initializing Storage Adapter:");
    try {
        const storage = await getStorage();
        console.log("Storage initialized successfully");

        // Check if it's the right class
        if (storage.constructor.name === "LocalStorageAdapter") {
            console.log("PASS: Adapter is LocalStorageAdapter");
        } else {
            console.error(`FAIL: Adapter is ${storage.constructor.name}`);
        }
    } catch (err) {
        console.error("Error initializing storage:", err);
    }
}

main();
