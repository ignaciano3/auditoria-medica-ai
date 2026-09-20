type CatalogEntry = {
  label: string;
  aliases: readonly string[];
};

const HISTORY_CATALOG: readonly CatalogEntry[] = [
  {
    label: "Penicilina",
    aliases: ["penicilina", "penicilinico", "alergia a penicilina"],
  },
  {
    label: "Medicamentos",
    aliases: ["medicamentos", "medicacion", "farmacos"],
  },
];

const MIN_FUZZY_LENGTH = 5;
const DICE_THRESHOLD = 0.55;

const NOISE_PREFIXES: readonly RegExp[] = [
  /^alergi[ao]s?\s+a\s+/u,
  /^alergic[ao]s?\s+a\s+/u,
  /^antecedentes?\s+(?:de|a)\s+/u,
  /^sin\s+/u,
  /^niega\s+/u,
  /^al\s+/u,
  /^a\s+/u,
];

export function foldForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNoisePrefixes(folded: string): string {
  let text = folded;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of NOISE_PREFIXES) {
      const next = text.replace(pattern, "").trim();
      if (next !== text) {
        text = next;
        changed = true;
      }
    }
  }
  return text;
}

function trigrams(value: string): Set<string> {
  const padded = ` ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

function diceCoefficient(a: string, b: string): number {
  const gramsA = trigrams(a);
  const gramsB = trigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let intersection = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersection++;
  }
  return (2 * intersection) / (gramsA.size + gramsB.size);
}

function containsTerm(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, "u").test(haystack);
}

function catalogCandidates(entry: CatalogEntry): string[] {
  return [
    foldForMatch(entry.label),
    ...entry.aliases.map((alias) => foldForMatch(alias)),
  ].filter((candidate) => candidate !== "");
}

export type CanonicalHistoryMatch =
  | { kind: "catalog"; key: string; label: string; normalized: string }
  | { kind: "verbatim"; normalized: string };

export function canonicalHistoryKey(raw: string): CanonicalHistoryMatch {
  const folded = foldForMatch(raw);
  const normalized = stripNoisePrefixes(folded);
  if (normalized === "") {
    return { kind: "verbatim", normalized: folded };
  }

  for (const entry of HISTORY_CATALOG) {
    const key = `catalog:${foldForMatch(entry.label)}`;
    for (const candidate of catalogCandidates(entry)) {
      if (normalized === candidate || containsTerm(normalized, candidate)) {
        return { kind: "catalog", key, label: entry.label, normalized };
      }
    }
  }

  let best: { score: number; entry: CatalogEntry } | undefined;
  for (const entry of HISTORY_CATALOG) {
    for (const candidate of catalogCandidates(entry)) {
      if (candidate.length < MIN_FUZZY_LENGTH) continue;
      const score = diceCoefficient(normalized, candidate);
      if (
        score >= DICE_THRESHOLD &&
        (best === undefined || score > best.score)
      ) {
        best = { score, entry };
      }
    }
  }
  if (best !== undefined) {
    return {
      kind: "catalog",
      key: `catalog:${foldForMatch(best.entry.label)}`,
      label: best.entry.label,
      normalized,
    };
  }

  return { kind: "verbatim", normalized };
}
