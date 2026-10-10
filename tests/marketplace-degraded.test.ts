import { describe, expect, it } from "vitest";
import { categoryGuidance } from "../src/shared/amazon.js";

const base = {
  label: "running shoes",
  products: 0,
  reviews: 0,
  ratingsRepresented: 0,
  brands: [],
  complete: true,
  scanId: "scan_1",
  pending: 0,
  site: "Otto",
  statusTool: "marketplace_scan_status",
  insightsTool: null,
};

describe("a degraded scan is reported as an outage, not an empty search", () => {
  const notice = "Otto blocked our collector; results are unavailable right now.";

  it("relays the notice and drops the 'search matched nothing' line", () => {
    const g = categoryGuidance({ ...base, status: "degraded", notice });
    expect(g).toContain(notice);
    expect(g).toContain("Do not retry");
    expect(g).not.toContain("matched nothing");
  });

  it("still says matched nothing for an ordinary empty scan", () => {
    const g = categoryGuidance({ ...base, status: "ok" });
    expect(g).toContain("matched nothing");
    expect(g).not.toContain("DEGRADED");
  });

  it("caveats partial data when the site collector is degraded", () => {
    const g = categoryGuidance({ ...base, products: 3, status: "ok", siteStatus: "degraded" });
    expect(g).toContain("currently degraded");
  });

  it("is unchanged without the new fields", () => {
    const g = categoryGuidance({ ...base, products: 3 });
    expect(g).not.toContain("Caveat");
    expect(g).not.toContain("DEGRADED");
  });
});
