/**
 * Pull recent AI / tech headlines so drafts can react to what is circulating now.
 * Fail-soft: empty list if the network is down.
 */

type HnHit = { title?: string; url?: string; points?: number };

export async function fetchTrendingHeadlines(limit = 8): Promise<string[]> {
  const queries = [
    "https://hn.algolia.com/api/v1/search?query=AI%20OR%20LLM%20OR%20GPT%20OR%20OpenAI%20OR%20Anthropic%20OR%20agent&tags=story&hitsPerPage=12",
    "https://hn.algolia.com/api/v1/search_by_date?query=artificial%20intelligence%20OR%20machine%20learning%20OR%20ERP&tags=story&hitsPerPage=8",
  ];

  const titles: string[] = [];
  for (const url of queries) {
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
      /* ignore and try next source */
    }
  }
  return titles.slice(0, limit);
}

export function formatTrendsForPrompt(headlines: string[]): string {
  if (headlines.length === 0) {
    return "(no live headlines available — lean on a recent AI product, model, or ops trend you know is circulating)";
  }
  return headlines.map((line, i) => `${i + 1}. ${line}`).join("\n");
}
