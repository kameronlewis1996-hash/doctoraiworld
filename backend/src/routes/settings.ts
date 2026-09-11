import { Router } from "express";
import { z } from "zod";
import { db } from "../db";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  const rows = db.prepare("SELECT key, value FROM app_settings").all() as {
    key: string;
    value: string;
  }[];
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({ settings });
});

const updateSettingsSchema = z.record(z.string(), z.string());

settingsRouter.patch("/", (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Settings payload must be a string-keyed object of strings" });
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );

  const tx = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) upsert.run(key, value);
  });
  tx(Object.entries(parsed.data));

  const rows = db.prepare("SELECT key, value FROM app_settings").all() as {
    key: string;
    value: string;
  }[];
  res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});
