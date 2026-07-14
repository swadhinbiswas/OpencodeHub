import { getDatabase, schema } from "./src/db";
async function main() {
  const db = getDatabase();
  await db.update(schema.users).set({ isAdmin: true });
  console.log("Made all users admin.");
  process.exit(0);
}
main();
