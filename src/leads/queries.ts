/**
 * Buying-intent searches for TraceNcode: Odoo implementation, customization,
 * and a team that builds software around ERP. Public web results only.
 */
export const LEAD_QUERIES = [
  `"looking for" ("Odoo developer" OR "Odoo implementation" OR "Odoo partner")`,
  `"need" ("Odoo developer" OR "Odoo team" OR "ERP implementation partner")`,
  `"looking for" ("development team" OR "software development company") (Odoo OR ERP OR "custom software")`,
  `"hire" (Odoo OR "ERP developer") (implementation OR customization OR migration)`,
  `site:linkedin.com/posts ("looking for" OR "need a" OR "recommend") (Odoo OR "development team" OR "software partner")`,
  `site:reddit.com ("looking for" OR "recommend") ("Odoo developer" OR "Odoo partner" OR "ERP implementation")`,
];

const BUYING = [
  "looking for",
  "need a",
  "need an",
  "hiring",
  "hire ",
  "seeking",
  "recommend",
  "implementation partner",
  "development team",
  "software partner",
  "outsource",
  "agency",
  "freelancer",
];

const SERVICES = ["odoo", "erp", "implement", "custom", "migrat", "developer", "development"];

const SKIP = [
  "tracencode.com",
  "linkedin.com/jobs",
  "indeed.com",
  "naukri.com",
  "glassdoor.",
  "we are hiring",
  "we're hiring",
  "apply now",
  "send your resume",
  "job opening",
];

export function scoreLead(text: string, url: string): number {
  const hay = `${text} ${url}`.toLowerCase();
  if (SKIP.some((part) => hay.includes(part))) return 0;
  const buying = BUYING.reduce((n, phrase) => n + (hay.includes(phrase) ? 2 : 0), 0);
  const service = SERVICES.reduce((n, phrase) => n + (hay.includes(phrase) ? 1 : 0), 0);
  if (buying === 0 || service === 0) return 0;
  return buying + service;
}
