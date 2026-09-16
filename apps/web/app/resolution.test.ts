import { expect, test } from "bun:test";
import * as domain from "@audit/domain";

test("web resolves @audit/domain", () => {
  expect(domain).toBeDefined();
});
