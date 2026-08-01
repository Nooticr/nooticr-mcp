import { afterEach, describe, expect, it, vi } from "vitest";
import { OrchynClient, OrchynError } from "../src/orchyn.js";

const BASE = "http://localhost:8080";
const noToken = { getAccessToken: async () => "jwt-token" };

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrchynClient", () => {
  it("builds the startVideoAnalysis request with auth header and JSON body", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "pending" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OrchynClient(BASE, noToken);
    const job = await client.startVideoAnalysis("https://youtu.be/x");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/mcp/analyze-video`);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer jwt-token");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ url: "https://youtu.be/x" });
    expect(job).toMatchObject({ ok: true, jobId: "job-1" });
  });

  it("builds the getJob request with query param", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "thinking" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OrchynClient(BASE, noToken);
    await client.getJob("job-1");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/ai/analyze-post?jobId=job-1`);
  });

  it("normalizes 400 errors into OrchynError with message from {error}", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(400, { error: "Bad video URL" }));
    const client = new OrchynClient(BASE, noToken);

    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 400,
      message: "Bad video URL",
    });
  });

  it("detects 402 paywall errors with reason/used/max/cost", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce(402, {
        error: "Insufficient credits",
        paywall: true,
        reason: "no_credits",
        used: 5,
        max: 3,
        cost: 2,
      })
    );
    const client = new OrchynClient(BASE, noToken);

    try {
      await client.startVideoAnalysis("https://youtu.be/x");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OrchynError);
      const e = err as OrchynError;
      expect(e.status).toBe(402);
      expect(e.paywall).toEqual({ reason: "no_credits", used: 5, max: 3, cost: 2 });
      expect(e.message).toBe("Insufficient credits");
    }
  });

  it("normalizes non-JSON error responses", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("gateway timeout", { status: 502 }))
    );
    const client = new OrchynClient(BASE, noToken);

    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 502,
      message: "orchyn API error (502)",
    });
  });

  it("retries once after refresh when the API returns 401", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true, jobId: "job-2", state: "pending" }), {
        status: 200,
      });
    }));

    const onUnauthorized = vi.fn().mockResolvedValue(true);
    const client = new OrchynClient(BASE, {
      getAccessToken: vi
        .fn()
        .mockResolvedValueOnce("stale-token")
        .mockResolvedValueOnce("fresh-token"),
      onUnauthorized,
    });

    const job = await client.startVideoAnalysis("https://youtu.be/x");
    expect(job).toMatchObject({ ok: true, jobId: "job-2" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    const secondAuth = (fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].headers.authorization;
    expect(secondAuth).toBe("Bearer fresh-token");
  });

  it("does not retry when refresh fails", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(401, { error: "Unauthorized" }));
    const client = new OrchynClient(BASE, {
      getAccessToken: async () => "stale-token",
      onUnauthorized: async () => false,
    });

    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("strips trailing slashes from the base URL", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "pending" });
    vi.stubGlobal("fetch", fetchMock);
    const client = new OrchynClient("http://localhost:8080///", noToken);
    await client.startVideoAnalysis("https://youtu.be/x");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/mcp/analyze-video");
  });

  it("throws a 401 OrchynError when no token is available", async () => {
    const client = new OrchynClient(BASE, { getAccessToken: async () => undefined });
    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 401,
      message: "No orchyn access token available.",
    });
  });
});
