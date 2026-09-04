import { afterEach, describe, expect, it, vi } from "vitest";
import { NooticrClient, NooticrError } from "../src/nooticr.js";

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

describe("NooticrClient", () => {
  it("builds the startVideoAnalysis request with auth header and JSON body", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "pending" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new NooticrClient(BASE, noToken);
    const job = await client.startVideoAnalysis("https://youtu.be/x");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/mcp/analyze-post`);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer jwt-token");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ url: "https://youtu.be/x" });
    expect(job).toMatchObject({ ok: true, jobId: "job-1" });
  });

  it("captures _inlineImages + post from the job response so tools can render the thumbnail", async () => {
    const post = {
      title: "A post",
      thumbnailUrl: "https://example.com/thumb.jpg",
      stats: { views: 393000 },
    };
    const fetchMock = mockFetchOnce(200, {
      ok: true,
      jobId: "job-1",
      state: "pending",
      post,
      _inlineImages: [{ data: "aGVsbG8=", mimeType: "image/jpeg" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new NooticrClient(BASE, noToken);
    const job = await client.startVideoAnalysis("https://youtu.be/x");

    expect(job.post).toEqual(post);
    expect(job.inlineImages).toEqual([{ data: "aGVsbG8=", mimeType: "image/jpeg" }]);
  });

  it("leaves inlineImages undefined when the server returns none", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "pending" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new NooticrClient(BASE, noToken);
    const job = await client.startVideoAnalysis("https://youtu.be/x");
    expect(job.inlineImages).toBeUndefined();
  });

  it("builds the getJob request with query param", async () => {
    const fetchMock = mockFetchOnce(200, { ok: true, jobId: "job-1", state: "thinking" });
    vi.stubGlobal("fetch", fetchMock);

    const client = new NooticrClient(BASE, noToken);
    await client.getJob("job-1");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/ai/analyze-post?jobId=job-1`);
  });

  it("normalizes 400 errors into NooticrError with message from {error}", async () => {
    vi.stubGlobal("fetch", mockFetchOnce(400, { error: "Bad video URL" }));
    const client = new NooticrClient(BASE, noToken);

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
    const client = new NooticrClient(BASE, noToken);

    try {
      await client.startVideoAnalysis("https://youtu.be/x");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NooticrError);
      const e = err as NooticrError;
      expect(e.status).toBe(402);
      expect(e.paywall).toEqual({ reason: "no_credits", used: 5, max: 3, cost: 2 });
      expect(e.message).toBe("Insufficient credits");
    }
  });

  it("normalizes non-JSON error responses", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("gateway timeout", { status: 502 }))
    );
    const client = new NooticrClient(BASE, noToken);

    // The message names the endpoint: these surface to the user as tool
    // errors, and a bare status code says nothing about which call failed.
    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 502,
      message: "nooticr API error (502) from /mcp/analyze-post",
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
    const client = new NooticrClient(BASE, {
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
    const client = new NooticrClient(BASE, {
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
    const client = new NooticrClient("http://localhost:8080///", noToken);
    await client.startVideoAnalysis("https://youtu.be/x");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8080/mcp/analyze-post");
  });

  it("throws a 401 NooticrError when no token is available", async () => {
    const client = new NooticrClient(BASE, { getAccessToken: async () => undefined });
    await expect(client.startVideoAnalysis("https://youtu.be/x")).rejects.toMatchObject({
      status: 401,
      message: "No nooticr access token available.",
    });
  });
});
