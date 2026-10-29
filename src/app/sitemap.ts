import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const paths = ["", "/pricing", "/demo", "/how-it-works", "/security", "/blog", "/industries/hvac", "/industries/plumbing", "/industries/roofing", "/industries/dental", "/industries/law", "/industries/auto-repair", "/industries/property-management", "/legal/terms", "/legal/privacy", "/legal/ai-disclosure"];
  return paths.map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "weekly" : "monthly", priority: path === "" ? 1 : 0.6 }));
}
