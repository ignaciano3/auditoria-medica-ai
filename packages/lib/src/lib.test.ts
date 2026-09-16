import { expect, test } from "bun:test";
import * as lib from "./index.ts";

test("lib package entry point loads", () => {
  expect(lib).toBeDefined();
});
