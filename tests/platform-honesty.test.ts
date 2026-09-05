/**
 * The surface must not answer a question about one network with another's data.
 *
 * From a real session: someone asked what a competitor was doing on X. The tool
 * searched TikTok — the silent default — found nothing, offered to guess a
 * different TikTok handle, and gave up. Three separate faults, each invisible on
 * its own: the default is never announced, the result never names the network it
 * searched, and an empty result carries no next step, so the only move left is
 * to apologise.
 *
 * None of that is catchable by a schema check, which is why it shipped. These
 * tests pin the three properties that stop it recurring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleMissGuidance, PLATFORM_ARG, NAME_SEARCHABLE } from "../src/shared/evidence.js";

const root = resolve(__dirname, "..");
const src = (p: string) => readFileSync(resolve(root, "src/shared", p), "utf8");

describe("the platform argument warns instead of reassuring", () => {
  it("tells the model to set it when a network was named", () => {
    expect(PLATFORM_ARG).toMatch(/SET IT/);
    expect(PLATFORM_ARG.toLowerCase()).toContain("named a network");
  });

  it("names the consequence, not just the default", () => {
    // "default tiktok" reads as a convenience. The point is that the wrong
    // answer is indistinguishable from an absent account.
    expect(PLATFORM_ARG.toLowerCase()).toMatch(/silently|looks like/);
  });

  it("lists the networks that can actually be fetched", () => {
    for (const p of ["twitter", "linkedin", "reddit", "youtube", "instagram"]) {
      expect(PLATFORM_ARG).toContain(p);
    }
  });

  it("is what every silently-defaulting tool actually uses", () => {
    // A tool that keeps the old "Platform (default tiktok)." string is one the
    // model will keep getting wrong — the whole point is that they share this.
    for (const file of ["jobs.ts", "watchlist.ts"]) {
      expect(src(file), `${file} still has an unwarned platform default`).not.toContain(
        'describe("Platform (default tiktok).")',
      );
    }
  });
});

describe("an empty lookup returns a next step, not a shrug", () => {
  it("names the network it searched", () => {
    const g = handleMissGuidance({ handle: "stalkr", platform: "twitter", defaulted: false });
    expect(g).toContain("@stalkr");
    expect(g).toContain("twitter");
  });

  it("flags a defaulted platform as the likely cause", () => {
    const g = handleMissGuidance({ handle: "stalkr", platform: "tiktok", defaulted: true });
    expect(g).toMatch(/was the default|not asked for/);
    // And says what to do about it rather than leaving the model to infer.
    expect(g).toContain("platform");
  });

  it("does not blame the account when the platform was defaulted", () => {
    const g = handleMissGuidance({ handle: "stalkr", platform: "tiktok", defaulted: true });
    expect(g).not.toMatch(/does not exist there/);
  });

  it("offers keyword search only where one exists", () => {
    for (const p of NAME_SEARCHABLE) {
      const g = handleMissGuidance({ handle: "x", platform: p, defaulted: false });
      expect(g, `${p} is name-searchable`).toContain("search_creators");
    }
  });

  it("asks for the handle where no keyword search exists", () => {
    for (const p of ["twitter", "linkedin", "reddit"]) {
      const g = handleMissGuidance({ handle: "stalkr", platform: p, defaulted: false });
      expect(g, `${p} has no keyword index`).not.toContain("search_creators");
      expect(g).toMatch(/web search|profile URL/);
    }
  });

  it("forbids substituting a network the user did not ask about", () => {
    // This is the actual behaviour from the reported session — wandering to
    // TikTok because TikTok is the only thing searchable by name.
    const g = handleMissGuidance({ handle: "stalkr", platform: "twitter", defaulted: false });
    expect(g).toMatch(/Do NOT quietly switch/);
  });

  it("refuses to let an empty result be reported as inactivity", () => {
    const g = handleMissGuidance({ handle: "stalkr", platform: "twitter", defaulted: false });
    expect(g).toMatch(/not present an empty result as evidence/i);
  });
});

describe("track_competitor wires both halves in", () => {
  const jobs = src("jobs.ts");

  it("returns the miss guidance instead of scoring an empty feed", () => {
    // Falling through produced a baseline-less report about zero posts, which
    // reads as "this competitor has been quiet" — a claim with no evidence.
    expect(jobs).toMatch(/feed\.length === 0/);
    expect(jobs).toContain("handleMissGuidance({ handle, platform, defaulted: platformDefaulted })");
  });

  it("records whether the platform was chosen or fallen back to", () => {
    expect(jobs).toMatch(/const platformDefaulted = !args\.platform/);
    expect(jobs).toMatch(/platformDefaulted,/);
  });

  it("names the network in the guidance a successful call returns", () => {
    // Structured content already carried `platform`; the prose the model
    // actually reads did not, so a wrong-network answer read as a right one.
    expect(jobs).toMatch(/by @\$\{a\.handle\} on \$\{a\.platform\}/);
  });
});
