const MIN_TAGS = 15;
const MAX_TAGS = 18;

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
    "innovation",
    "digitaltransformation",
    "futureofwork",
    "commentyes",
    "viral",
  ].map((tag) => tag.toLowerCase()),
);

type CatalogEntry = { tag: string; phrases: string[]; weight: number };

const CATALOG: CatalogEntry[] = [
  { tag: "MasterData", phrases: ["master data", "vendor names", "units of measure", "duplicated"], weight: 5 },
  { tag: "DataQuality", phrases: ["data quality", "dirty data", "inconsist", "typos", "data problem", "cleaning records"], weight: 5 },
  { tag: "DataCleansing", phrases: ["clean", "cleaning", "dirty"], weight: 3 },
  { tag: "DataGovernance", phrases: ["data quality", "master data", "records"], weight: 3 },
  { tag: "Invoices", phrases: ["invoice"], weight: 5 },
  { tag: "AccountsPayable", phrases: ["invoice", "approvals", "vendor"], weight: 3 },
  { tag: "InvoiceProcessing", phrases: ["invoice", "scan", "extracting"], weight: 4 },
  { tag: "Inventory", phrases: ["inventory", "stock move", "warehouse"], weight: 5 },
  { tag: "WarehouseManagement", phrases: ["warehouse", "inventory", "stock"], weight: 4 },
  { tag: "Customization", phrases: ["custom module", "customization", "customise", "customize", "coding custom"], weight: 5 },
  { tag: "CustomModule", phrases: ["custom module", "module"], weight: 4 },
  { tag: "Configuration", phrases: ["configur"], weight: 5 },
  { tag: "Integrations", phrases: ["integration", "syncing", "both systems"], weight: 5 },
  { tag: "APIs", phrases: ["api", "integration", "syncing"], weight: 3 },
  { tag: "Payments", phrases: ["payment gateway", "payment"], weight: 5 },
  { tag: "PaymentGateway", phrases: ["payment gateway", "gateway"], weight: 4 },
  { tag: "DocumentAI", phrases: ["scan", "extracting data", "ocr", "invoice formats"], weight: 5 },
  { tag: "OCR", phrases: ["ocr", "scan", "extracting"], weight: 4 },
  { tag: "Migration", phrases: ["migration"], weight: 5 },
  { tag: "DataMigration", phrases: ["migration", "upgrade"], weight: 4 },
  { tag: "Manufacturing", phrases: ["manufacturing"], weight: 5 },
  { tag: "Accounting", phrases: ["accounting", "approvals"], weight: 4 },
  { tag: "FinanceOps", phrases: ["accounting", "invoice", "payment"], weight: 3 },
  { tag: "Automation", phrases: ["automat"], weight: 4 },
  { tag: "WorkflowAutomation", phrases: ["workflow", "automat"], weight: 4 },
  { tag: "Debugging", phrases: ["debug", "only happens in production"], weight: 4 },
  { tag: "ProductionIssues", phrases: ["production", "debug", "live"], weight: 3 },
  { tag: "SupportOps", phrases: ["support ticket", "support tickets", "emails"], weight: 4 },
  { tag: "CustomerSupport", phrases: ["support", "ticket"], weight: 3 },
  { tag: "Odoo", phrases: ["odoo"], weight: 3 },
  { tag: "OdooERP", phrases: ["odoo", "erp"], weight: 3 },
  { tag: "OdooImplementation", phrases: ["odoo", "implement"], weight: 3 },
  { tag: "OdooDevelopment", phrases: ["odoo", "module", "custom"], weight: 3 },
  { tag: "OdooPartner", phrases: ["odoo"], weight: 2 },
  { tag: "ERP", phrases: ["erp"], weight: 3 },
  { tag: "ERPImplementation", phrases: ["erp", "implement"], weight: 3 },
  { tag: "EnterpriseSoftware", phrases: ["erp", "odoo", "system"], weight: 2 },
  { tag: "AI", phrases: ["artificial intelligence", "chatbot", "llm", "machine learning"], weight: 3 },
  { tag: "AppliedAI", phrases: ["ai", "assistant", "model"], weight: 3 },
  { tag: "MachineLearning", phrases: ["model", "ai", "machine learning"], weight: 2 },
  { tag: "OpenSource", phrases: ["open source", "core updates", "odoo"], weight: 3 },
  { tag: "SoftwareDevelopment", phrases: ["code", "module", "develop", "custom"], weight: 2 },
  { tag: "TechnicalDebt", phrases: ["upgrade", "fork", "maintain", "custom"], weight: 3 },
  { tag: "Upgrades", phrases: ["upgrade", "version"], weight: 4 },
  { tag: "UserAdoption", phrases: ["adoption", "users", "monday"], weight: 3 },
  { tag: "ChangeManagement", phrases: ["adoption", "users", "operations"], weight: 2 },
  { tag: "Operations", phrases: ["operations", "ops", "process"], weight: 2 },
  { tag: "ProcessImprovement", phrases: ["process", "workflow", "simpler"], weight: 2 },
  { tag: "SaaS", phrases: ["odoo", "cloud", "erp"], weight: 2 },
  { tag: "DigitalOperations", phrases: ["operations", "erp", "workflow"], weight: 2 },
  { tag: "TraceNcode", phrases: ["we ", "our ", "customer"], weight: 1 },
];

