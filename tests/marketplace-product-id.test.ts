import { describe, expect, it } from "vitest";
import { normaliseProducts } from "../src/shared/amazon.js";

/**
 * Every collector's own name for a product id, taken from each crate's
 * `Product` struct rather than from memory. Each publishes exactly one of
 * these, which is why a key missing from the resolver takes a whole site down
 * rather than degrading it.
 */
const ID_FIELD_PER_SITE: Array<[string, string, string]> = [
 ["amazon", "asin", "B0CHX1W1XY"],
 ["cdiscount", "sku", "mp1234567890"],
 ["flipkart", "pid", "SHOHGXZ4CNHPKMSK"],
 ["temu", "goods_id", "601099512345678"],
 ["lazada", "item_id", "2938471029"],
 ["otto", "product_id", "C1857374293"],
 ["rakuten", "product_id", "book:20812345"],
 ["trendyol", "product_id", "123456789"],
 ["jumia", "product_id", "GE778EL1A2B3C"],
 ["aliexpress", "id", "1005006255429323"],
 ["mercadolibre", "id", "MLA1234567890"],
];

describe("a product is addressed by whatever its own site calls its id", () => {
 /**
  * Flipkart's `pid` and Temu's `goods_id` were not in the resolver at all, so
  * every product in a scan of either site came back with `asin: ""`. That is
  * not a cosmetic gap: the view keys its tiles, the review drill-down and the
  * `perProduct` join on this field, so one blank key shared by every product
  * means no tile can open its reviews and the reviews themselves collide at
  * "review::0".
  */
 it.each(ID_FIELD_PER_SITE)("%s addresses its products by %s", (_site, field, value) => {
  const [product] = normaliseProducts([{ [field]: value, title: "a product" }]);
  expect(product.asin).toBe(value);
 });

 /**
  * The reason the two could go missing unnoticed for as long as they did.
  * `??` falls through null and undefined but not "", so a chain of them stops
  * on an empty id rather than continuing past it — and an empty id is exactly
  * what a site that publishes the field but could not fill it sends.
  */
 it("walks past an id key that is present but empty", () => {
  const [product] = normaliseProducts([
   { asin: "", sku: "   ", pid: "SHOHGXZ4CNHPKMSK", title: "a product" },
  ]);
  expect(product.asin).toBe("SHOHGXZ4CNHPKMSK");
 });

 /**
  * A product with no id at all still has to normalise rather than throw: the
  * scan that returns one is the one being debugged.
  */
 it("leaves a product with no id under any name blank rather than failing", () => {
  const [product] = normaliseProducts([{ title: "a product" }]);
  expect(product.asin).toBe("");
 });

 /**
  * Reviews are addressed by the resolved id, which is the whole reason it is
  * resolved once at the top. Before Flipkart's `pid` was in the list, every
  * review on every Flipkart product was "review::0", "review::1" — colliding
  * across products, so a model citing one could not be pointed back at the
  * listing it came from.
  */
 it("addresses a product's reviews by the same id it resolved", () => {
  const [product] = normaliseProducts([
   {
    pid: "SHOHGXZ4CNHPKMSK",
    title: "a product",
    reviews: [{ body: "first" }, { body: "second" }],
   },
  ]);
  const reviews = product.reviews as Array<Record<string, unknown>>;
  expect(reviews.map((r) => r.id)).toEqual([
   "review:SHOHGXZ4CNHPKMSK:0",
   "review:SHOHGXZ4CNHPKMSK:1",
  ]);
 });
});
