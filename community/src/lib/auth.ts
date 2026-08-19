import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
function getSecret(): Uint8Array {
  const secretStr = (
    process.env.JWT_SECRET ||
    (typeof import.meta !== "undefined" && (import.meta as any).env?.JWT_SECRET) ||
    "community-dev-secret-change-me"
  ).trim();
  return new TextEncoder().encode(secretStr);
}

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 10); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }
export async function signToken(payload: Record<string, any>) {
  return await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(getSecret());
}
export async function verifyToken(token: string) {
  try { const { payload } = await jwtVerify(token, getSecret()); return payload as any; } catch { return null; }
}
export function getUserFromCookie(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/community_session=([^;]+)/);
  return m ? m[1] : null;
}