const RELATED: Record<string, string[]> = {
  MasterData: ["DataQuality", "DataCleansing", "DataGovernance", "MDM", "ERP"],
  DataQuality: ["MasterData", "DataCleansing", "DataGovernance", "Operations"],
  Invoices: ["AccountsPayable", "InvoiceProcessing", "FinanceOps", "DocumentAI", "OCR"],
  Inventory: ["WarehouseManagement", "SupplyChain", "StockManagement", "ERP"],
  Customization: ["CustomModule", "OdooDevelopment", "TechnicalDebt", "Configuration", "SoftwareDevelopment"],
  Configuration: ["Customization", "OdooImplementation", "OdooERP", "BestPractices"],
  Integrations: ["APIs", "SystemIntegration", "Middleware", "Payments", "DataSync"],
  Payments: ["PaymentGateway", "Accounting", "FinanceOps", "Integrations"],
  DocumentAI: ["OCR", "AppliedAI", "InvoiceProcessing", "Automation"],
  Migration: ["DataMigration", "Upgrades", "OdooImplementation", "ERPImplementation"],
  Accounting: ["FinanceOps", "Invoices", "ERP"],
  Automation: ["WorkflowAutomation", "AppliedAI", "ProcessImprovement"],
  Debugging: ["ProductionIssues", "SoftwareDevelopment", "OdooDevelopment"],
  SupportOps: ["CustomerSupport", "Helpdesk", "Operations"],
  Odoo: ["OdooERP", "OdooImplementation", "OdooDevelopment", "OdooPartner", "OpenSource", "ERP"],
  ERP: ["OdooERP", "ERPImplementation", "EnterpriseSoftware", "DigitalOperations"],
  AI: ["AppliedAI", "MachineLearning", "DocumentAI", "Automation"],
  OpenSource: ["Odoo", "SoftwareDevelopment", "Community"],
  Upgrades: ["Migration", "TechnicalDebt", "OdooImplementation"],
};

const NICHE_FILL = [
  "Odoo",
  "ERP",
  "OdooERP",
  "OdooImplementation",
  "OdooDevelopment",
  "OpenSource",
  "SoftwareDevelopment",
  "EnterpriseSoftware",
  "DigitalOperations",
  "ProcessImprovement",
  "Operations",
  "SaaS",
  "BestPractices",
  "Implementation",
  "OdooCommunity",
  "BusinessSoftware",
];

const STOPWORDS = new Set(
  "a an the vs or and for to of in on when what why how i we they this that just not vs writing using check before trust after still really looking small last month into from with without".split(
    " ",
  ),
);

const KNOWN_TAGS = new Set(
  [
    ...CATALOG.map((entry) => entry.tag.toLowerCase()),
    ...Object.values(RELATED).flat().map((tag) => tag.toLowerCase()),
    ...NICHE_FILL.map((tag) => tag.toLowerCase()),
  ],
);

