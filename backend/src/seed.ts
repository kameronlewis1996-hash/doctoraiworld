import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { db } from "./db";

dotenv.config();

function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || "";

  if (!email || !password) {
    console.log("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed.");
    return;
  }

  const existing = db.prepare("SELECT id FROM admins WHERE email = ?").get(email);
  if (existing) {
    console.log(`Admin ${email} already exists — leaving it as-is.`);
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  db.prepare("INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)").run(
    randomUUID(),
    email,
    passwordHash
  );
  console.log(`Created admin account for ${email}.`);
}

function seedDemoData() {
  const userCount = (db.prepare("SELECT COUNT(*) AS c FROM app_users").get() as { c: number }).c;
  if (userCount > 0) {
    console.log("Demo app users already present — skipping demo data seed.");
    return;
  }

  const features = ["symptom_checker", "med_reminder", "chat", "report_summary"];
  const insertUser = db.prepare(
    `INSERT INTO app_users (id, email, display_name, is_pro, pro_expires_at, is_banned, created_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now', ?))`
  );
  const insertQuery = db.prepare(
    `INSERT INTO ai_queries (id, user_id, feature, prompt_tokens, completion_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < 40; i++) {
      const id = randomUUID();
      const daysAgo = Math.floor(Math.random() * 30);
      const isPro = Math.random() < 0.3;
      insertUser.run(
        id,
        `demo.user${i}@example.com`,
        `Demo User ${i}`,
        isPro ? 1 : 0,
        isPro ? new Date(Date.now() + 30 * 86400000).toISOString() : null,
        `-${daysAgo} days`
      );

      const queries = Math.floor(Math.random() * 12);
      for (let q = 0; q < queries; q++) {
        insertQuery.run(
          randomUUID(),
          id,
          features[Math.floor(Math.random() * features.length)],
          Math.floor(Math.random() * 400) + 50,
          Math.floor(Math.random() * 300) + 20,
          `-${Math.floor(Math.random() * 14)} days`
        );
      }
    }
  });
  tx();
  console.log("Seeded demo app users and AI query history.");
}

seedAdmin();
seedDemoData();
