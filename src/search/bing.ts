export type WebHit = {
  url: string;
  title: string;
  snippet: string;
};

export type ScoredHit = WebHit & {
  query: string;
  score: number;
};

export async function searchScored(
  queries: string[],
  score: (text: string, url: string) => number,
  minimum = 3,
): Promise<ScoredHit[]> {
  const found = new Map<string, ScoredHit>();
  for (const query of queries) {
    let items: WebHit[] = [];
    try {
      items = await searchBing(query);
    } catch {
      items = [];
    }
    for (const item of items) {
      const value = score(`${item.title} ${item.snippet}`, item.url);
      if (value < minimum) continue;
      const key = canonicalUrl(item.url);
      const prev = found.get(key);
      if (!prev || value > prev.score) {
        found.set(key, { ...item, url: key, query, score: value });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function searchBing(query: string): Promise<WebHit[]> {
  const url = `https://www.bing.com/search?format=rss&count=10&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const items: WebHit[] = [];
  for (const block of xml.split("<item>").slice(1)) {
    const title = decodeXml(readTag(block, "title"));
    const link = decodeXml(readTag(block, "link"));
    const snippet = decodeXml(readTag(block, "description")).replace(/<[^>]+>/g, " ");
    if (!link.startsWith("http")) continue;
    items.push({ url: link, title, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 400) });
  }
  return items;
}

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "trk"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url;
  }
}

function readTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return (match?.[1] ?? "").replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
