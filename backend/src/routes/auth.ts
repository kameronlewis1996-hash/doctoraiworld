import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { requireAdminAuth, signAdminToken } from "../auth";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }
  const { email, password } = parsed.data;

  const admin = db
    .prepare("SELECT id, email, password_hash FROM admins WHERE email = ?")
    .get(email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;

  // Same generic error whether the email doesn't exist or the password is wrong,
  // so login attempts can't be used to enumerate valid admin accounts.
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signAdminToken({ sub: admin.id, email: admin.email });
  res.json({ token, admin: { id: admin.id, email: admin.email } });
});

authRouter.get("/me", requireAdminAuth, (req, res) => {
  res.json({ admin: req.admin });
});
