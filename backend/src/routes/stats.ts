import { Router } from "express";
import { db } from "../db";

export const statsRouter = Router();

function getSetting(key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

statsRouter.get("/overview", (_req, res) => {
  const totalUsers = (db.prepare("SELECT COUNT(*) AS c FROM app_users").get() as { c: number }).c;
  const proUsers = (
    db.prepare("SELECT COUNT(*) AS c FROM app_users WHERE is_pro = 1").get() as { c: number }
  ).c;
  const newUsersLast7Days = (
    db
      .prepare("SELECT COUNT(*) AS c FROM app_users WHERE created_at >= datetime('now', '-7 days')")
      .get() as { c: number }
  ).c;
  const totalQueries = (
    db.prepare("SELECT COUNT(*) AS c FROM ai_queries").get() as { c: number }
  ).c;
  const queriesLast7Days = (
    db
      .prepare("SELECT COUNT(*) AS c FROM ai_queries WHERE created_at >= datetime('now', '-7 days')")
      .get() as { c: number }
  ).c;
  const activeCodes = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM pro_codes WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now')) AND uses < max_uses"
      )
      .get() as { c: number }
  ).c;
  const bannedUsers = (
    db.prepare("SELECT COUNT(*) AS c FROM app_users WHERE is_banned = 1").get() as { c: number }
  ).c;

  const proPrice = parseFloat(getSetting("pro_price_usd", "0")) || 0;

  res.json({
    totalUsers,
    proUsers,
    newUsersLast7Days,
    totalQueries,
    queriesLast7Days,
    activeCodes,
    bannedUsers,
    estimatedMonthlyRevenueUsd: Math.round(proUsers * proPrice * 100) / 100,
  });
});

statsRouter.get("/timeseries", (req, res) => {
  const metric = req.query.metric === "new_users" ? "new_users" : "ai_queries";
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "14"), 10) || 14, 1), 90);

  const table = metric === "new_users" ? "app_users" : "ai_queries";

  const rows = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS count
       FROM ${table}
       WHERE created_at >= datetime('now', ?)
       GROUP BY day
       ORDER BY day ASC`
    )
    .all(`-${days} days`) as { day: string; count: number }[];

  res.json({ metric, days, points: rows });
});
