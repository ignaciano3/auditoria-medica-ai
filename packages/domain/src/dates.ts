export type NormalizedDate = {
  original: string;
  iso?: string;
  hasYear: boolean;
};

const ISO_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_FULL_PATTERN = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/;
const DMY_SHORT_PATTERN = /^(\d{1,2})[/-](\d{1,2})$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function expandYear(raw: number): number {
  return raw < 100 ? 2000 + raw : raw;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toIso(year: number, month: number, day: number): string | undefined {
  if (!isValidYmd(year, month, day)) return undefined;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normalizeDate(
  input: string,
  context?: { referenceYear?: number },
): NormalizedDate {
  const original = input.trim();

  const isoMatch = ISO_PATTERN.exec(original);
  if (isoMatch !== null) {
    const iso = toIso(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
    return iso === undefined
      ? { original, hasYear: true }
      : { original, iso, hasYear: true };
  }

  const fullMatch = DMY_FULL_PATTERN.exec(original);
  if (fullMatch !== null) {
    const iso = toIso(
      expandYear(Number(fullMatch[3])),
      Number(fullMatch[2]),
      Number(fullMatch[1]),
    );
    return iso === undefined
      ? { original, hasYear: true }
      : { original, iso, hasYear: true };
  }

  const shortMatch = DMY_SHORT_PATTERN.exec(original);
  if (shortMatch !== null) {
    const day = Number(shortMatch[1]);
    const month = Number(shortMatch[2]);
    if (!isValidYmd(2000, month, day)) {
      return { original, hasYear: false };
    }
    const referenceYear = context?.referenceYear;
    if (referenceYear === undefined) {
      return { original, hasYear: false };
    }
    return {
      original,
      iso: `${referenceYear}-${pad(month)}-${pad(day)}`,
      hasYear: false,
    };
  }

  return { original, hasYear: false };
}

export function compareNormalizedDates(
  a: NormalizedDate | undefined,
  b: NormalizedDate | undefined,
): number {
  const aIso = a?.iso;
  const bIso = b?.iso;
  if (aIso !== undefined && bIso !== undefined) {
    if (aIso === bIso) return 0;
    return aIso < bIso ? -1 : 1;
  }
  if (aIso !== undefined) return -1;
  if (bIso !== undefined) return 1;
  return 0;
}

export function hospitalizationDurationDays(
  admission?: string,
  discharge?: string,
): number | undefined {
  if (admission === undefined || discharge === undefined) return undefined;
  const start = normalizeDate(admission).iso;
  const end = normalizeDate(discharge).iso;
  if (start === undefined || end === undefined) return undefined;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const days = Math.round((endMs - startMs) / 86_400_000);
  return days < 0 ? undefined : days;
}
