/**
 * Pulling the links out of a creator's bio.
 *
 * The bio is a text field the person being evaluated controls, and the links
 * in it are handed to a host that will open them. So the tests here are mostly
 * about what must never make it into that list — an address inside a private
 * network, the cloud metadata endpoint — and about not silently losing the
 * links that are the whole point.
 */
import { describe, it, expect } from "vitest";
import { extractLinks, COLLAB_RUBRIC, vettingGuidance } from "../src/shared/collab.js";

const hosts = (bio: string, profile?: string) => extractLinks(bio, profile).map((l) => l.host);
const kinds = (bio: string) => extractLinks(bio).map((l) => l.kind);

describe("finding links in prose", () => {
  it("reads a bare domain with no scheme, which is how bios are written", () => {
    expect(hosts("building things · acme.dev · dm open")).toEqual(["acme.dev"]);
  });

  it("drops the full stop that ended the sentence rather than the URL", () => {
    expect(hosts("see github.com/dana/kit.")).toEqual(["github.com"]);
    expect(extractLinks("see github.com/dana/kit.")[0].url).toBe("https://github.com/dana/kit");
  });

  it("strips www so two spellings of one host are one link", () => {
    expect(hosts("www.acme.dev and https://acme.dev")).toEqual(["acme.dev"]);
  });

  it("keeps the profile URL passed alongside the bio", () => {
    expect(hosts("no links here", "https://www.tiktok.com/@dana")).toEqual(["tiktok.com"]);
  });

  it("returns nothing for a bio with nothing in it", () => {
    expect(extractLinks("just vibes 🌊")).toEqual([]);
    expect(extractLinks("")).toEqual([]);
  });
});

describe("what must never be handed to something that fetches", () => {
  // None of these belong in a public bio, and every reason one would be there
  // is a reason not to open it. Dropped rather than labelled: a warning on a
  // link is only as good as the model that reads it.
  it("drops the cloud metadata address", () => {
    expect(hosts("http://169.254.169.254/latest/meta-data/")).toEqual([]);
  });

  it("drops loopback and private ranges", () => {
    for (const url of [
      "http://127.0.0.1:8080/admin",
      "http://localhost/health",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.4.2/",
      "http://0.0.0.0/",
    ]) {
      expect(hosts(url), url).toEqual([]);
    }
  });

  it("drops an internal name wearing a trailing dot", () => {
    // `new URL()` normalises an IPv4 literal but leaves a symbolic hostname's
    // root-label dot alone, so these arrived as "localhost." — matching none of
    // the suffix checks and falling through to the public catch-all. Most
    // resolvers treat a trailing-dot FQDN as the bare name, so this was a live
    // loopback request handed to the host as a site worth reading.
    for (const url of [
      "http://localhost./admin",
      "http://internal.local./secret",
      "http://vault.internal./x",
      "http://printer.local../y",
    ]) {
      expect(hosts(url), url).toEqual([]);
    }
  });

  it("drops the carrier-grade NAT range, which overlay networks hand out", () => {
    for (const url of ["http://100.64.0.1/", "http://100.100.0.5/x", "http://100.127.255.254/"]) {
      expect(hosts(url), url).toEqual([]);
    }
    // 100.63 and 100.128 are outside the /10 and stay public.
    expect(hosts("http://100.63.0.1/")).toEqual(["100.63.0.1"]);
    expect(hosts("http://100.128.0.1/")).toEqual(["100.128.0.1"]);
  });

  it("drops internal-only names", () => {
    for (const url of ["http://printer.local/", "http://vault.internal/", "http://intranet/"]) {
      expect(hosts(url), url).toEqual([]);
    }
  });

  it("drops IPv6 literals rather than trying to classify them", () => {
    expect(hosts("http://[::1]/")).toEqual([]);
  });

  it("still keeps an ordinary public address", () => {
    expect(hosts("http://93.184.216.34/portfolio")).toEqual(["93.184.216.34"]);
  });

  it("drops a non-web scheme", () => {
    expect(hosts("mailto:dana@example.com")).toEqual([]);
    expect(hosts("javascript:alert(1)")).toEqual([]);
  });
});

describe("saying what a link is before it is opened", () => {
  it("recognises code hosts, because that is what a host can actually read", () => {
    expect(kinds("github.com/dana/kit")).toEqual(["code"]);
    expect(extractLinks("github.com/dana/kit")[0].readable).toMatch(/read the code/i);
  });

  it("marks a shortener opaque, since the destination is unknowable and mutable", () => {
    const [link] = extractLinks("bit.ly/3xYz");
    expect(link.kind).toBe("shortener");
    expect(link.opaque).toBe(true);
    expect(link.readable).toMatch(/change the destination/i);
  });

  it("marks everything else as not opaque", () => {
    expect(extractLinks("github.com/dana").every((l) => l.opaque === false)).toBe(true);
  });

  it("calls an unknown host their own site rather than guessing", () => {
    expect(kinds("dana-makes-things.xyz")).toEqual(["website"]);
  });

  it("orders by what a single fetch buys, code first and another profile last", () => {
    const order = kinds(
      "linktr.ee/dana instagram.com/dana github.com/dana dana.dev youtube.com/@dana",
    );
    expect(order[0]).toBe("code");
    expect(order[1]).toBe("website");
    expect(order[order.length - 1]).toBe("social");
  });

  it("does not return the same URL twice", () => {
    expect(hosts("github.com/dana github.com/dana")).toEqual(["github.com"]);
  });

  it("matches a subdomain of a known host without matching a lookalike", () => {
    expect(kinds("gist.github.com/dana/1")).toEqual(["code"]);
    // notgithub.com is a different registrable domain and must not be "code".
    expect(kinds("notgithub.com/dana")).toEqual(["website"]);
  });
});

describe("the rubric the score is reached against", () => {
  it("puts fit above reach, so a follower count cannot carry a candidate", () => {
    const order = COLLAB_RUBRIC.map((r) => r.dimension);
    expect(order.indexOf("fit")).toBeLessThan(order.indexOf("reach"));
    expect(order[order.length - 1]).toBe("reach");
  });

  it("asks the caller to separate what it verified from what it inferred", () => {
    const evidence = COLLAB_RUBRIC.find((r) => r.dimension === "evidence");
    expect(evidence?.asks).toMatch(/verif/i);
  });

  it("does not let engagement be assumed either way", () => {
    // The shortlist carries follower counts and no engagement numbers, so the
    // rubric has to say the signal is missing rather than invite a guess.
    const engagement = COLLAB_RUBRIC.find((r) => r.dimension === "engagement");
    expect(engagement?.asks).toMatch(/does not carry the numbers|say so/i);
  });
});

describe("the guidance the caller actually reads", () => {
  const text = vettingGuidance(6, 4);

  it("counts what it found", () => {
    expect(text).toContain("6 candidates");
    expect(text).toContain("4 of them");
  });

  it("frames a bio link as a claim, not as a confirmed fact", () => {
    expect(text).toMatch(/written for whoever is assessing them/i);
    expect(text).toMatch(/as a claim, not as a fact/i);
  });

  it("warns about opening a shortener", () => {
    expect(text).toMatch(/opaque/);
  });

  it("names the signal it cannot settle rather than implying the score covers it", () => {
    expect(text).toMatch(/unmeasured/i);
    expect(text).toMatch(/nine\s+credits/i);
  });

  it("names the tool that draws the result", () => {
    expect(text).toContain("show_collab_shortlist");
  });
});
