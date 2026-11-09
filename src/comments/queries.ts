import { scoreLead } from "../leads/queries.ts";

/**
 * Discussion posts in the niche: Odoo, ERP operations, applied AI.
 * Buying-intent posts stay on the Leads list and score 0 here.
 */
export const COMMENT_QUERIES = [
  `Odoo (implementation OR customization OR migration) (lesson OR mistake OR "go-live" OR "master data")`,
  `"applied AI" (ERP OR operations OR invoices OR warehouse) (workflow OR Odoo)`,
  `site:linkedin.com/posts (Odoo OR "ERP implementation") (learned OR shipped OR "go-live" OR "master data")`,
  `site:reddit.com/r/odoo (implementation OR customization OR migration OR "go-live")`,
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
  const hay = `${text} ${url}`.toLowerCase();
  if (SKIP.some((part) => hay.includes(part))) return 0;
  if (scoreLead(text, url) >= 3) return 0;
  const hits = TOPICS.reduce((n, phrase) => n + (hay.includes(phrase) ? 1 : 0), 0);
  return hits >= 2 ? hits : 0;
}
