// custom uuid removed

const db = new Database("./data/opencodehub.db");

console.log("Seeding database...");

// Create a user
let userId = "user_admin_seed";
const user = {
  id: userId,
  username: "swadhin",
  email: "swadhinbiswas.cse@gmail.com",
  display_name: "Swadhin Biswas",
  password_hash: "$2a$10$pPC5APl.B4o0jV8sQ3kvb.o3hE7VVmXSyrmWg3.FDU/0AyZTvqAuq", // 'swadh1n@@'
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

try {
  const existingUser = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(user.email);
  if (existingUser) {
    console.log("User already exists, using existing ID:", existingUser.id);
    userId = existingUser.id;
  } else {
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, email, display_name, password_hash, created_at, updated_at)
      VALUES (@id, @username, @email, @display_name, @password_hash, @created_at, @updated_at)
    `);
    insertUser.run(user);
    console.log("User created:", user.username);
  }
} catch (e) {
  console.log("Error creating/finding user:", e.message);
}

// Create a repo
const repoId = "repo_core_seed";
const repo = {
  id: repoId,
  name: "opencodehub-core",
  slug: "opencodehub-core",
  description: "The core engine of OpenCodeHub. Self-hosted, fast, and secure.",
  owner_id: userId, // Use the resolved userId
  visibility: "public",
  default_branch: "main",
  disk_path: "./data/repos/admin/opencodehub-core.git",
  star_count: 128,
  language: "TypeScript",
  updated_at: new Date().toISOString(),
};

try {
  const existingRepo = db
    .prepare("SELECT id FROM repositories WHERE slug = ? AND owner_id = ?")
    .get(repo.slug, userId);
  if (existingRepo) {
    console.log("Repo already exists, skipping.");
  } else {
    const insertRepo = db.prepare(`
      INSERT INTO repositories (id, name, slug, description, owner_id, visibility, default_branch, disk_path, star_count, language, updated_at)
      VALUES (@id, @name, @slug, @description, @owner_id, @visibility, @default_branch, @disk_path, @star_count, @language, @updated_at)
    `);
    insertRepo.run(repo);
    console.log("Repo created:", repo.name);
  }
} catch (e) {
  console.log("Repo already exists or error:", e.message);
}

console.log("Seeding complete.");
