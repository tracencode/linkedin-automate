import { cp, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.ts";
import { generatePost } from "./generate.ts";
import { listQueue, loadHistory, purgePublishedFromQueue, saveQueued } from "./queue.ts";
import { fingerprintPost, historyFiles, publishedFingerprints } from "./fingerprint.ts";
import { log } from "../log.ts";
import { HISTORY_PATH, MEDIA_DIR, QUEUE_DIR, REPO_CONTENT_DIR, ROOT, STORE } from "../paths.ts";

export async function seedRuntimeStore() {
  if (path.resolve(STORE) === path.resolve(ROOT)) return;
  await mkdir(QUEUE_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });
  const repoHistory = path.join(REPO_CONTENT_DIR, "history.json");
  if (!existsSync(HISTORY_PATH) && existsSync(repoHistory)) {
    await mkdir(path.dirname(HISTORY_PATH), { recursive: true });
    await cp(repoHistory, HISTORY_PATH);
  }
  const history = await loadHistory();
  const alreadyPosted = historyFiles(history);
  const fingerprints = publishedFingerprints(history);
  const seeded = await listQueue();
  if (seeded.length === 0) {
    const repoQueue = path.join(REPO_CONTENT_DIR, "queue");
    if (existsSync(repoQueue)) {
      await cp(repoQueue, QUEUE_DIR, { recursive: true });
      const copied = await listQueue();
      for (const post of copied) {
        if (alreadyPosted.has(post.fileName) || fingerprints.has(fingerprintPost(post.text))) {
          await unlink(post.filePath);
        }
      }
      log("Seeded queue from the git repository (skipped already-published files)");
    }
  } else {
    await purgePublishedFromQueue();
  }
  const repoMedia = path.join(REPO_CONTENT_DIR, "media");
  if (existsSync(repoMedia)) {
    await cp(repoMedia, MEDIA_DIR, { recursive: true });
  }
}

export async function fillQueue(config: AppConfig): Promise<number> {
  await purgePublishedFromQueue();
  const min = config.queueMin;
  const history = await loadHistory();
  const fingerprints = publishedFingerprints(history);
  let added = 0;
  let guard = 0;
  while ((await listQueue()).length < min && guard < min + 5) {
    guard += 1;
    const queued = await listQueue();
    const recent = [
      ...history.posts,
      ...queued.map((post) => ({
        id: post.fileName,
        postedAt: post.createdAt ?? new Date().toISOString(),
        dateLocal: "",
        text: post.text,
        source: "queue" as const,
      })),
    ];
    const generated = await generatePost(config, recent, { image: "auto" });
    if (fingerprints.has(fingerprintPost(generated.text))) {
      log(`Skipped refill draft that matched an already-published post: ${generated.topic}`);
      continue;
    }
    await saveQueued(generated);
    fingerprints.add(fingerprintPost(generated.text));
    added += 1;
    log(`Queue now has ${(await listQueue()).length}/${min}: ${generated.topic}${generated.image ? " (image)" : ""}`);
  }
  const size = (await listQueue()).length;
  if (size < min) {
    throw new Error(`Queue is ${size}/${min} after refill. Check OPENAI_API_KEY and try again.`);
  }
  return added;
}

let maintaining: Promise<number> | undefined;

export async function maintainQueue(config: AppConfig): Promise<number> {
  if (!maintaining) {
    maintaining = fillQueue(config).finally(() => {
      maintaining = undefined;
    });
  }
  return maintaining;
}
