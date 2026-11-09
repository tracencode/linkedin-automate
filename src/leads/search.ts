import { LEAD_QUERIES, scoreLead } from "./queries.ts";

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  query: string;
  score: number;
};

export async function searchLeadPosts(): Promise<SearchHit[]> {
  const found = new Map<string, SearchHit>();
  for (const query of LEAD_QUERIES) {
    let items: { url: string; title: string; snippet: string }[] = [];
    try {
      items = await searchBing(query);
    } catch {
      items = [];
    }
    for (const item of items) {
      const score = scoreLead(`${item.title} ${item.snippet}`, item.url);
      if (score < 3) continue;
      const key = canonicalUrl(item.url);
      const prev = found.get(key);
      if (!prev || score > prev.score) {
        found.set(key, { ...item, url: key, query, score });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}

async function searchBing(query: string): Promise<{ url: string; title: string; snippet: string }[]> {
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
  const items: { url: string; title: string; snippet: string }[] = [];
  for (const block of xml.split("<item>").slice(1)) {
    const title = decodeXml(readTag(block, "title"));
    const link = decodeXml(readTag(block, "link"));
    const snippet = decodeXml(readTag(block, "description")).replace(/<[^>]+>/g, " ");
    if (!link.startsWith("http")) continue;
    items.push({ url: link, title, snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 400) });
  }
  return items;
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

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "trk"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url;
  }
}
