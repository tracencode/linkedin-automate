import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { COMMENTS_PATH, CONTENT_DIR } from "../paths.ts";

export type CommentStatus = "new" | "drafted" | "commented" | "skipped" | "failed";

export type CommentTarget = {
  id: string;
  url: string;
  title: string;
  snippet: string;
  query: string;
  score: number;
  postUrn?: string;
  comment: string;
  status: CommentStatus;
  error?: string;
  foundAt: string;
  commentedAt?: string;
};

type CommentFile = {
  lastScanAt?: string;
  comments: CommentTarget[];
};

export function commentId(url: string): string {
  return createHash("sha1").update(`comment:${url}`).digest("hex").slice(0, 12);
}

export function postUrnFromUrl(url: string): string | undefined {
  const named = url.match(/urn:li:(?:activity|share|ugcPost):\d+/);
  if (named) return named[0];
  const activity = url.match(/activity[-:](\d{10,})/);
  if (activity) return `urn:li:activity:${activity[1]}`;
  return undefined;
}

export async function loadComments(): Promise<CommentFile> {
  if (!existsSync(COMMENTS_PATH)) return { comments: [] };
  const parsed = JSON.parse(await readFile(COMMENTS_PATH, "utf8")) as CommentFile;
  return { lastScanAt: parsed.lastScanAt, comments: parsed.comments ?? [] };
}

export async function saveComments(file: CommentFile) {
  await mkdir(CONTENT_DIR, { recursive: true });
  const comments = file.comments
    .slice()
    .sort((a, b) => b.foundAt.localeCompare(a.foundAt))
    .slice(0, 80);
  await writeFile(COMMENTS_PATH, JSON.stringify({ ...file, comments }, null, 2) + "\n", "utf8");
}

export async function listOpenComments(): Promise<CommentTarget[]> {
  const file = await loadComments();
  return file.comments.filter((item) => item.status !== "skipped");
}
