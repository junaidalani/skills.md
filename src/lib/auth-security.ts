import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "agent-caller_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = { userId: string; tenantId: string; exp: number };

function sessionKey() {
  const source = process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!source) throw new Error("Set SESSION_SECRET before enabling account sessions.");
  return createHash("sha256").update(`agent-caller-session:${source}`).digest();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string) {
  const [scheme, saltText, hashText] = encoded.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashResetCode(email: string, code: string) {
  return createHmac("sha256", sessionKey()).update(`reset:${email.trim().toLowerCase()}:${code}`).digest("hex");
}

export function resetCodeMatches(email: string, code: string, encoded: string) {
  const expected = Buffer.from(hashResetCode(email, code), "hex");
  const actual = Buffer.from(encoded, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(userId: string, tenantId: string) {
  const payload: SessionPayload = {
    userId,
    tenantId,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readSessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const expected = createHmac("sha256", sessionKey()).update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || !payload.tenantId || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_SECONDS,
};
