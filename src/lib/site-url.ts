const FALLBACK_SITE_URL = "https://agent-caller.example";

/**
 * Resolves the public app URL from APP_URL, tolerating values that are missing
 * their scheme (for example "example.vercel.app" instead of "https://example.vercel.app").
 * Returns a fallback so a bad environment value can never crash module evaluation.
 */
export function getSiteUrl(): string {
  const raw = (process.env.APP_URL || "").trim();
  if (!raw) return FALLBACK_SITE_URL;
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}
