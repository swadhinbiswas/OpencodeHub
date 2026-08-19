import { SignJWT, jwtVerify } from "jose";
import * as bcrypt from "bcryptjs";
const secret = new TextEncoder().encode(process.env.JWT_SECRET || "community-dev-secret-change-me");
export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }
export async function signToken(payload: Record<string, any>) {
  return await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secret);
}
export async function verifyToken(token: string) {
  try { const { payload } = await jwtVerify(token, secret); return payload as any; } catch { return null; }
}
export function getUserFromCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/community_session=([^;]+)/);
  return m ? m[1] : null;
}
