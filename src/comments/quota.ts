import type { AppConfig } from "../config.ts";
import { loadLeads } from "../leads/store.ts";
import { zonedParts } from "../schedule/shouldPost.ts";
import { loadComments } from "./store.ts";

export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

export async function postedToday(config: AppConfig): Promise<number> {
  const timeZone = config.schedule.timezone;
  const today = localDay(new Date().toISOString(), timeZone);
  const comments = await loadComments();
  const leads = await loadLeads();
  const commentCount = comments.comments.filter(
    (item) => item.commentedAt && localDay(item.commentedAt, timeZone) === today,
  ).length;
  const leadCount = leads.leads.filter(
    (lead) => lead.commentedAt && localDay(lead.commentedAt, timeZone) === today,
  ).length;
  return commentCount + leadCount;
}

export function postsThisRun(config: AppConfig, used: number): number {
  const room = config.commentDailyMax - used;
  if (room <= 0) return 0;
  const slots = Math.max(1, config.schedule.times.length);
  const steady = Math.ceil(config.commentDailyMax / slots);
  const now = zonedParts(new Date(), config.schedule.timezone);
  const lastHour = Math.max(...config.schedule.times.map((slot) => slot.hour));
  if (now.hour >= lastHour) return room;
  const runsLeft = config.schedule.times.filter((slot) => slot.hour >= now.hour).length || 1;
  const stillNeeded = Math.max(0, config.commentDailyMin - used);
  const mustNow = Math.max(0, stillNeeded - steady * (runsLeft - 1));
  return Math.min(room, Math.max(steady, mustNow));
}

export async function roomForThisRun(config: AppConfig): Promise<number> {
  return postsThisRun(config, await postedToday(config));
}
