import type { AppConfig } from "../config.ts";
import { log } from "../log.ts";
import { zonedParts } from "../schedule/shouldPost.ts";
import { getValidAccess } from "../linkedin/oauth.ts";
import { createComment } from "../linkedin/comments.ts";
import { draftComment } from "./draft.ts";
import { searchCommentPosts } from "./search.ts";
import {
  commentId,
  loadComments,
  postUrnFromUrl,
  saveComments,
  type CommentTarget,
} from "./store.ts";

const SCAN_GAP_MS = 3 * 60 * 60 * 1000;

export async function addCommentUrl(config: AppConfig, url: string): Promise<CommentTarget> {
  const key = url.trim();
  const file = await loadComments();
  const id = commentId(key);
  const existing = file.comments.find((item) => item.id === id);
  if (existing) return existing;
  const target: CommentTarget = {
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
  target.comment = await draftComment(config, target);
  target.status = target.comment ? "drafted" : "failed";
  file.comments.unshift(target);
  await saveComments(file);
  return target;
}

export async function scanComments(config: AppConfig, options: { force?: boolean; post?: boolean } = {}) {
  const file = await loadComments();
  const last = file.lastScanAt ? Date.parse(file.lastScanAt) : 0;
  if (!options.force && Date.now() - last < SCAN_GAP_MS) {
    return { added: 0, drafted: 0, commented: 0, skipped: "recent-scan" as const };
  }

  const hits = await searchCommentPosts();
  let added = 0;
  for (const hit of hits) {
    const id = commentId(hit.url);
    if (file.comments.some((item) => item.id === id)) continue;
    file.comments.unshift({
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
  const pending = file.comments.filter((item) => item.status === "new" && !item.comment).slice(0, config.commentDailyMax);
  for (const target of pending) {
    try {
      target.comment = await draftComment(config, target);
      target.status = "drafted";
      drafted += 1;
    } catch (error) {
      target.status = "failed";
      target.error = error instanceof Error ? error.message : String(error);
    }
  }

  file.lastScanAt = new Date().toISOString();
  await saveComments(file);

  let commented = 0;
  if (options.post ?? config.autoComment) {
    commented = await commentReady(config);
  }
  log(`Comments: ${added} new, ${drafted} drafted, ${commented} posted.`);
  return { added, drafted, commented, skipped: null };
}

export async function postComment(config: AppConfig, id: string): Promise<CommentTarget> {
  const file = await loadComments();
  const target = file.comments.find((item) => item.id === id);
  if (!target) throw new Error("Comment not found.");
  if (!target.comment.trim()) throw new Error("Write a comment before posting it.");
  const urn = target.postUrn ?? postUrnFromUrl(target.url);
  if (!urn) {
    throw new Error("This result has no LinkedIn post id. Copy the comment and post it on the thread yourself.");
  }
  const tokens = await getValidAccess(config);
  await createComment(config, tokens.accessToken, tokens.personUrn, urn, target.comment.trim());
  target.postUrn = urn;
  target.status = "commented";
  target.commentedAt = new Date().toISOString();
  target.error = undefined;
  await saveComments(file);
  return target;
}

async function commentReady(config: AppConfig): Promise<number> {
  const file = await loadComments();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: config.schedule.timezone }).format(new Date());
  const used = file.comments.filter((item) => item.commentedAt && localDay(item.commentedAt, config.schedule.timezone) === today).length;
  let room = postsThisRun(config, used);
  let posted = 0;
  for (const target of file.comments) {
    if (room <= 0) break;
    if (target.status !== "drafted" || !target.comment.trim()) continue;
    if (!target.postUrn && !postUrnFromUrl(target.url)) continue;
    try {
      await postComment(config, target.id);
      posted += 1;
      room -= 1;
    } catch (error) {
      const fresh = await loadComments();
      const current = fresh.comments.find((item) => item.id === target.id);
      if (current) {
        current.status = "failed";
        current.error = error instanceof Error ? error.message : String(error);
        await saveComments(fresh);
      }
      break;
    }
  }
  return posted;
}

function postsThisRun(config: AppConfig, used: number): number {
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

function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
