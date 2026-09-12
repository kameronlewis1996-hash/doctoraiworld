import { Router } from "express";
import { z } from "zod";
import { db } from "../db";

export const usersRouter = Router();

interface AppUserRow {
  id: string;
  email: string;
  display_name: string | null;
  is_pro: number;
  pro_expires_at: string | null;
  is_banned: number;
  created_at: string;
}

// SQLite has no boolean type — is_pro/is_banned come back as 0/1 integers.
// Convert them to real JSON booleans so the Android client can deserialize them directly.
function serializeUser(row: AppUserRow) {
  return {
    ...row,
    is_pro: Boolean(row.is_pro),
    is_banned: Boolean(row.is_banned),
  };
}

usersRouter.get("/", (req, res) => {
  const search = String(req.query.search ?? "").trim();
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize ?? "20"), 10) || 20, 1), 100);
  const offset = (page - 1) * pageSize;

  const where = search ? "WHERE email LIKE ? OR display_name LIKE ?" : "";
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM app_users ${where}`).get(...params) as { c: number }
  ).c;

  const rows = db
    .prepare(
      `SELECT id, email, display_name, is_pro, pro_expires_at, is_banned, created_at
       FROM app_users ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset) as AppUserRow[];

  res.json({ total, page, pageSize, users: rows.map(serializeUser) });
});

usersRouter.get("/:id", (req, res) => {
  const user = db
    .prepare(
      `SELECT id, email, display_name, is_pro, pro_expires_at, is_banned, created_at
       FROM app_users WHERE id = ?`
    )
    .get(req.params.id) as AppUserRow | undefined;

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const queryCount = (
    db
      .prepare("SELECT COUNT(*) AS c FROM ai_queries WHERE user_id = ?")
      .get(req.params.id) as { c: number }
  ).c;

  res.json({ user: serializeUser(user), queryCount });
});

const updateUserSchema = z.object({
  displayName: z.string().max(120).optional(),
  isPro: z.boolean().optional(),
  proExpiresAt: z.string().datetime().nullable().optional(),
  isBanned: z.boolean().optional(),
});

usersRouter.patch("/:id", (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update payload", details: parsed.error.flatten() });
    return;
  }

  const existing = db.prepare("SELECT id FROM app_users WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { displayName, isPro, proExpiresAt, isBanned } = parsed.data;
  db.prepare(
    `UPDATE app_users SET
       display_name = COALESCE(?, display_name),
       is_pro = COALESCE(?, is_pro),
       pro_expires_at = CASE WHEN ? THEN ? ELSE pro_expires_at END,
       is_banned = COALESCE(?, is_banned)
     WHERE id = ?`
  ).run(
    displayName ?? null,
    isPro === undefined ? null : isPro ? 1 : 0,
    proExpiresAt !== undefined ? 1 : 0,
    proExpiresAt ?? null,
    isBanned === undefined ? null : isBanned ? 1 : 0,
    req.params.id
  );

  const updated = db
    .prepare(
      `SELECT id, email, display_name, is_pro, pro_expires_at, is_banned, created_at
       FROM app_users WHERE id = ?`
    )
    .get(req.params.id) as AppUserRow;

  res.json({ user: serializeUser(updated) });
});
