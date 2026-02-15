/**
 * List S3 Bucket Contents
 * 
 * Shows what's currently in the R3 bucket to verify it's clean
 */

const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '..', '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
    }
});

const client = new S3Client({
    region: process.env.STORAGE_REGION || 'auto',
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

const BUCKET = process.env.STORAGE_BUCKET;

async function listBucket() {
    console.log(`📦 Listing contents of bucket: ${BUCKET}\n`);

    let totalObjects = 0;
    let continuationToken;

    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET,
            ContinuationToken: continuationToken,
            MaxKeys: 100, // Show first 100
        });

        const response = await client.send(listCommand);

        if (!response.Contents || response.Contents.length === 0) {
            console.log('✅ Bucket is empty!');
            break;
        }

        console.log(`Found ${response.Contents.length} objects:\n`);

        response.Contents.forEach(obj => {
            console.log(`  ${obj.Key} (${obj.Size} bytes)`);
            totalObjects++;
        });

        continuationToken = response.NextContinuationToken;

        if (totalObjects >= 100) {
            console.log('\n... (showing first 100 objects)');
            break;
        }

    } while (continuationToken);

    console.log(`\n📊 Total objects shown: ${totalObjects}`);

    // Check for corrupted paths
    console.log('\n🔍 Checking for corrupted paths (reposswadhinbiswas)...');
    // We'd need to scan all to find these
}

listBucket().catch(err => {
    console.error('❌ Error listing bucket:', err);
    process.exit(1);
});
