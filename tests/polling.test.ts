import { describe, expect, it, vi } from "vitest";
import { OrchynClient, OrchynError } from "../src/orchyn.js";
import { JobTimeoutError, pollUntilDone, runVideoAnalysis, formatPaywallError } from "../src/video.js";

/** Fake job store: a synchronous in-memory map, wrapped in a fake OrchynClient. */
function fakeClient(jobs: Record<string, unknown>) {
  return {
    startVideoAnalysis: vi.fn().mockResolvedValue({
      ok: true,
      jobId: "job-1",
      state: "pending",
      platform: "youtube",
      provider: "orchyn",
    }),
    getJob: vi.fn().mockImplementation(async (jobId: string) => {
      if (!(jobId in jobs)) throw new OrchynError(404, "Job not found");
      return jobs[jobId];
    }),
  } as unknown as Pick<OrchynClient, "startVideoAnalysis" | "getJob">;
}

describe("pollUntilDone", () => {
  it("polls until the job reaches state=done", async () => {
    const client = fakeClient({
      "job-1": { ok: true, jobId: "job-1", state: "pending", progressChars: 100 },
    });
    let calls = 0;
    // Transition the store between polls.
    (client.getJob as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      if (calls === 0) return { ok: true, jobId: "job-1", state: "pending", progressChars: 100 };
      return {
        ok: true,
        jobId: "job-1",
        state: "done",
        progressChars: 4200,
        analysis: { summary: "Great video" },
        elapsedMs: 3400,
      };
    });
    const onPoll = vi.fn(() => { calls += 1; });
    const status = await pollUntilDone(client as OrchynClient, "job-1", {
      pollIntervalMs: 1,
      timeoutMs: 1000,
      onPoll,
    });
    expect(status.state).toBe("done");
    expect(status.analysis).toEqual({ summary: "Great video" });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("stops on state=error and returns the error", async () => {
    const client = fakeClient({});
    (client.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      jobId: "job-1",
      state: "error",
      error: "Video could not be downloaded",
      elapsedMs: 500,
    });
    const status = await pollUntilDone(client as OrchynClient, "job-1", { pollIntervalMs: 1 });
    expect(status.state).toBe("error");
    expect(status.error).toBe("Video could not be downloaded");
  });

  it("throws JobTimeoutError after the timeout", async () => {
    const client = fakeClient({});
    (client.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      jobId: "job-1",
      state: "thinking",
    });
    await expect(
      pollUntilDone(client as OrchynClient, "job-1", { pollIntervalMs: 1, timeoutMs: 50 })
    ).rejects.toBeInstanceOf(JobTimeoutError);
  });
});

describe("runVideoAnalysis", () => {
  it("starts the job then polls until done and returns job metadata + analysis", async () => {
    const client = fakeClient({});
    (client.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      jobId: "job-1",
      state: "done",
      platform: "youtube",
      provider: "orchyn",
      analysis: { summary: "Done" },
      elapsedMs: 1234,
    });

    const result = await runVideoAnalysis(client as OrchynClient, "https://youtu.be/x", {
      pollIntervalMs: 1,
    });

    expect(client.startVideoAnalysis).toHaveBeenCalledWith("https://youtu.be/x", undefined);
    expect(result).toMatchObject({
      ok: true,
      jobId: "job-1",
      state: "done",
      platform: "youtube",
      provider: "orchyn",
      analysis: { summary: "Done" },
    });
    expect(result.job).toMatchObject({ jobId: "job-1", platform: "youtube" });
  });

  it("passes appId through to the start call", async () => {
    const client = fakeClient({});
    (client.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      jobId: "job-1",
      state: "error",
      error: "x",
    });
    await runVideoAnalysis(client as OrchynClient, "https://youtu.be/x", { appId: 7, pollIntervalMs: 1 });
    expect(client.startVideoAnalysis).toHaveBeenCalledWith("https://youtu.be/x", 7);
  });

  it("surfaces 402 paywall errors from the start call", async () => {
    const client = fakeClient({});
    (client.startVideoAnalysis as ReturnType<typeof vi.fn>).mockRejectedValue(
      new OrchynError(402, "Insufficient credits", {
        paywall: { reason: "no_credits", used: 5, max: 3, cost: 2 },
      })
    );
    await expect(
      runVideoAnalysis(client as OrchynClient, "https://youtu.be/x")
    ).rejects.toMatchObject({ status: 402 });
  });
});

describe("formatPaywallError", () => {
  it("includes reason, usage, cost and dashboard pointer", () => {
    const err = new OrchynError(402, "Insufficient credits", {
      paywall: { reason: "no_credits", used: 5, max: 3, cost: 2 },
    });
    const text = formatPaywallError(err);
    expect(text).toContain("no_credits");
    expect(text).toContain("5/3");
    expect(text).toContain("cost: 2");
    expect(text).toContain("dashboard");
    expect(text).toContain("free grant");
  });
});
