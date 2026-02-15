import { getStorage } from '../src/lib/storage';

/**
 * This script identifies and optionally deletes corrupted repository structures in S3.
 * 
 * Corrupted repos have the pattern: repos/swadhinbiswas/test.git/reposswadhinbiswas/...
 * instead of: repos/swadhinbiswas/test.git/HEAD, refs/, objects/, etc.
 * 
 * Usage:
 *   npx ts-node scripts/clean-corrupted-s3-repos.ts [--delete]
 */

async function main() {
    const shouldDelete = process.argv.includes('--delete');

    console.log('Scanning S3 for corrupted repository structures...\n');

    const storage = await getStorage();

    // List all repos
    const result = await storage.list({ prefix: 'repos/' });

    const corruptedRepos: string[] = [];
    const seenRepos = new Set<string>();

    // Check each prefix/object
    if (result.prefixes) {
        for (const prefix of result.prefixes) {
            // Expected pattern: repos/owner/repo.git/
            const parts = prefix.split('/');

            if (parts.length === 4 && parts[2].endsWith('.git')) {
                const repoPath = parts.slice(0, 3).join('/'); // repos/owner/repo.git

                if (seenRepos.has(repoPath)) continue;
                seenRepos.add(repoPath);

                // Check what's inside this repo
                const repoContents = await storage.list({ prefix: repoPath + '/' });

                // Check if it has the corrupted nested structure
                if (repoContents.prefixes) {
                    for (const subPrefix of repoContents.prefixes) {
                        const subParts = subPrefix.split('/');
                        const lastPart = subParts[subParts.length - 2]; // Get directory name

                        // If it starts with "repos" it's corrupted
                        if (lastPart && lastPart.startsWith('repos')) {
                            console.log(`❌ CORRUPTED: ${repoPath}/`);
                            console.log(`   Found invalid directory: ${lastPart}`);
                            corruptedRepos.push(repoPath);
                            break;
                        }
                    }
                }

                // Also check if it has proper Git structure
                const hasValidStructure = repoContents.objects?.some(obj =>
                    obj.key.endsWith('/HEAD') ||
                    obj.key.includes('/refs/') ||
                    obj.key.includes('/objects/')
                );

                if (!hasValidStructure && !corruptedRepos.includes(repoPath)) {
                    console.log(`⚠️  EMPTY or INCOMPLETE: ${repoPath}/`);
                } else if (!corruptedRepos.includes(repoPath)) {
                    console.log(`✅ VALID: ${repoPath}/`);
                }
            }
        }
    }

    console.log(`\n\nSummary:`);
    console.log(`Found ${corruptedRepos.length} corrupted repositories`);

    if (corruptedRepos.length > 0) {
        console.log('\nCorrupted repositories:');
        corruptedRepos.forEach(repo => console.log(`  - ${repo}`));

        if (shouldDelete) {
            console.log('\n🗑️  Deleting corrupted repositories...');

            for (const repoPath of corruptedRepos) {
                console.log(`Deleting ${repoPath}...`);

                // List ALL objects under this path
                const toDelete = await storage.list({ prefix: repoPath + '/' });

                if (toDelete.objects) {
                    for (const obj of toDelete.objects) {
                        await storage.delete(obj.key);
                        console.log(`  Deleted: ${obj.key}`);
                    }
                }
            }

            console.log('\n✅ Cleanup complete!');
        } else {
            console.log('\nTo delete these repositories, run:');
            console.log('  npx ts-node scripts/clean-corrupted-s3-repos.ts --delete');
        }
    }
}

main().catch(console.error);
