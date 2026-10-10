/**
 * The guard itself, tested.
 *
 * Everything else in this directory benefits from `guarded-test.ts` silently.
 * This is the one spec that asserts it is actually there — because the failure
 * it prevents is invisible locally: the request succeeds either way, and the
 * only difference is whether it left the machine and hit production (#66).
 */
import { test, expect } from "./guarded-test.js";

test("a request to a production host is served here, not by production", async ({ page }) => {
  await page.setContent("<html><body>guard</body></html>");

  // The exact URL that produced 3,088 real 404s against mcp.nooticr.com.
  const video = await page.evaluate(async () => {
    const res = await fetch("https://mcp.nooticr.com/media/x.mp4");
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  });
  // Production answers 404 for this path and always has. The guard answers
  // 200 with an empty body, which is what tells us it never went out.
  expect(video.status).toBe(200);
  expect(video.type).toContain("video/mp4");
  expect(video.body).toBe("");

  const thumb = await page.evaluate(async () => {
    const res = await fetch("https://mcp.nooticr.com/media/t.jpg");
    return { status: res.status, type: res.headers.get("content-type") };
  });
  expect(thumb.status).toBe(200);
  expect(thumb.type).toContain("image/gif");
});

test("every nooticr host is covered, not just the one that leaked", async ({ page }) => {
  await page.setContent("<html><body>guard</body></html>");
  for (const url of [
    "https://api.nooticr.com/health",
    "https://api.nooticr.com/telemetry/event",
    "https://nooticr.com/",
    "https://www.nooticr.com/",
  ]) {
    const status = await page.evaluate(
      async (u) => (await fetch(u)).status,
      url,
    );
    // 404 from the guard rather than whatever production would have said.
    // `/health` is the one that matters most: the issue notes its ~2,000/hour
    // is indistinguishable from an attack and is the signal any future
    // alerting would key on.
    expect(status, `${url} must be answered locally`).toBe(404);
  }
});

test("a non-production host is left completely alone", async ({ page }) => {
  // The guard must not become a blanket network block: the specs that boot a
  // local fixture server depend on reaching it.
  await page.setContent("<html><body>guard</body></html>");
  const reached = await page.evaluate(async () => {
    try {
      await fetch("http://127.0.0.1:1/nothing-here");
      return "resolved";
    } catch {
      // A real connection refusal, which is what should happen — as opposed to
      // the guard fulfilling it with a 404 and hiding the fact.
      return "refused";
    }
  });
  expect(reached).toBe("refused");
});
