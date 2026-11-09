import type { AppConfig } from "../config.ts";
import { log } from "../log.ts";
import { getValidAccess } from "../linkedin/oauth.ts";
import { createComment } from "../linkedin/comments.ts";
import { draftLeadComment } from "./draftComment.ts";
import { searchLeadPosts } from "./search.ts";
import { leadId, loadLeads, postUrnFromUrl, saveLeads, type Lead } from "./store.ts";

const SCAN_GAP_MS = 3 * 60 * 60 * 1000;

export async function addLeadUrl(config: AppConfig, url: string): Promise<Lead> {
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
    postUrn: postUrnFromUrl(key),
    comment: "",
    status: "new",
    foundAt: new Date().toISOString(),
  };
  lead.comment = await draftLeadComment(config, lead);
  lead.status = lead.comment ? "drafted" : "failed";
  file.leads.unshift(lead);
  await saveLeads(file);
  return lead;
}

export async function scanLeads(config: AppConfig, options: { force?: boolean } = {}) {
  const file = await loadLeads();
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
      postUrn: postUrnFromUrl(hit.url),
      comment: "",
      status: "new",
      foundAt: new Date().toISOString(),
    });
    added += 1;
  }

  let drafted = 0;
  const pending = file.leads.filter((lead) => lead.status === "new" && !lead.comment).slice(0, 6);
  for (const lead of pending) {
    try {
      lead.comment = await draftLeadComment(config, lead);
      lead.status = "drafted";
      drafted += 1;
    } catch (error) {
      lead.status = "failed";
      lead.error = error instanceof Error ? error.message : String(error);
    }
  }

  file.lastScanAt = new Date().toISOString();
  await saveLeads(file);

  let commented = 0;
  if (config.autoComment) {
    commented = await commentReadyLeads(config);
  }
  log(`Leads: ${added} new, ${drafted} comments drafted, ${commented} posted.`);
  return { added, drafted, commented, skipped: null };
}

export async function commentOnLead(config: AppConfig, id: string): Promise<Lead> {
  const file = await loadLeads();
  const lead = file.leads.find((item) => item.id === id);
  if (!lead) throw new Error("Lead not found.");
  if (!lead.comment.trim()) throw new Error("Write a comment before posting it.");
  const urn = lead.postUrn ?? postUrnFromUrl(lead.url);
  if (!urn) {
    throw new Error("This result has no LinkedIn post id. Copy the comment and post it on the thread yourself.");
  }
  const tokens = await getValidAccess(config);
  await createComment(config, tokens.accessToken, tokens.personUrn, urn, lead.comment.trim());
  lead.postUrn = urn;
  lead.status = "commented";
  lead.commentedAt = new Date().toISOString();
  lead.error = undefined;
  await saveLeads(file);
  return lead;
}

async function commentReadyLeads(config: AppConfig): Promise<number> {
  const file = await loadLeads();
  const today = new Date().toISOString().slice(0, 10);
  const used = file.leads.filter((lead) => lead.commentedAt?.slice(0, 10) === today).length;
  let room = config.commentDailyMax - used;
  let posted = 0;
  for (const lead of file.leads) {
    if (room <= 0) break;
    if (lead.status !== "drafted" || !lead.comment.trim()) continue;
    if (!lead.postUrn && !postUrnFromUrl(lead.url)) continue;
    try {
      await commentOnLead(config, lead.id);
      posted += 1;
      room -= 1;
    } catch (error) {
      lead.status = "failed";
      lead.error = error instanceof Error ? error.message : String(error);
      await saveLeads(await reloadWithError(lead));
      break;
    }
  }
  return posted;
}

async function reloadWithError(lead: Lead): Promise<{ lastScanAt?: string; leads: Lead[] }> {
  const file = await loadLeads();
  const current = file.leads.find((item) => item.id === lead.id);
  if (current) {
    current.status = lead.status;
    current.error = lead.error;
  }
  return file;
}
