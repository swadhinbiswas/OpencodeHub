import "dotenv/config";
import { getDb } from "../src/lib/db/index.js";
import { instances, cachedRepos, cachedUsers } from "../src/lib/db/schema.js";
import { fetchAllPublicRepos } from "../src/lib/instance-client.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function runSync() {
  console.log("[Sync] Starting global instance synchronization...");
  const db = getDb() as any;
  
  const allInstances = await db.query.instances.findMany();
  console.log(`[Sync] Found ${allInstances.length} instances to sync.`);

  for (const instance of allInstances) {
    console.log(`[Sync] Syncing instance: ${instance.name} (${instance.url})`);
    try {
      const repos = await fetchAllPublicRepos(instance.url);
      const ownersMap = new Map();

      for (const r of repos) {
        if (r.owner && !ownersMap.has(r.owner.username)) {
          ownersMap.set(r.owner.username, r.owner);
        }

        const existing = await db.query.cachedRepos.findFirst({ where: eq(cachedRepos.remoteId, r.id) }).catch(()=>null);
        if (existing) {
          await db.update(cachedRepos).set({ 
            fullName: r.fullName, name: r.name, description: r.description, language: r.language, 
            topics: JSON.stringify(r.topics), starCount: r.starCount, forkCount: r.forkCount, 
            httpCloneUrl: r.httpCloneUrl, updatedAt: r.updatedAt 
          }).where(eq(cachedRepos.id, existing.id));
        } else {
          await db.insert(cachedRepos).values({ 
            id: nanoid(), instanceId: instance.id, remoteId: r.id, fullName: r.fullName, name: r.name, 
            ownerUsername: r.owner.username, ownerDisplayName: r.owner.displayName, ownerAvatarUrl: r.owner.avatarUrl, 
            description: r.description, visibility: r.visibility, language: r.language, topics: JSON.stringify(r.topics), 
            starCount: r.starCount, forkCount: r.forkCount, httpCloneUrl: r.httpCloneUrl, updatedAt: r.updatedAt 
          });
        }
      }

      for (const owner of ownersMap.values()) {
        const existingUser = await db.query.cachedUsers.findFirst({ where: eq(cachedUsers.username, owner.username) }).catch(() => null);
        if (existingUser) {
          await db.update(cachedUsers).set({
            displayName: owner.displayName, avatarUrl: owner.avatarUrl,
          }).where(eq(cachedUsers.id, existingUser.id));
        } else {
          await db.insert(cachedUsers).values({
            id: nanoid(), instanceId: instance.id, remoteId: owner.id || owner.username,
            username: owner.username, displayName: owner.displayName, avatarUrl: owner.avatarUrl,
          });
        }
      }

      await db.update(instances).set({ 
        repoCount: repos.length, status: "online", lastSyncAt: new Date().toISOString() 
      }).where(eq(instances.id, instance.id));
      
      console.log(`[Sync] ✓ Success: ${instance.name} (${repos.length} repos updated)`);
    } catch (e: any) {
      console.error(`[Sync] ✗ Failed: ${instance.name} - ${e.message}`);
      await db.update(instances).set({ status: "error" }).where(eq(instances.id, instance.id)).catch(()=>{});
    }
  }
  console.log("[Sync] Global synchronization complete.");
  process.exit(0);
}

runSync();
