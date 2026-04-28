import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "./db";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "career-hunter-dev-secret-change-in-production";
const TOKEN_EXPIRY = "7d";

export interface User {
  id: string;
  name: string;
  email: string;
  background: string;
  target_role: string;
  target_company: string;
  experience: string;
  skills: string;
  resume_text: string;
  created_at: string;
  updated_at: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export function createUser(name: string, email: string, passwordHash: string): User {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)`
  ).run(id, name, email, passwordHash);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User;
}

export function getUserByEmail(email: string): (User & { password_hash: string }) | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as (User & { password_hash: string }) | undefined;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.prepare("SELECT id, name, email, background, target_role, target_company, experience, skills, resume_text, created_at, updated_at FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserFromRequest(request: Request): User | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const token = cookieHeader.split(";").find(c => c.trim().startsWith("token="))?.split("=")[1];
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  return getUserById(payload.userId) || null;
}
