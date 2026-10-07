import { describe, it, expect, beforeAll } from "vitest";
import { faker } from "@faker-js/faker";

beforeAll(() => {
  const n = Number.parseInt(process.env.FAKER_SEED ?? "42", 10);
  faker.seed(Number.isFinite(n) ? n : 42);
});

describe("@faker-js/faker", () => {
  it("re-seeding reproduces the same values", () => {
    faker.seed(77);
    const a = faker.internet.email({ provider: "example.com" });
    faker.seed(77);
    const b = faker.internet.email({ provider: "example.com" });
    expect(b).toBe(a);
  });
});
