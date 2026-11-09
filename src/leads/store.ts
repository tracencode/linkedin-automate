import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONTENT_DIR, LEADS_PATH } from "../paths.ts";

export type LeadStatus = "new" | "drafted" | "commented" | "skipped" | "failed";

export type Lead = {
  id: string;
  url: string;
  title: string;
  snippet: string;
  query: string;
  score: number;
  postUrn?: string;
  comment: string;
  status: LeadStatus;
  error?: string;
  foundAt: string;
  commentedAt?: string;
};

type LeadFile = {
  lastScanAt?: string;
  leads: Lead[];
};

export function leadId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

export function postUrnFromUrl(url: string): string | undefined {
  const named = url.match(/urn:li:(?:activity|share|ugcPost):\d+/);
  if (named) return named[0];
  const activity = url.match(/activity[-:](\d{10,})/);
  if (activity) return `urn:li:activity:${activity[1]}`;
  return undefined;
}

export async function loadLeads(): Promise<LeadFile> {
  if (!existsSync(LEADS_PATH)) return { leads: [] };
  const parsed = JSON.parse(await readFile(LEADS_PATH, "utf8")) as LeadFile;
  return { lastScanAt: parsed.lastScanAt, leads: parsed.leads ?? [] };
}

export async function saveLeads(file: LeadFile) {
  await mkdir(CONTENT_DIR, { recursive: true });
  const leads = file.leads
    .slice()
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt))
    .slice(0, 80);
  await writeFile(LEADS_PATH, JSON.stringify({ ...file, leads }, null, 2) + "\n", "utf8");
}

export async function listOpenLeads(): Promise<Lead[]> {
  const file = await loadLeads();
  return file.leads.filter((lead) => lead.status !== "skipped");
}
