const BANNED = new Set(
  [
    "success",
    "motivation",
    "mindset",
    "hustle",
    "leadership",
    "inspiration",
    "linkedin",
    "growth",
    "career",
    "business",
    "tech",
    "technology",
    "innovation",
    "digitaltransformation",
    "futureofwork",
  ].map((tag) => tag.toLowerCase()),
);

type CatalogEntry = { tag: string; phrases: string[]; weight: number };

const CATALOG: CatalogEntry[] = [
  { tag: "MasterData", phrases: ["master data", "vendor names", "units of measure", "duplicated"], weight: 5 },
  { tag: "DataQuality", phrases: ["data quality", "dirty data", "inconsist", "typos", "data problem", "cleaning records"], weight: 5 },
  { tag: "Invoices", phrases: ["invoice"], weight: 5 },
  { tag: "Inventory", phrases: ["inventory", "stock move", "warehouse"], weight: 5 },
  { tag: "Customization", phrases: ["custom module", "customization", "customise", "customize", "coding custom"], weight: 5 },
  { tag: "Configuration", phrases: ["configur"], weight: 5 },
  { tag: "Integrations", phrases: ["integration", "syncing", "both systems"], weight: 5 },
  { tag: "Payments", phrases: ["payment gateway", "payment"], weight: 5 },
  { tag: "DocumentAI", phrases: ["scan", "extracting data", "ocr", "invoice formats"], weight: 5 },
  { tag: "Migration", phrases: ["migration"], weight: 5 },
  { tag: "Manufacturing", phrases: ["manufacturing"], weight: 5 },
  { tag: "Accounting", phrases: ["accounting", "approvals"], weight: 4 },
  { tag: "Automation", phrases: ["automat"], weight: 4 },
  { tag: "Debugging", phrases: ["debug", "only happens in production"], weight: 4 },
  { tag: "SupportOps", phrases: ["support ticket", "support tickets"], weight: 4 },
  { tag: "Odoo", phrases: ["odoo"], weight: 3 },
  { tag: "ERP", phrases: ["erp"], weight: 3 },
  { tag: "AI", phrases: ["artificial intelligence", "chatbot", "llm", "machine learning"], weight: 3 },
  { tag: "OpenSource", phrases: ["open source", "core updates"], weight: 3 },
];

export function stripHashtagLines(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  while (lines.length) {
    const last = (lines.at(-1) ?? "").trim();
    if (!last) {
      lines.pop();
      continue;
    }
    if (isHashtagOnlyLine(last)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

export function hashtagsForPost(topic: string, text: string, suggested: string[] = []): string[] {
  const blob = `${topic}\n${stripHashtagLines(text)}`.toLowerCase();
  const scored = CATALOG.map((entry) => ({
    tag: entry.tag,
    score: entry.phrases.reduce((sum, phrase) => sum + countPhrase(blob, phrase) * entry.weight, 0),
  }));

  const aiMentions = countWord(blob, "ai");
  const ai = scored.find((entry) => entry.tag === "AI");
  if (ai) ai.score += aiMentions * 3;

  const ranked = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  const fromCatalog = ranked.map((entry) => formatTag(entry.tag));
  const fromModel = suggested
    .map((tag) => formatTag(tag))
    .filter((tag) => isAllowedTag(tag) && tagMatchesPost(tag, blob));

  const merged: string[] = [];
  for (const tag of [...fromCatalog, ...fromModel]) {
    if (!tag) continue;
    if (!merged.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      merged.push(tag);
    }
    if (merged.length === 4) break;
  }
  return merged;
}

function countPhrase(blob: string, phrase: string): number {
  if (!phrase) return 0;
  let count = 0;
  let from = 0;
  while (from < blob.length) {
    const at = blob.indexOf(phrase, from);
    if (at === -1) break;
    count += 1;
    from = at + phrase.length;
  }
  return count;
}

function countWord(blob: string, word: string): number {
  return blob.match(new RegExp(`\\b${word}\\b`, "g"))?.length ?? 0;
}

export function ensureHashtags(text: string, topic = "", suggested: string[] = []): string {
  const body = stripHashtagLines(text);
  const tags = hashtagsForPost(topic, body, suggested);
  if (tags.length === 0) return body;
  return `${body}\n\n${tags.join(" ")}`;
}

function isHashtagOnlyLine(line: string): boolean {
  const parts = line.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^#[A-Za-z][\w]*$/.test(part));
}

function formatTag(raw: string): string {
  const cleaned = raw.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "";
  if (cleaned === cleaned.toUpperCase() && cleaned.length <= 4) return `#${cleaned}`;
  const pascal = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "ai") return "AI";
      if (lower === "erp") return "ERP";
      if (lower === "ocr") return "OCR";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
  if (pascal.toLowerCase() === "ai") return "#AI";
  if (pascal.toLowerCase() === "erp") return "#ERP";
  return `#${pascal}`;
}

function isAllowedTag(tag: string): boolean {
  const name = tag.replace(/^#/, "");
  if (name.length < 2 || name.length > 28) return false;
  if (BANNED.has(name.toLowerCase())) return false;
  return /^#[A-Za-z][A-Za-z0-9]*$/.test(tag);
}

function tagMatchesPost(tag: string, blob: string): boolean {
  const name = tag.replace(/^#/, "");
  if (BANNED.has(name.toLowerCase())) return false;
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  if (words.length >= 3 && blob.includes(words)) return true;
  if (blob.includes(name.toLowerCase())) return true;
  return CATALOG.some(
    (entry) => entry.tag.toLowerCase() === name.toLowerCase() && entry.phrases.some((phrase) => blob.includes(phrase)),
  );
}
