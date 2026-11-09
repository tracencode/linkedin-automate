import { scoreLead } from "../leads/queries.ts";
import { isLinkedInPostUrl } from "./store.ts";

/**
 * LinkedIn discussion posts in the niche. Product pages, docs, and GitHub
 * repos are not threads we can comment on.
 */
export const COMMENT_QUERIES = [
  `site:linkedin.com/posts Odoo (implementation OR "go-live" OR "master data" OR migration)`,
  `site:linkedin.com/posts Odoo (customization OR warehouse OR invoice OR ERP)`,
  `site:linkedin.com/posts "ERP implementation" (learned OR mistake OR "go-live")`,
  `site:linkedin.com/feed/update Odoo (implementation OR migration OR customization)`,
];

const TOPICS = [
  "odoo",
  "erp",
  "applied ai",
  "master data",
  "invoice",
  "warehouse",
  "migration",
  "customiz",
  "go-live",
  "go live",
  "implementation",
  "copilot",
];

const SKIP = ["tracencode.com", "linkedin.com/jobs", "indeed.com", "naukri.com", "glassdoor."];

export function scoreComment(text: string, url: string): number {
  if (!isLinkedInPostUrl(url)) return 0;
  const hay = `${text} ${url}`.toLowerCase();
  if (SKIP.some((part) => hay.includes(part))) return 0;
  if (scoreLead(text, url) >= 3) return 0;
  const hits = TOPICS.reduce((n, phrase) => n + (hay.includes(phrase) ? 1 : 0), 0);
  return hits >= 2 ? hits : 0;
}
