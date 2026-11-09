import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { scoreLead } from "./queries.ts";
import { CONTENT_DIR, LEADS_PATH } from "../paths.ts";

export type LeadStatus = "new" | "saved" | "contacted" | "skipped";

export type Lead = {
  id: string;
  url: string;
  title: string;
  snippet: string;
  query: string;
  score: number;
  status: LeadStatus;
  foundAt: string;
};

type LeadFile = {
  lastScanAt?: string;
  leads: Lead[];
};

export function leadId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

export async function loadLeads(): Promise<LeadFile> {
  if (!existsSync(LEADS_PATH)) return { leads: [] };
  const parsed = JSON.parse(await readFile(LEADS_PATH, "utf8")) as {
    lastScanAt?: string;
    leads?: Array<Partial<Lead> & { url?: string; status?: string }>;
  };
  return {
    lastScanAt: parsed.lastScanAt,
    leads: (parsed.leads ?? []).flatMap((lead) => {
      if (!lead.url || !lead.id) return [];
      return [
        {
          id: lead.id,
          url: lead.url,
          title: lead.title || lead.url,
          snippet: lead.snippet || "",
          query: lead.query || "",
          score: lead.score ?? 0,
          status: normalizeStatus(lead.status),
          foundAt: lead.foundAt || new Date().toISOString(),
        },
      ];
    }),
  };
}

export async function saveLeads(file: LeadFile) {
  await mkdir(CONTENT_DIR, { recursive: true });
  const leads = file.leads
    .slice()
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt))
    .slice(0, 80);
  await writeFile(LEADS_PATH, JSON.stringify({ ...file, leads }, null, 2) + "\n", "utf8");
}

export function isRelevantLead(lead: Pick<Lead, "title" | "snippet" | "url" | "query" | "status">): boolean {
  if (lead.status === "skipped") return false;
  if (lead.query === "manual" || lead.status === "saved" || lead.status === "contacted") return true;
  return scoreLead(`${lead.title} ${lead.snippet}`, lead.url) >= 3;
}

export async function listOpenLeads(): Promise<Lead[]> {
  const file = await loadLeads();
  return file.leads.filter((lead) => isRelevantLead(lead));
}

function normalizeStatus(status: string | undefined): LeadStatus {
  if (status === "saved" || status === "contacted" || status === "skipped") return status;
  if (status === "commented") return "contacted";
  return "new";
}
