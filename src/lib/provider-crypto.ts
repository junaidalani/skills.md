import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey() {
  const source = process.env.MASTER_ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!source) throw new Error("Set MASTER_ENCRYPTION_KEY to encrypt provider credentials.");
  return createHash("sha256").update(`agent-caller-provider-credentials:v1:${source}`).digest();
}

export function encryptProviderSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptProviderSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) {
    throw new Error("Stored provider credential has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function lastFour(value: string) {
  return value.slice(-4);
}
