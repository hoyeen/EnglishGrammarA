import { expect, it } from "vitest";
import { TtlCache } from "@/domain/ttlCache";

it("expires entries and evicts the least recently used without extending TTL", () => {
  let now = 0;
  const cache = new TtlCache<number>(2, () => now);
  cache.set("a", 1, 10);
  cache.set("b", 2, 20);
  expect(cache.get("a")).toBe(1);
  cache.set("c", 3, 20);
  expect(cache.get("b")).toBeUndefined();
  now = 10;
  expect(cache.get("a")).toBeUndefined();
  expect(cache.get("c")).toBe(3);
  cache.delete("c");
  expect(cache.get("c")).toBeUndefined();
});