const CANONICAL = new Map<string, string>();
for (const tag of [
  ...CATALOG.map((entry) => entry.tag),
  ...Object.values(RELATED).flat(),
  ...NICHE_FILL,
]) {
  CANONICAL.set(tag.toLowerCase(), tag);
}

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
  const body = stripHashtagLines(text);
  const blob = `${topic}\n${body}`.toLowerCase();
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

  const fromCatalog = ranked.map((entry) => formatTag(entry.tag)).filter(Boolean);
  const fromModel = suggested.map((tag) => formatTag(tag)).filter((tag) => isAllowedTag(tag) && tagMatchesPost(tag, blob));
  const fromTopic = topicTags(topic);
  const related = relatedTags(ranked.map((entry) => entry.tag));

  const merged: string[] = [];
  const push = (tag: string) => {
    const formatted = tag.startsWith("#") ? tag : formatTag(tag);
    if (!formatted || !isAllowedTag(formatted)) return;
    if (merged.some((existing) => existing.toLowerCase() === formatted.toLowerCase())) return;
    merged.push(formatted);
  };

  for (const tag of [...fromCatalog, ...fromModel, ...fromTopic, ...related]) push(tag);

  const wantsOdoo = /\bodoo\b/.test(blob) || merged.some((tag) => tag.toLowerCase().includes("odoo"));
  const wantsErp = /\berp\b/.test(blob) || wantsOdoo;
  const wantsAi = aiMentions > 0 || /\bassistant\b|\bmodel\b|\bocr\b/.test(blob);
  if (wantsOdoo || wantsErp) {
    for (const tag of NICHE_FILL) push(tag);
  }
  if (wantsAi) {
    for (const tag of ["AI", "AppliedAI", "MachineLearning", "Automation", "DocumentAI"]) push(tag);
  }
  for (const tag of NICHE_FILL) {
    if (merged.length >= MIN_TAGS) break;
    push(tag);
  }

  return merged.slice(0, MAX_TAGS);
}

export function ensureHashtags(text: string, topic = "", suggested: string[] = []): string {
  const body = stripHashtagLines(text);
  const tags = hashtagsForPost(topic, body, suggested);
  if (tags.length === 0) return body;
  return `${body}\n\n${wrapHashtags(tags)}`;
}

function wrapHashtags(tags: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < tags.length; i += 5) {
    lines.push(tags.slice(i, i + 5).join(" "));
  }
  return lines.join("\n");
}

function relatedTags(hitTags: string[]): string[] {
  const out: string[] = [];
  for (const tag of hitTags) {
    for (const related of RELATED[tag] ?? []) out.push(related);
  }
  return out;
}

function topicTags(topic: string): string[] {
  return topic
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word.toLowerCase()))
    .map((word) => formatTag(word))
    .filter((tag) => {
      if (!isAllowedTag(tag)) return false;
      const name = tag.replace(/^#/, "").toLowerCase();
      return KNOWN_TAGS.has(name) || name.length >= 10;
    });
}

function countPhrase(blob: string, phrase: string): number {
  if (!phrase) return 0;
  if (phrase.trim().length <= 3) {
    return countWord(blob, phrase.trim());
  }
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

function isHashtagOnlyLine(line: string): boolean {
  const parts = line.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^#[A-Za-z][\w]*$/.test(part));
}

function formatTag(raw: string): string {
  const cleaned = raw.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "");
  if (!cleaned) return "";
  const canonical = CANONICAL.get(cleaned.toLowerCase());
  if (canonical === "AI" || cleaned.toLowerCase() === "ai") return "#AI";
  if (canonical === "ERP" || cleaned.toLowerCase() === "erp") return "#ERP";
  if (canonical === "OCR") return "#OCR";
  if (canonical === "APIs") return "#APIs";
  if (canonical === "MDM") return "#MDM";
  if (canonical === "SaaS") return "#SaaS";
  if (canonical) return `#${canonical}`;
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
      if (lower === "api" || lower === "apis") return "APIs";
      if (lower === "mdm") return "MDM";
      if (lower === "saas") return "SaaS";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join("");
  if (pascal.toLowerCase() === "ai") return "#AI";
  if (pascal.toLowerCase() === "erp") return "#ERP";
  return `#${pascal}`;
}

function isAllowedTag(tag: string): boolean {
  const name = tag.replace(/^#/, "");
  if (name.length < 2 || name.length > 32) return false;
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
