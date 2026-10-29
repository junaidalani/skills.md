import { expect, test } from "@playwright/test";

/**
 * Public-page smoke test for the Agent Caller marketing site.
 *
 * Local:       npm run smoke
 * Live deploy: BASE_URL=https://agent-caller-rho.vercel.app npm run smoke
 */

const PAGES: Array<{ path: string; marker: RegExp; alt?: RegExp[] }> = [
  { path: "/", marker: /Good work shouldn’t have to/i, alt: [/Start your 14-day trial/i] },
  { path: "/demo", marker: /Hear the first/i, alt: [/sample call/i] },
  { path: "/pricing", marker: /What counts as a minute/i, alt: [/No card needed to start/i] },
  { path: "/how-it-works", marker: /Every call gets a/i, alt: [/Under the hood/i] },
  { path: "/security", marker: /AI disclosure/i, alt: [/Security by design/i] },
  { path: "/login", marker: /Log in/i },
  { path: "/signup", marker: /14-day trial/i },
  { path: "/industries/hvac", marker: /HVAC/i },
  { path: "/industries/plumbing", marker: /Plumbing/i },
  { path: "/legal/terms", marker: /Terms of service/i },
  { path: "/legal/privacy", marker: /Privacy policy/i },
];

test.describe("public site smoke", () => {
  for (const page of PAGES) {
    test(`GET ${page.path} renders the expected content`, async ({ request }) => {
      const response = await request.get(page.path);
      expect(response.status(), `${page.path} should return 200`).toBe(200);
      const markers = [page.marker, ...(page.alt ?? [])];
      const body = await response.text();
      for (const marker of markers) {
        expect(body).toMatch(marker);
      }
    });
  }

  test("demo intro video is served with range support", async ({ request }) => {
    const response = await request.get("/media/voice-agent-intro.mp4", { headers: { Range: "bytes=0-1023" } });
    expect([200, 206]).toContain(response.status());
    expect(response.headers()["content-length"]).toBeTruthy();
  });

  test("demo ad video is served", async ({ request }) => {
    const response = await request.head("/media/voice-agent-demo.mp4");
    expect(response.status()).toBe(200);
  });

  test("homepage demo video player is wired with sound controls", async ({ page }) => {
    await page.goto("/");
    // The scroll-driven hero video exists and points at the intro clip.
    await expect(page.locator('video[src*="voice-agent-intro.mp4"]').first()).toHaveCount(1);
    // The later ad section carries the demo clip.
    await expect(page.locator('video[src*="voice-agent-demo.mp4"]').first()).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Play original sound|Sound on/i })).toHaveCount(1);
  });

  test("/demo links to the sample recording and does not ship developer notes", async ({ page }) => {
    await page.goto("/demo");
    const body = await page.content();
    expect(body).not.toMatch(/public\/media/);
    expect(body).not.toMatch(/Drop your finished video/i);
    await expect(page.locator("#demo-recording")).toHaveCount(1);
  });

  test("footer wordmark sr-only text and top link render", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Back to top/i })).toHaveCount(1);
  });
});
