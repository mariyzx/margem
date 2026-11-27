const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "e",
  "ou",
  "que",
  "qual",
  "quais",
  "como",
  "por",
  "para",
  "pra",
  "com",
  "sem",
  "se",
  "é",
  "são",
  "ser",
  "foi",
  "ao",
  "aos",
  "à",
  "às",
  "isso",
  "isto",
  "esse",
  "essa",
  "este",
  "esta",
  "mais",
  "menos",
  "quando",
  "onde",
  "porque",
  "porquê",
  "sobre",
  "entre",
  "tem",
  "ter",
  "minha",
  "meu",
]);

const MAX_TERMS = 8;
const MIN_TERM_LENGTH = 3;

export function extractKeywords(text: string): string[] {
  const terms: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TERM_LENGTH || STOPWORDS.has(raw) || terms.includes(raw)) continue;
    terms.push(raw);
    if (terms.length >= MAX_TERMS) break;
  }
  return terms;
}

export function keywordScore(text: string, terms: string[]): number {
  const haystack = text.toLowerCase();
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}
