// [spec: TG-002]
import type { Task } from "../../shared/types.js";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "app",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "do",
  "following",
  "for",
  "from",
  "get",
  "give",
  "has",
  "have",
  "hello",
  "hi",
  "how",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "pls",
  "share",
  "show",
  "status",
  "task",
  "tasks",
  "tell",
  "that",
  "the",
  "these",
  "this",
  "to",
  "update",
  "updates",
  "was",
  "what",
  "whats",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

export interface ParsedUpdateInquiry {
  isInquiry: true;
  items: string[];
  rawQuery: string;
}

export interface TaskCosineMatch {
  task: Task;
  score: number;
  matchedWords: number;
}

const SLASH_UPDATE_REGEX = /^\/updates?(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i;
const NATURAL_UPDATE_PATTERNS: ReadonlyArray<RegExp> = [
  // "any update(s) [please] [on/for/about] ..."
  /^(?:(?:hi|hello|hey)[,!\s]+)?any\s+updates?(?:\s+(?:please|pls))?(?:\s+(?:on|for|about))?\b[:?\s-]*([\s\S]*)$/i,
  // "[please/can you/need/what is the/status] ... update(s) [please] (on|for|about) ..."
  /^(?:(?:hi|hello|hey)[,!\s]+)?(?:(?:please|pls)\s+|(?:could|can)\s+(?:you|i)\s+(?:get|have|give|send|share|show)?\s*|need\s+|what(?:'s|\s+is)\s+the\s+|status\s+)(?:(?:give|send|share|show|get|provide)\s+(?:me\s+)?)?(?:an?\s+|me\s+)?updates?(?:\s+(?:please|pls))?\s+(?:on|for|about)\b[:?\s-]*([\s\S]*)$/i,
  // "update(s) please [on/for/about] ..." or "update(s) (on|for|about) ..." or bare "updates?"
  /^(?:(?:hi|hello|hey)[,!\s]+)?updates?\s+(?:please|pls)(?:\s+(?:on|for|about))?\b[:?\s-]*([\s\S]*)$/i,
  /^(?:(?:hi|hello|hey)[,!\s]+)?updates?\s+(?:on|for|about)\b[:?\s-]*([\s\S]*)$/i,
  /^(?:(?:hi|hello|hey)[,!\s]+)?updates?(?:\s+(?:please|pls))?\s*\?+$/i,
];

function extractNaturalUpdateBody(trimmedText: string): string | null {
  for (const pattern of NATURAL_UPDATE_PATTERNS) {
    const match = pattern.exec(trimmedText);
    if (match) {
      return (match[1] ?? "").trim();
    }
  }
  return null;
}

function cleanQueryText(raw: string): string {
  return raw
    .replace(/^\s*(?:\d+[.)]\s*|[-*•]\s+)/, "")
    .replace(/^(?:please|pls)\s+/i, "")
    .replace(/^(?:on|for|about)\s+/i, "")
    .replace(/^(?:the\s+)?following\s+tasks?(?:\s+please)?[:\s-]*/i, "")
    .replace(/\bplease\b[:?\s]*$/i, "")
    .replace(/[?:]+$/g, "")
    .trim();
}

/**
 * Detect whether an incoming Telegram message asks for task status updates
 * (`/updates ...`, `Any updates on ...`, `Update please on ...`) rather than creating a task.
 */
// [spec: TG-002]
export function parseUpdateInquiry(rawText: string): ParsedUpdateInquiry | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const slashMatch = SLASH_UPDATE_REGEX.exec(trimmed);
  const body = slashMatch
    ? (slashMatch[1] ?? "").trim()
    : extractNaturalUpdateBody(trimmed);

  if (body === null) return null;

  const lines = body
    .split(/\r?\n/)
    .map((line) => cleanQueryText(line))
    .filter((line) => line.length > 0);

  return {
    isInquiry: true,
    items: lines,
    rawQuery: cleanQueryText(body),
  };
}

function normalizeWords(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function extractWeightedFeatures(
  parts: Array<{ text: string; weight: number }>,
): { features: Map<string, number>; words: Set<string>; normalizedText: string } {
  const features = new Map<string, number>();
  const words = new Set<string>();
  const normPieces: string[] = [];

  for (const part of parts) {
    if (!part.text) continue;
    const partWords = normalizeWords(part.text);
    if (partWords.length > 0) {
      normPieces.push(partWords.join(" "));
    }
    for (const word of partWords) {
      words.add(word);
      const wordKey = `w:${word}`;
      features.set(wordKey, (features.get(wordKey) || 0) + part.weight);

      if (word.length >= 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          const triKey = `g:${word.slice(i, i + 3)}`;
          features.set(triKey, (features.get(triKey) || 0) + part.weight * 0.5);
        }
      }
    }
  }

  return {
    features,
    words,
    normalizedText: normPieces.join(" "),
  };
}

function computeVectorNorm(vec: Map<string, number>): number {
  let sumSq = 0;
  for (const val of vec.values()) {
    sumSq += val * val;
  }
  return Math.sqrt(sumSq);
}

/**
 * Rank candidate tasks using TF-IDF cosine similarity across word unigrams and
 * character trigrams (plus a bounded exact-substring tie-breaker boost).
 */
// [spec: TG-002]
export function rankTasksByCosineSimilarity(
  query: string,
  candidates: ReadonlyArray<Task>,
  projectNamesById: ReadonlyMap<string, string>,
  options: { threshold?: number; maxResults?: number } = {},
): TaskCosineMatch[] {
  const threshold = options.threshold ?? 0.25;
  const maxResults = options.maxResults ?? 5;

  const queryFeatures = extractWeightedFeatures([{ text: query, weight: 1.0 }]);
  if (queryFeatures.features.size === 0 || candidates.length === 0) {
    return [];
  }

  const docs = candidates.map((task) => {
    const projectName = task.project_id
      ? projectNamesById.get(task.project_id) || ""
      : "";
    const parsed = extractWeightedFeatures([
      { text: task.title, weight: 1.6 },
      { text: projectName, weight: 1.0 },
      { text: task.waiting_on || "", weight: 1.0 },
      { text: task.details || "", weight: 0.7 },
    ]);
    return { task, ...parsed };
  });

  // Document frequency across candidate corpus
  const docFreq = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.features.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const corpusSize = docs.length;
  const idf = (term: string): number =>
    Math.log((corpusSize + 1) / ((docFreq.get(term) || 0) + 1)) + 1.0;

  const queryVec = new Map<string, number>();
  for (const [term, tf] of queryFeatures.features.entries()) {
    queryVec.set(term, tf * idf(term));
  }
  const queryNorm = computeVectorNorm(queryVec);
  if (queryNorm === 0) return [];

  const queryNormText = queryFeatures.normalizedText;
  const results: TaskCosineMatch[] = [];

  for (const doc of docs) {
    let dotProduct = 0;
    let docSumSq = 0;
    for (const [term, tf] of doc.features.entries()) {
      const weightedDoc = tf * idf(term);
      docSumSq += weightedDoc * weightedDoc;
      const weightedQuery = queryVec.get(term);
      if (weightedQuery !== undefined) {
        dotProduct += weightedQuery * weightedDoc;
      }
    }
    const docNorm = Math.sqrt(docSumSq);
    if (docNorm === 0) continue;

    let score = dotProduct / (queryNorm * docNorm);

    let matchedWords = 0;
    for (const qWord of queryFeatures.words) {
      if (doc.words.has(qWord)) {
        matchedWords += 1;
      }
    }

    const normalizedTitle = normalizeWords(doc.task.title).join(" ");
    if (
      queryNormText.length >= 3 &&
      normalizedTitle.includes(queryNormText)
    ) {
      score = Math.min(1, score + 0.12);
    }

    // Prevent coincidental single-trigram hits when zero words overlap weakly
    if (score >= threshold && (matchedWords >= 1 || score >= 0.36)) {
      results.push({
        task: doc.task,
        score,
        matchedWords,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  if (results.length > 1 && queryFeatures.words.size >= 2) {
    const minRelativeScore = results[0].score * 0.65;
    return results
      .filter((r, idx) => idx === 0 || r.score >= minRelativeScore)
      .slice(0, maxResults);
  }
  return results.slice(0, maxResults);
}
