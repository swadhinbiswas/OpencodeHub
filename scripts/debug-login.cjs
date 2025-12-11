const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database("./data/opencodehub.db");

const email = "swadhinbiswas.cse@gmail.com";
const password = "swadh1n@@";

const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

if (!user) {
  console.log("User not found in DB");
} else {
  console.log("User found:", user.username);
  console.log("Stored Hash:", user.password_hash);

  const isValid = bcrypt.compareSync(password, user.password_hash);
  console.log("Password Valid:", isValid);
}
