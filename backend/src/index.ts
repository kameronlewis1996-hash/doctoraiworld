import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import "./db";
import { requireAdminAuth } from "./auth";
import { authRouter } from "./routes/auth";
import { proCodesRouter } from "./routes/proCodes";
import { settingsRouter } from "./routes/settings";
import { statsRouter } from "./routes/stats";
import { usersRouter } from "./routes/users";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);

// Every route below requires a valid admin session token.
app.use("/api/stats", requireAdminAuth, statsRouter);
app.use("/api/users", requireAdminAuth, usersRouter);
app.use("/api/pro-codes", requireAdminAuth, proCodesRouter);
app.use("/api/settings", requireAdminAuth, settingsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`doctoraiworld admin API listening on port ${port}`);
});
