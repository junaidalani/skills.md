import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL || "https://agent-caller.example";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/api", "/login", "/signup"] }, sitemap: `${base}/sitemap.xml` };
}
