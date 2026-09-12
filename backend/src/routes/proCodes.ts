import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";

export const proCodesRouter = Router();

// Unambiguous alphabet (no 0/O/1/I) so codes are easy to read aloud or retype.
const generateCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

function formatCode(raw: string): string {
  return raw.match(/.{1,5}/g)?.join("-") ?? raw;
}

interface ProCodeRow {
  id: string;
  code: string;
  note: string | null;
  max_uses: number;
  uses: number;
  active: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

// SQLite has no boolean type — `active` comes back as 0/1. Convert it to a
// real JSON boolean so the Android client can deserialize it directly.
function serializeCode(row: ProCodeRow) {
  return { ...row, active: Boolean(row.active) };
}

proCodesRouter.get("/", (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  const where = activeOnly
    ? "WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) AND uses < max_uses"
    : "";

  const codes = db
    .prepare(
      `SELECT id, code, note, max_uses, uses, active, expires_at, created_by, created_at
       FROM pro_codes ${where}
       ORDER BY created_at DESC`
    )
    .all() as ProCodeRow[];

  res.json({ codes: codes.map(serializeCode) });
});

const createCodeSchema = z.object({
  note: z.string().max(200).optional(),
  maxUses: z.number().int().min(1).max(100000).default(1),
  expiresAt: z.string().datetime().nullable().optional(),
  customCode: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/)
    .optional(),
});

proCodesRouter.post("/", (req, res) => {
  const parsed = createCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid code payload", details: parsed.error.flatten() });
    return;
  }
  const { note, maxUses, expiresAt, customCode } = parsed.data;

  const code = (customCode ?? formatCode(generateCode())).toUpperCase();
  const id = randomUUID();

  try {
    db.prepare(
      `INSERT INTO pro_codes (id, code, note, max_uses, uses, active, expires_at, created_by)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?)`
    ).run(id, code, note ?? null, maxUses, expiresAt ?? null, req.admin?.sub ?? null);
  } catch (err: any) {
    if (String(err?.message).includes("UNIQUE")) {
      res.status(409).json({ error: "That code already exists" });
      return;
    }
    throw err;
  }

  const created = db.prepare("SELECT * FROM pro_codes WHERE id = ?").get(id) as ProCodeRow;
  res.status(201).json({ code: serializeCode(created) });
});

const updateCodeSchema = z.object({
  note: z.string().max(200).nullable().optional(),
  maxUses: z.number().int().min(1).max(100000).optional(),
  active: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

proCodesRouter.patch("/:id", (req, res) => {
  const parsed = updateCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update payload", details: parsed.error.flatten() });
    return;
  }

  const existing = db.prepare("SELECT id FROM pro_codes WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Code not found" });
    return;
  }

  const { note, maxUses, active, expiresAt } = parsed.data;
  db.prepare(
    `UPDATE pro_codes SET
       note = CASE WHEN ? THEN ? ELSE note END,
       max_uses = COALESCE(?, max_uses),
       active = COALESCE(?, active),
       expires_at = CASE WHEN ? THEN ? ELSE expires_at END
     WHERE id = ?`
  ).run(
    note !== undefined ? 1 : 0,
    note ?? null,
    maxUses ?? null,
    active === undefined ? null : active ? 1 : 0,
    expiresAt !== undefined ? 1 : 0,
    expiresAt ?? null,
    req.params.id
  );

  const updated = db.prepare("SELECT * FROM pro_codes WHERE id = ?").get(req.params.id) as ProCodeRow;
  res.json({ code: serializeCode(updated) });
});

proCodesRouter.delete("/:id", (req, res) => {
  const result = db.prepare("DELETE FROM pro_codes WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Code not found" });
    return;
  }
  res.status(204).send();
});
