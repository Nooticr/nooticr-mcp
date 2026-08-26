/**
 * URL validation + the analyze_video workflow: start the job, then poll until
 * the analysis is done (or fails).
 */

import { OrchynClient, JobStatus, VideoJob, OrchynError } from "./orchyn.js";

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 300_000;

const SUPPORTED_HOSTS_VIDEO = new Set([
  "tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "instagr.am",
  "youtube.com",
  "youtu.be",
  "m.youtube.com",
  "youtube-nocookie.com",
  "m.tiktok.com",
]);

const SUPPORTED_HOSTS_POST = new Set([
  ...SUPPORTED_HOSTS_VIDEO,
  "x.com",
  "twitter.com",
  "mobile.twitter.com",
]);

function validateUrl(rawUrl: string, allowed: Set<string>): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return { ok: false, error: "url must be a non-empty string." };
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: "url is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "url must use http or https." };
  }
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (host === "youtube.com" || host === "youtu.be") {
    // accept all youtube.com paths, incl. /shorts/<id>
    return { ok: true, url: parsed.toString() };
  }
  if (allowed.has(host)) {
    return { ok: true, url: parsed.toString() };
  }
  return {
    ok: false,
    error:
      "url host is not supported. Supported: tiktok.com, vm.tiktok.com, instagram.com, instagr.am, youtube.com, youtu.be, m.youtube.com (and /shorts).",
  };
}

export function validateVideoUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  return validateUrl(rawUrl, SUPPORTED_HOSTS_VIDEO);
}

export function validatePostUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  return validateUrl(rawUrl, SUPPORTED_HOSTS_POST);
}

export class JobTimeoutError extends Error {
  constructor(jobId: string, elapsedMs: number, lastStatus?: JobStatus) {
    super(
      `Timed out after ${Math.round(elapsedMs / 1000)}s waiting for analysis job ${jobId} to finish.` +
        (lastStatus?.contentPreview ? ` Partial content: ${lastStatus.contentPreview}` : "")
    );
    this.name = "JobTimeoutError";
  }
}

export interface PollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  onPoll?: (status: JobStatus) => void;
}

/**
 * Polls a job until state is "done" or "error".
 */
export async function pollUntilDone(
  client: OrchynClient,
  jobId: string,
  opts: PollOptions = {}
): Promise<JobStatus> {
  const pollIntervalMs = opts.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? POLL_TIMEOUT_MS;
  const startedAt = Date.now();
  let last: JobStatus | undefined;

  for (;;) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      throw new JobTimeoutError(jobId, elapsedMs, last);
    }
    const status = await client.getJob(jobId);
    last = status;
    opts.onPoll?.(status);
    if (status.state === "done") return status;
    if (status.state === "error") return status;
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

export interface AnalysisResult {
  ok: boolean;
  jobId: string;
  state: string;
  platform?: string;
  provider?: string;
  analysis?: unknown;
  contentPreview?: string;
  error?: string;
  elapsedMs?: number;
  job?: VideoJob;
}

/**
 * Full tool workflow: start the analysis, poll until done, return a
 * JSON-serializable result. Throws OrchynError on API-level failures
 * (e.g. 402 paywall).
 */
export async function runVideoAnalysis(
  client: OrchynClient,
  url: string,
  opts: { appId?: number } & PollOptions = {}
): Promise<AnalysisResult> {
  const job = await client.startVideoAnalysis(url, opts.appId);
  const status = await pollUntilDone(client, job.jobId, opts);
  const result: AnalysisResult = {
    ok: status.state === "done",
    jobId: status.jobId,
    state: status.state,
    platform: job.platform,
    provider: status.provider ?? job.provider,
    analysis: status.analysis,
    contentPreview: status.contentPreview,
    error: status.error,
    elapsedMs: status.elapsedMs,
  };
  if (result.ok) {
    result.job = {
      ok: job.ok,
      jobId: job.jobId,
      state: job.state,
      platform: job.platform,
      provider: job.provider,
      appId: job.appId,
      workspaceId: job.workspaceId,
      cost: job.cost,
      freeGrant: job.freeGrant,
      post: job.post,
    };
  }
  return result;
}

export function formatPaywallError(err: OrchynError): string {
  const p = err.paywall;
  const parts: string[] = [];
  if (p?.reason) parts.push(`reason: ${p.reason}`);
  if (p?.used !== undefined && p?.max !== undefined) {
    parts.push(`credits used: ${p.used}/${p.max}`);
  } else if (p?.used !== undefined) {
    parts.push(`credits used: ${p.used}`);
  }
  if (p?.cost !== undefined) parts.push(`cost: ${p.cost}`);
  const detail = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return (
    `Your orchyn account has no credits left for this analysis${detail}. ` +
    `Top up or check your usage in the orchyn dashboard, then try again. ` +
    `Note: the first analysis is covered by the free grant.`
  );
}
