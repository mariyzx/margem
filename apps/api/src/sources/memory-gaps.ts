import type { MemoryGapDto } from "@margem/shared";

const EMBEDDING_COVERED_THRESHOLD = 0.58;
const LEXICAL_COVERED_THRESHOLD = 0.28;
const MAX_GAPS = 5;

const STOPWORDS = new Set([
  "para",
  "como",
  "mais",
  "sobre",
  "entre",
  "isso",
  "esse",
  "esta",
  "este",
  "pela",
  "pelo",
  "pelos",
  "pelas",
  "com",
  "sem",
  "uma",
  "uns",
  "umas",
  "que",
  "dos",
  "das",
  "nos",
  "nas",
  "por",
  "ser",
  "ter",
  "seu",
  "sua",
  "seus",
  "suas",
  "sao",
  "esta",
  "estao",
  "foi",
  "foram",
  "tambem",
  "muito",
  "quando",
  "onde",
  "qual",
  "quais",
  "porque",
  "pois",
  "entao",
  "assim",
  "from",
  "with",
  "that",
  "this",
  "have",
  "they",
  "what",
  "which",
  "about",
]);

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function tokenize(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const words = normalized.match(/[a-z0-9]{3,}/g) ?? [];
  const tokens = new Set<string>();
  for (const w of words) {
    if (!STOPWORDS.has(w)) tokens.add(w);
  }
  return tokens;
}

export function lexicalCoverage(memoryTokens: Set<string>, chunkText: string): number {
  const chunkTokens = tokenize(chunkText);
  if (chunkTokens.size === 0) return 1;
  let hits = 0;
  for (const token of chunkTokens) {
    if (memoryTokens.has(token)) hits++;
  }
  return hits / chunkTokens.size;
}

function makeExcerpt(text: string, maxLen = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

export function findMemoryGaps(params: {
  memoryParagraphs: string[];
  chunks: Array<{ id: string; ord: number; page: number | null; text: string }>;
  memoryVectors?: number[][] | null;
  chunkVectors?: number[][] | null;
}): MemoryGapDto[] {
  const { memoryParagraphs, chunks, memoryVectors, chunkVectors } = params;
  if (memoryParagraphs.length === 0 || chunks.length === 0) {
    return [];
  }

  const useVectors =
    Array.isArray(memoryVectors) &&
    Array.isArray(chunkVectors) &&
    memoryVectors.length === memoryParagraphs.length &&
    chunkVectors.length === chunks.length;

  const memoryTokens = tokenize(memoryParagraphs.join(" "));
  const threshold = useVectors ? EMBEDDING_COVERED_THRESHOLD : LEXICAL_COVERED_THRESHOLD;

  const scored = chunks.map((chunk, i) => {
    let score = 0;
    if (useVectors) {
      const cVec = chunkVectors[i]!;
      for (const mVec of memoryVectors) {
        const sim = cosineSimilarity(mVec, cVec);
        if (sim > score) score = sim;
      }
    } else {
      score = lexicalCoverage(memoryTokens, chunk.text);
    }

    return {
      chunkId: chunk.id,
      ord: chunk.ord,
      page: chunk.page,
      excerpt: makeExcerpt(chunk.text),
      score: Number(score.toFixed(3)),
    };
  });

  return scored
    .filter((item) => item.score < threshold)
    .sort((a, b) => a.score - b.score || a.ord - b.ord)
    .slice(0, MAX_GAPS);
}
