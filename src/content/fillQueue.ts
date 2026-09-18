import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.ts";
import { generatePost } from "./generate.ts";
import { listQueue, loadHistory, saveQueued } from "./queue.ts";
import { log } from "../log.ts";
import { MEDIA_DIR, QUEUE_DIR, REPO_CONTENT_DIR, ROOT, STORE } from "../paths.ts";

export async function seedRuntimeStore() {
  if (path.resolve(STORE) === path.resolve(ROOT)) return;
  await mkdir(QUEUE_DIR, { recursive: true });
  await mkdir(MEDIA_DIR, { recursive: true });
  const seeded = await listQueue();
  if (seeded.length === 0) {
    const repoQueue = path.join(REPO_CONTENT_DIR, "queue");
    if (existsSync(repoQueue)) {
      await cp(repoQueue, QUEUE_DIR, { recursive: true });
      log("Seeded queue from the git repository");
    }
  }
  const repoMedia = path.join(REPO_CONTENT_DIR, "media");
  if (existsSync(repoMedia)) {
    await cp(repoMedia, MEDIA_DIR, { recursive: true });
  }
}

export async function fillQueue(config: AppConfig): Promise<number> {
  const min = config.queueMin;
  const history = await loadHistory();
  let added = 0;
  let guard = 0;
  while ((await listQueue()).length < min && guard < min + 3) {
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
    await saveQueued(generated);
    added += 1;
    log(`Queue now has ${(await listQueue()).length}/${min}: ${generated.topic}${generated.image ? " (image)" : ""}`);
  }
  return added;
}
