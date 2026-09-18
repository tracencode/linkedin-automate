import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { DRAFTS_DIR, HISTORY_DIR, HISTORY_PATH, MEDIA_DIR, QUEUE_DIR } from "../paths.ts";
import type { HistoryEntry, HistoryFile, PostDoc } from "../types.ts";

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n")) {
    return { meta: {}, body: raw.trim() };
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: raw.trim() };
  }
  const yaml = raw.slice(4, end);
  const body = raw.slice(end + 5).trim();
  const meta: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body };
}

function serializePost(doc: Omit<PostDoc, "filePath" | "fileName">): string {
  const lines = ["---", `status: ${doc.status}`];
  if (doc.format) lines.push(`format: ${doc.format}`);
  if (doc.topic) lines.push(`topic: ${doc.topic}`);
  if (doc.createdAt) lines.push(`createdAt: ${doc.createdAt}`);
  if (doc.image) lines.push(`image: ${doc.image}`);
  lines.push("---", "", doc.text.trim(), "");
  return lines.join("\n");
}

async function readPost(filePath: string): Promise<PostDoc> {
  const raw = await readFile(filePath, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  return {
    filePath,
    fileName: path.basename(filePath),
    status: meta.status === "queued" ? "queued" : "draft",
    format: meta.format,
    topic: meta.topic,
    createdAt: meta.createdAt,
    image: meta.image,
    text: body,
  };
}

async function listMarkdown(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .sort()
    .map((name) => path.join(dir, name));
}

export async function ensureContentDirs() {
  await mkdir(DRAFTS_DIR, { recursive: true });
  await mkdir(QUEUE_DIR, { recursive: true });
  await mkdir(HISTORY_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });
}

export async function listDrafts(): Promise<PostDoc[]> {
  await ensureContentDirs();
  const files = await listMarkdown(DRAFTS_DIR);
  return Promise.all(files.map(readPost));
}

export async function listQueue(): Promise<PostDoc[]> {
  await ensureContentDirs();
  const files = await listMarkdown(QUEUE_DIR);
  return Promise.all(files.map(readPost));
}

export async function saveDraft(input: {
  text: string;
  format?: string;
  topic?: string;
  image?: string;
}): Promise<PostDoc> {
  await ensureContentDirs();
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const slug = slugify(input.topic ?? input.format ?? "post");
  const fileName = `${stamp.slice(0, 19)}-${slug}.md`;
  const filePath = path.join(DRAFTS_DIR, fileName);
  const doc: Omit<PostDoc, "filePath" | "fileName"> = {
    status: "draft",
    format: input.format,
    topic: input.topic,
    createdAt,
    image: input.image,
    text: input.text,
  };
  await writeFile(filePath, serializePost(doc), "utf8");
  return readPost(filePath);
}

export async function approveDraft(fileName?: string): Promise<PostDoc> {
  const drafts = await listDrafts();
  if (drafts.length === 0) {
    throw new Error("No drafts to approve. Run `npm run draft` first.");
  }

  const draft = fileName
    ? drafts.find((item) => item.fileName === fileName || item.filePath === fileName)
    : drafts.at(-1);

  if (!draft) {
    throw new Error(`Draft not found: ${fileName}`);
  }

  const dest = path.join(QUEUE_DIR, draft.fileName);
  const queued: Omit<PostDoc, "filePath" | "fileName"> = {
    ...draft,
    status: "queued",
  };
  await writeFile(dest, serializePost(queued), "utf8");
  await unlink(draft.filePath);
  return readPost(dest);
}

export async function takeNextQueued(): Promise<PostDoc | undefined> {
  const queue = await listQueue();
  return queue[0];
}

export async function archivePosted(doc: PostDoc, entry: HistoryEntry) {
  await ensureContentDirs();
  const dest = path.join(HISTORY_DIR, doc.fileName);
  if (existsSync(doc.filePath)) {
    await rename(doc.filePath, dest);
  } else {
    await writeFile(
      dest,
      serializePost({
        status: "queued",
        format: doc.format,
        topic: doc.topic,
        createdAt: doc.createdAt,
        image: doc.image,
        text: doc.text,
      }),
      "utf8",
    );
  }
  await appendHistory(entry);
}

export async function loadHistory(): Promise<HistoryFile> {
  if (!existsSync(HISTORY_PATH)) return { posts: [] };
  const raw = await readFile(HISTORY_PATH, "utf8");
  return JSON.parse(raw) as HistoryFile;
}

export async function appendHistory(entry: HistoryEntry) {
  const history = await loadHistory();
  history.posts.push(entry);
  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf8");
}

export function postedOnLocalDate(history: HistoryFile, dateLocal: string): boolean {
  return history.posts.some((post) => post.dateLocal === dateLocal && !post.dryRun);
}

export async function saveQueued(input: {
  text: string;
  format?: string;
  topic?: string;
  image?: string;
}): Promise<PostDoc> {
  await ensureContentDirs();
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const slug = slugify(input.topic ?? input.format ?? "post");
  const fileName = `${stamp.slice(0, 19)}-${slug}.md`;
  const filePath = path.join(QUEUE_DIR, fileName);
  await writeFile(
    filePath,
    serializePost({
      status: "queued",
      format: input.format,
      topic: input.topic,
      createdAt,
      image: input.image,
      text: input.text,
    }),
    "utf8",
  );
  return readPost(filePath);
}

export async function getPost(kind: "draft" | "queue", fileName: string): Promise<PostDoc> {
  const list = kind === "draft" ? await listDrafts() : await listQueue();
  const found = list.find((item) => item.fileName === fileName || item.filePath === fileName);
  if (!found) {
    throw new Error(`${kind} not found: ${fileName}`);
  }
  return found;
}

export async function updatePost(
  kind: "draft" | "queue",
  fileName: string,
  patch: { text?: string; topic?: string; image?: string | null },
): Promise<PostDoc> {
  const doc = await getPost(kind, fileName);
  const next = {
    ...doc,
    text: patch.text ?? doc.text,
    topic: patch.topic ?? doc.topic,
    image: patch.image === null ? undefined : (patch.image ?? doc.image),
  };
  await writeFile(doc.filePath, serializePost(next), "utf8");
  return readPost(doc.filePath);
}

export async function deletePost(kind: "draft" | "queue", fileName: string): Promise<void> {
  const doc = await getPost(kind, fileName);
  await unlink(doc.filePath);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "post";
}
