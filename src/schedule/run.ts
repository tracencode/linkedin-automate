import type { AppConfig } from "../config.ts";
import { generatePost } from "../content/generate.ts";
import {
  appendHistory,
  archivePosted,
  listDrafts,
  listQueue,
  loadHistory,
  postedOnLocalDate,
  saveDraft,
  takeNextQueued,
} from "../content/queue.ts";
import { createPost } from "../linkedin/client.ts";
import { getValidAccess } from "../linkedin/oauth.ts";
import { log } from "../log.ts";
import { fillQueue } from "../content/fillQueue.ts";
import { isScheduledDay, zonedParts } from "./shouldPost.ts";
import type { HistoryEntry, PostDoc } from "../types.ts";

export type RunOptions = {
  dryRun?: boolean;
  ignoreSchedule?: boolean;
  allowGenerate?: boolean;
  fileName?: string;
  fileText?: {
    text: string;
    source: HistoryEntry["source"];
    file?: string;
    format?: string;
    topic?: string;
    image?: string;
  };
};

export async function publishNext(config: AppConfig, options: RunOptions = {}) {
  const history = await loadHistory();
  const dateLocal = zonedParts(new Date(), config.schedule.timezone).dateLocal;

  let doc: PostDoc | undefined;
  let source: HistoryEntry["source"] = "queue";

  if (options.fileText) {
    source = options.fileText.source;
    doc = {
      filePath: options.fileText.file ?? "",
      fileName: options.fileText.file ?? "manual.md",
      status: "queued",
      text: options.fileText.text,
      format: options.fileText.format,
      topic: options.fileText.topic,
      image: options.fileText.image,
    };
  } else if (options.fileName) {
    const queue = await listQueue();
    doc = queue.find((item) => item.fileName === options.fileName || item.filePath === options.fileName);
    if (!doc) {
      throw new Error(`Queued post not found: ${options.fileName}`);
    }
  } else {
    doc = await takeNextQueued();
    if (!doc) {
      if (!config.autoPublish && !options.allowGenerate) {
        throw new Error(
          "Queue is empty. Add files to content/queue, run `npm run draft` then `npm run approve`, or set AUTO_PUBLISH=true.",
        );
      }
      const generated = await generatePost(config, history.posts);
      doc = await saveDraft(generated);
      source = "generated";
    }
  }

  if (options.dryRun) {
    log(`Dry run — would publish:\n\n${doc.text}\n`);
    await appendHistory({
      id: "dry-run",
      postedAt: new Date().toISOString(),
      dateLocal,
      text: doc.text,
      source,
      file: doc.fileName,
      dryRun: true,
    });
    return { id: "dry-run", text: doc.text, source };
  }

  const tokens = await getValidAccess(config);
  const result = await createPost(config, tokens.accessToken, tokens.personUrn, doc.text, doc.image);

  const entry: HistoryEntry = {
    id: result.id,
    postedAt: new Date().toISOString(),
    dateLocal,
    text: doc.text,
    source,
    file: doc.fileName,
  };

  if (doc.filePath) {
    await archivePosted(doc, entry);
  } else {
    await appendHistory(entry);
  }

  log(`Published ${result.id}`);
  return { id: result.id, text: doc.text, source };
}

export async function runScheduled(config: AppConfig, options: { dryRun?: boolean; force?: boolean } = {}) {
  const history = await loadHistory();
  const now = zonedParts(new Date(), config.schedule.timezone);
  const dateLocal = now.dateLocal;

  if (!options.force && postedOnLocalDate(history, dateLocal)) {
    log(`Already posted today (${dateLocal}). Skipping.`);
    await fillQueue(config).catch((error) => {
      log(`Queue refill failed: ${error instanceof Error ? error.message : error}`);
    });
    return { skipped: true as const, reason: "already-posted" };
  }

  if (!options.force && !isScheduledDay(config.schedule.cadence, now.weekday, config.schedule.weekday)) {
    log(`Not a posting day for cadence "${config.schedule.cadence}". Skipping.`);
    await fillQueue(config).catch((error) => {
      log(`Queue refill failed: ${error instanceof Error ? error.message : error}`);
    });
    return { skipped: true as const, reason: "not-scheduled-day" };
  }

  const queue = await listQueue();
  if (queue.length === 0 && !config.autoPublish) {
    const drafts = await listDrafts();
    log(
      `No queued posts. ${drafts.length} draft(s) waiting for review. Approve one or set AUTO_PUBLISH=true.`,
    );
    await fillQueue(config).catch((error) => {
      log(`Queue refill failed: ${error instanceof Error ? error.message : error}`);
    });
    return { skipped: true as const, reason: "empty-queue" };
  }

  const published = await publishNext(config, { dryRun: options.dryRun });
  if (!options.dryRun) {
    await fillQueue(config).catch((error) => {
      log(`Queue refill failed: ${error instanceof Error ? error.message : error}`);
    });
  }
  return { skipped: false as const, published };
}
