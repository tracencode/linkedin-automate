import type { AppConfig } from "../config.ts";
import { log } from "../log.ts";
import { isLinkedInPostUrl, postUrnFromUrl } from "../comments/store.ts";
import { roomForThisRun } from "../comments/quota.ts";
import { createComment } from "../linkedin/comments.ts";
import { getValidAccess } from "../linkedin/oauth.ts";
import { draftOfferComment } from "./offer.ts";
import { searchLeadPosts } from "./search.ts";
import { isRelevantLead, leadId, loadLeads, saveLeads, type Lead } from "./store.ts";

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
    postUrn: postUrnFromUrl(key),
    comment: "",
  };
  file.leads.unshift(lead);
  await saveLeads(file);
  return lead;
}

export async function scanLeads(config: AppConfig, options: { force?: boolean; post?: boolean } = {}) {
  const file = await loadLeads();
  file.leads = file.leads.filter((lead) => isRelevantLead(lead) || lead.status === "skipped");
  const last = file.lastScanAt ? Date.parse(file.lastScanAt) : 0;
  if (!options.force && Date.now() - last < SCAN_GAP_MS) {
    return { added: 0, drafted: 0, commented: 0, skipped: "recent-scan" as const };
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
      postUrn: postUrnFromUrl(hit.url),
      comment: "",
    });
    added += 1;
  }

  let drafted = 0;
  const pending = file.leads.filter((lead) => isLinkedInPostUrl(lead.url) && !lead.comment).slice(0, config.commentDailyMax);
  for (const lead of pending) {
    try {
      lead.comment = await draftOfferComment(config, lead);
      drafted += 1;
    } catch (error) {
      lead.status = "failed";
      lead.error = error instanceof Error ? error.message : String(error);
    }
  }

  file.lastScanAt = new Date().toISOString();
  await saveLeads(file);

  let commented = 0;
  if (options.post ?? config.autoComment) {
    commented = await commentOnReadyLeads(config);
  }
  log(`Leads: ${added} new, ${drafted} offer comments drafted, ${commented} posted.`);
  return { added, drafted, commented, skipped: null };
}

async function commentOnReadyLeads(config: AppConfig): Promise<number> {
  const file = await loadLeads();
  let room = await roomForThisRun(config);
  let posted = 0;
  for (const lead of file.leads) {
    if (room <= 0) break;
    if (lead.status === "commented" || lead.status === "skipped" || lead.status === "failed") continue;
    if (!lead.comment?.trim()) continue;
    if (!isLinkedInPostUrl(lead.url)) continue;
    if (!lead.postUrn && !postUrnFromUrl(lead.url)) continue;
    try {
      await postLeadComment(config, lead.id);
      posted += 1;
      room -= 1;
    } catch (error) {
      const fresh = await loadLeads();
      const current = fresh.leads.find((item) => item.id === lead.id);
      if (current) {
        current.status = "failed";
        current.error = error instanceof Error ? error.message : String(error);
        await saveLeads(fresh);
      }
      break;
    }
  }
  return posted;
}

async function postLeadComment(config: AppConfig, id: string): Promise<Lead> {
  const file = await loadLeads();
  const lead = file.leads.find((item) => item.id === id);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.comment?.trim()) throw new Error("Write a comment before posting it.");
  const urn = lead.postUrn ?? postUrnFromUrl(lead.url);
  if (!urn) throw new Error("This lead has no LinkedIn post id.");
  const tokens = await getValidAccess(config);
  await createComment(config, tokens.accessToken, tokens.personUrn, urn, lead.comment.trim());
  lead.postUrn = urn;
  lead.status = "commented";
  lead.commentedAt = new Date().toISOString();
  lead.error = undefined;
  await saveLeads(file);
  return lead;
}

export async function updateLead(id: string, status: Lead["status"]): Promise<Lead> {
  const file = await loadLeads();
  const lead = file.leads.find((item) => item.id === id);
  if (!lead) throw new Error("Lead not found.");
  lead.status = status;
  await saveLeads(file);
  return lead;
}
