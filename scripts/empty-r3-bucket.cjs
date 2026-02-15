/**
 * Empty R3 Bucket Script
 * 
 * This script deletes ALL objects from the R3 bucket to start fresh.
 * Use with caution!
 * 
 * Usage: node scripts/empty-r3-bucket.cjs
 */

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
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

async function emptyBucket() {
    console.log(`🗑️  Emptying bucket: ${BUCKET}\n`);

    let totalDeleted = 0;
    let continuationToken;

    do {
        // List objects
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        });

        const listResponse = await client.send(listCommand);

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('No more objects to delete.');
            break;
        }

        console.log(`Found ${listResponse.Contents.length} objects to delete...`);

        // Delete objects in batches
        const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));

        const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: {
                Objects: objectsToDelete,
                Quiet: false,
            },
        });

        const deleteResponse = await client.send(deleteCommand);

        const deleted = deleteResponse.Deleted?.length || 0;
        totalDeleted += deleted;

        console.log(`✅ Deleted ${deleted} objects`);

        if (deleteResponse.Errors && deleteResponse.Errors.length > 0) {
            console.error('❌ Errors during deletion:');
            deleteResponse.Errors.forEach(err => {
                console.error(`  - ${err.Key}: ${err.Message}`);
            });
        }

        continuationToken = listResponse.NextContinuationToken;

    } while (continuationToken);

    console.log(`\n✅ Total objects deleted: ${totalDeleted}`);
    console.log('🎉 Bucket is now empty!');
}

emptyBucket().catch(err => {
    console.error('❌ Error emptying bucket:', err);
    process.exit(1);
});
