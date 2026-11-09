import { log } from "../log.ts";
import { searchLeadPosts } from "./search.ts";
import { leadId, loadLeads, saveLeads, type Lead } from "./store.ts";

const SCAN_GAP_MS = 3 * 60 * 60 * 1000;

export async function addLeadUrl(url: string): Promise<Lead> {
  const key = url.trim();
  const file = await loadLeads();
  const id = leadId(key);
  const existing = file.leads.find((lead) => lead.id === id);
  if (existing) return existing;
  const lead: Lead = {
    id,
    url: key,
    title: key,
    snippet: "",
    query: "manual",
    score: 5,
    status: "new",
    foundAt: new Date().toISOString(),
  };
  file.leads.unshift(lead);
  await saveLeads(file);
  return lead;
}

export async function scanLeads(options: { force?: boolean } = {}) {
  const file = await loadLeads();
  const last = file.lastScanAt ? Date.parse(file.lastScanAt) : 0;
  if (!options.force && Date.now() - last < SCAN_GAP_MS) {
    return { added: 0, skipped: "recent-scan" as const };
  }

  const hits = await searchLeadPosts();
  let added = 0;
  for (const hit of hits) {
    const id = leadId(hit.url);
    if (file.leads.some((lead) => lead.id === id)) continue;
    file.leads.unshift({
      id,
      url: hit.url,
      title: hit.title,
      snippet: hit.snippet,
      query: hit.query,
      score: hit.score,
      status: "new",
      foundAt: new Date().toISOString(),
    });
    added += 1;
  }

  file.lastScanAt = new Date().toISOString();
  await saveLeads(file);
  log(`Leads: ${added} new.`);
  return { added, skipped: null };
}

export async function updateLead(id: string, status: Lead["status"]): Promise<Lead> {
  const file = await loadLeads();
  const lead = file.leads.find((item) => item.id === id);
  if (!lead) throw new Error("Lead not found.");
  lead.status = status;
  await saveLeads(file);
  return lead;
}
