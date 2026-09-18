import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { AppConfig } from "./config.ts";
import { listDrafts, listQueue, loadHistory } from "./content/queue.ts";
import { getValidAccess, loadTokens } from "./linkedin/oauth.ts";
import { PROFILE_PATH, TOPICS_PATH } from "./paths.ts";
import { describeNextPost, listUpcomingSlots, shouldRunNow, zonedParts } from "./schedule/shouldPost.ts";

export async function getDashboard(config: AppConfig) {
  const tokens = await loadTokens(config);
  const queue = await listQueue();
  const drafts = await listDrafts();
  const history = await loadHistory();
  const now = zonedParts(new Date(), config.schedule.timezone);
  const lastPosted = history.posts.find((post) => post.dateLocal === now.dateLocal && !post.dryRun)?.dateLocal;
  const slotOpts = {
    timeZone: config.schedule.timezone,
    cadence: config.schedule.cadence,
    hour: config.schedule.hour,
    minute: config.schedule.minute,
    weekday: config.schedule.weekday,
    lastPostedLocalDate: lastPosted,
  };
  const upcoming = listUpcomingSlots({ ...slotOpts, count: Math.max(queue.length, 1) });
  const decision = shouldRunNow({
    timeZone: config.schedule.timezone,
    cadence: config.schedule.cadence,
    hour: config.schedule.hour,
    minute: config.schedule.minute,
    weekday: config.schedule.weekday,
    lastPostedLocalDate: lastPosted,
  });

  let auth = { signedIn: false, name: "not signed in", ok: false, error: "" };
  if (tokens) {
    try {
      await getValidAccess(config);
      auth = { signedIn: true, name: tokens.name ?? tokens.personUrn, ok: true, error: "" };
    } catch (error) {
      auth = {
        signedIn: true,
        name: tokens.name ?? tokens.personUrn,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const profile = existsSync(PROFILE_PATH) ? await readFile(PROFILE_PATH, "utf8") : "";
  const topics = existsSync(TOPICS_PATH) ? await readFile(TOPICS_PATH, "utf8") : "";

  return {
    auth,
    profileReady: Boolean(profile) && !profile.includes("TODO:"),
    hasOpenAi: Boolean(config.openai.apiKey),
    autoPublish: config.autoPublish,
    imageChance: config.imageChance,
    queueMin: config.queueMin,
    niche: "Odoo · AI · technology",
    schedule: {
      cadence: config.schedule.cadence,
      hour: config.schedule.hour,
      minute: config.schedule.minute,
      timezone: config.schedule.timezone,
      weekday: config.schedule.weekday,
      label: cadenceLabel(config.schedule.cadence),
      next: upcoming[0]?.label ?? describeNextPost(slotOpts),
      upcoming: upcoming.map((slot) => slot.label),
      wouldRun: decision.run,
      reason: decision.reason,
      why: "Tue–Thu 9:15 AM is when professionals are at a desk. Comments in the first hour are what actually grows a following.",
    },
    counts: {
      drafts: drafts.length,
      queued: queue.length,
      posted: history.posts.filter((post) => !post.dryRun).length,
    },
    now: {
      dateLocal: now.dateLocal,
      time: `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`,
    },
    profile,
    topics,
    drafts: drafts.map((post) => publicPost(post)),
    queue: queue.map((post, index) =>
      publicPost(post, {
        scheduledLabel: upcoming[index]?.label ?? "",
        scheduledDate: upcoming[index]?.dateLocal ?? "",
        windowOpen: upcoming[index]?.windowOpen ?? false,
      }),
    ),
    history: history.posts
      .slice()
      .reverse()
      .slice(0, 40)
      .map((post) => ({
        id: post.id,
        postedAt: post.postedAt,
        dateLocal: post.dateLocal,
        postedLabel: formatPostedAt(post.postedAt, config.schedule.timezone),
        text: post.text,
        source: post.source,
        dryRun: Boolean(post.dryRun),
      })),
  };
}

function publicPost(
  post: {
    fileName: string;
    topic?: string;
    format?: string;
    createdAt?: string;
    text: string;
    image?: string;
  },
  schedule?: { scheduledLabel: string; scheduledDate: string; windowOpen: boolean },
) {
  return {
    fileName: post.fileName,
    topic: post.topic ?? "",
    format: post.format ?? "",
    createdAt: post.createdAt ?? "",
    text: post.text,
    hook: post.text.split("\n")[0] ?? "",
    image: post.image ?? "",
    imageUrl: post.image ? `/media/${encodeURIComponent(post.image)}` : "",
    scheduledLabel: schedule?.scheduledLabel ?? "",
    scheduledDate: schedule?.scheduledDate ?? "",
    windowOpen: schedule?.windowOpen ?? false,
  };
}

function formatPostedAt(iso: string, timeZone: string): string {
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
    return `${formatted} ${timeZone}`;
  } catch {
    return iso;
  }
}

function cadenceLabel(cadence: string): string {
  if (cadence === "3x") return "Tue / Wed / Thu (peak)";
  if (cadence === "weekdays") return "Monday–Friday";
  if (cadence === "weekly") return "Once a week";
  return "Every day";
}
