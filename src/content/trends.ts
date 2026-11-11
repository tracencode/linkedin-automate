/**
 * Latest AI / tech headlines, newest first.
 * A story is skipped once its name already appears in a post we have written.
 */

type HnHit = { title?: string; created_at?: string };

const QUERIES = [
  "https://hn.algolia.com/api/v1/search_by_date?query=AI%20OR%20LLM%20OR%20agent%20OR%20OpenAI&tags=story&hitsPerPage=30",
  "https://hn.algolia.com/api/v1/search_by_date?query=artificial%20intelligence%20OR%20machine%20learning&tags=story&hitsPerPage=20",
];

const NAME_SKIP = new Set([
  "The",
  "This",
  "That",
  "Why",
  "How",
  "What",
  "When",
  "Show",
  "Launch",
  "Open",
  "New",
  "AI",
  "LLM",
  "GPT",
  "HN",
  "Part",
  "Beyond",
  "After",
  "From",
]);

export async function fetchLatestHeadlines(limit = 20): Promise<string[]> {
  const titles: string[] = [];
  for (const url of QUERIES) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "linkedin-automate/1.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { hits?: HnHit[] };
      for (const hit of payload.hits ?? []) {
        const title = hit.title?.trim();
        if (!title || title.length < 12) continue;
        if (titles.some((existing) => existing.toLowerCase() === title.toLowerCase())) continue;
        titles.push(title);
        if (titles.length >= limit) return titles;
      }
    } catch {
      /* try the next source */
    }
  }
  return titles.slice(0, limit);
}

/** Distinctive name in a headline, used to tell if a story was already written. */
export function storyName(title: string): string | undefined {
  const cleaned = title.replace(/^(show|launch)\s+hn:\s*/i, "");
  const words = [...cleaned.matchAll(/\b([A-Z][A-Za-z0-9+]{2,})\b/g)].map((match) => match[1] ?? "");
  return words.find((word) => !NAME_SKIP.has(word));
}

export function headlineAlreadyUsed(title: string, corpus: string, usedAngles: string[]): boolean {
  const key = title.trim().toLowerCase();
  if (usedAngles.some((angle) => angle.trim().toLowerCase() === key)) return true;
  const name = storyName(title);
  if (!name) return corpus.toLowerCase().includes(key.slice(0, 48));
  return corpus.toLowerCase().includes(name.toLowerCase());
}
