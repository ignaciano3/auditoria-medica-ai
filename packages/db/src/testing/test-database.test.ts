import { describe, expect, test } from "bun:test";
import { resolveTestDatabaseUrl } from "./test-database.ts";

const dev = "postgres://audit:audit@localhost:5432/audit";
const test_ = "postgres://audit:audit@localhost:5432/audit_test";

describe("resolveTestDatabaseUrl", () => {
  test("returns undefined when unset", () => {
    expect(resolveTestDatabaseUrl({})).toBeUndefined();
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "  " })).toBeUndefined();
  });

  test("returns the url when it points at a _test database", () => {
    expect(
      resolveTestDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: test_ }),
    ).toBe(test_);
  });

  test("rejects a database that does not end in _test", () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL: dev, TEST_DATABASE_URL: dev }),
    ).toThrow(/ends in "_test"/);
  });

  test("rejects the development database even if named _test", () => {
    const shared = "postgres://audit:audit@localhost:5432/audit_test";
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL: shared,
        TEST_DATABASE_URL: shared,
      }),
    ).toThrow(/development database/);
  });

  test("rejects an invalid url", () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: "not-a-url" }),
    ).toThrow(/valid Postgres/);
  });
});
