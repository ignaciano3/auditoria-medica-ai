import { describe, expect, test } from "bun:test";
import {
  compareNormalizedDates,
  hospitalizationDurationDays,
  normalizeDate,
} from "./dates.ts";

describe("normalizeDate", () => {
  test("parses dd/mm/yyyy", () => {
    expect(normalizeDate("13/02/2026")).toEqual({
      original: "13/02/2026",
      iso: "2026-02-13",
      hasYear: true,
    });
  });

  test("parses dd/mm/yy as 20yy", () => {
    expect(normalizeDate("5/3/26")).toEqual({
      original: "5/3/26",
      iso: "2026-03-05",
      hasYear: true,
    });
  });

  test("parses bare dd/mm without a year and without context", () => {
    expect(normalizeDate("14/02")).toEqual({
      original: "14/02",
      hasYear: false,
    });
  });

  test("parses bare dd/mm using referenceYear for ordering only", () => {
    expect(normalizeDate("14/02", { referenceYear: 2026 })).toEqual({
      original: "14/02",
      iso: "2026-02-14",
      hasYear: false,
    });
  });

  test("rejects a bare dd/mm that is impossible in the reference year", () => {
    expect(normalizeDate("29/02", { referenceYear: 2026 })).toEqual({
      original: "29/02",
      hasYear: false,
    });
  });

  test("accepts a bare dd/mm that is valid in a leap reference year", () => {
    expect(normalizeDate("29/02", { referenceYear: 2024 })).toEqual({
      original: "29/02",
      iso: "2024-02-29",
      hasYear: false,
    });
  });

  test("parses yyyy-mm-dd", () => {
    expect(normalizeDate("2026-02-13")).toEqual({
      original: "2026-02-13",
      iso: "2026-02-13",
      hasYear: true,
    });
  });

  test("rejects impossible dates without inventing one", () => {
    expect(normalizeDate("31/02/2026")).toEqual({
      original: "31/02/2026",
      hasYear: true,
    });
  });

  test("returns no iso for unrecognized input", () => {
    expect(normalizeDate("febrero")).toEqual({
      original: "febrero",
      hasYear: false,
    });
  });
});

describe("compareNormalizedDates", () => {
  test("orders by iso ascending", () => {
    expect(
      compareNormalizedDates(
        normalizeDate("13/02/2026"),
        normalizeDate("15/02/2026"),
      ),
    ).toBeLessThan(0);
  });

  test("puts entries without a date last", () => {
    expect(
      compareNormalizedDates(undefined, normalizeDate("13/02/2026")),
    ).toBeGreaterThan(0);
    expect(
      compareNormalizedDates(normalizeDate("13/02/2026"), undefined),
    ).toBeLessThan(0);
  });
});

describe("hospitalizationDurationDays", () => {
  test("computes the whole-day difference", () => {
    expect(hospitalizationDurationDays("13/02/2026", "28/02/2026")).toBe(15);
  });

  test("returns undefined when a date is missing", () => {
    expect(
      hospitalizationDurationDays(undefined, "28/02/2026"),
    ).toBeUndefined();
    expect(
      hospitalizationDurationDays("13/02/2026", undefined),
    ).toBeUndefined();
  });

  test("returns undefined when discharge precedes admission", () => {
    expect(
      hospitalizationDurationDays("28/02/2026", "13/02/2026"),
    ).toBeUndefined();
  });
});
