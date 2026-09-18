import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { approveDraft, listDrafts, listQueue, loadHistory, saveDraft } from "./content/queue.ts";
import { fillQueue, maintainQueue } from "./content/fillQueue.ts";
import { generatePost } from "./content/generate.ts";
import { getValidAccess, loadTokens, loginWithBrowser } from "./linkedin/oauth.ts";
import { fail, log } from "./log.ts";
import { PROFILE_PATH } from "./paths.ts";
import { publishNext, runScheduled } from "./schedule/run.ts";
import { shouldRunNow, listUpcomingSlots, zonedParts } from "./schedule/shouldPost.ts";

const HELP = `LinkedIn posting bot

Commands:
  auth                 Sign in with LinkedIn (opens a browser)
  status               Show schedule, queue, and auth
  draft                Generate a draft into content/drafts
  approve [file]       Move a draft into content/queue (latest if omitted)
  queue                List queued posts
  post [--dry-run] [--generate]
                       Publish the next queued post now
  run [--dry-run] [--force]
                       Run the daily job (used by GitHub Actions)
  start                Keep running and post on the configured schedule
  ui                   Open the local dashboard (also starts the scheduler)
  fill-queue           Generate posts until QUEUE_MIN are waiting (default 5)

Open the UI with npm run ui — http://127.0.0.1:4567
`;

type Flags = {
  dryRun: boolean;
  generate: boolean;
  force: boolean;
  positional: string[];
};

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const args = argv.slice(2);
  const flags: Flags = { dryRun: false, generate: false, force: false, positional: [] };
  let command = "help";

  for (const arg of args) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--generate") flags.generate = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--help" || arg === "-h") command = "help";
    else if (arg.startsWith("-")) fail(`Unknown flag: ${arg}`);
    else if (command === "help") command = arg;
    else flags.positional.push(arg);
  }

  return { command, flags };
}

async function main() {
  const { command, flags } = parseArgs(process.argv);
  const config = loadConfig();

  switch (command) {
    case "help":
      console.log(HELP);
      return;
    case "auth": {
      const tokens = await loginWithBrowser(config);
      log(`Signed in as ${tokens.name ?? tokens.personUrn}`);
      log(`Saved tokens to .data/tokens.json`);
      return;
    }
    case "status": {
      await printStatus(config);
      return;
    }
    case "draft": {
      const history = await loadHistory();
      const generated = await generatePost(config, history.posts);
      const draft = await saveDraft(generated);
      console.log(`\n${generated.text}\n`);
      log(`Saved draft ${draft.fileName}. Edit it, then: npm run approve -- ${draft.fileName}`);
      return;
    }
    case "approve": {
      const draft = await approveDraft(flags.positional[0]);
      log(`Queued ${draft.fileName}`);
      return;
    }
    case "queue": {
      const queue = await listQueue();
      if (queue.length === 0) {
        log("Queue is empty.");
        return;
      }
      const history = await loadHistory();
      const now = zonedParts(new Date(), config.schedule.timezone);
      const slots = listUpcomingSlots({
        count: queue.length,
        timeZone: config.schedule.timezone,
        cadence: config.schedule.cadence,
        hour: config.schedule.hour,
        minute: config.schedule.minute,
        weekday: config.schedule.weekday,
        lastPostedLocalDate: history.posts.find((post) => post.dateLocal === now.dateLocal && !post.dryRun)?.dateLocal,
      });
      for (const [index, item] of queue.entries()) {
        const preview = item.text.split("\n")[0] ?? "";
        console.log(`- ${slots[index]?.label ?? "unscheduled"}: ${preview}`);
      }
      return;
    }
    case "post": {
      const published = await publishNext(config, {
        dryRun: flags.dryRun,
        ignoreSchedule: true,
        allowGenerate: flags.generate || config.autoPublish,
      });
      if (flags.dryRun) return;
      console.log(`\n${published.text}\n`);
      return;
    }
    case "run": {
      const result = await runScheduled(config, { dryRun: flags.dryRun, force: flags.force });
      if (!result.skipped && result.published) {
        console.log(`\n${result.published.text}\n`);
      }
      return;
    }
    case "start": {
      await runDaemon(config, flags.dryRun);
      return;
    }
    case "fill-queue": {
      const added = await fillQueue(config);
      const queue = await listQueue();
      log(added === 0 ? `Queue already has ${queue.length} posts.` : `Added ${added}. Queue is ${queue.length}.`);
      return;
    }
    case "ui": {
      await import("./ui/server.ts");
      await new Promise(() => {
        /* server owns the process */
      });
      return;
    }
    default:
      fail(`Unknown command: ${command}\n\n${HELP}`);
  }
}

async function printStatus(config: ReturnType<typeof loadConfig>) {
  const tokens = await loadTokens(config);
  const queue = await listQueue();
  const drafts = await listDrafts();
  const history = await loadHistory();
  const now = zonedParts(new Date(), config.schedule.timezone);
  const lastPosted = history.posts.find((p) => p.dateLocal === now.dateLocal && !p.dryRun)?.dateLocal;
  const decision = shouldRunNow({
    timeZone: config.schedule.timezone,
    cadence: config.schedule.cadence,
    hour: config.schedule.hour,
    minute: config.schedule.minute,
    weekday: config.schedule.weekday,
    lastPostedLocalDate: lastPosted,
  });
  const next = listUpcomingSlots({
    count: 1,
    timeZone: config.schedule.timezone,
    cadence: config.schedule.cadence,
    hour: config.schedule.hour,
    minute: config.schedule.minute,
    weekday: config.schedule.weekday,
    lastPostedLocalDate: lastPosted,
  })[0];

  let authLine = "not signed in";
  if (tokens) {
    try {
      await getValidAccess(config);
      authLine = `${tokens.name ?? tokens.personUrn} (token ok)`;
    } catch (error) {
      authLine = `signed in, but token refresh failed: ${error instanceof Error ? error.message : error}`;
    }
  }

  const profileReady = existsSync(PROFILE_PATH)
    ? !(await readFile(PROFILE_PATH, "utf8")).includes("TODO:")
    : false;

  console.log(`Auth:          ${authLine}`);
  console.log(`Profile:       ${profileReady ? "ready" : "fill in content/profile.md"}`);
  console.log(`API:           ${config.linkedin.postApi}`);
  console.log(`Schedule:      ${config.schedule.cadence} at ${String(config.schedule.hour).padStart(2, "0")}:${String(config.schedule.minute).padStart(2, "0")} ${config.schedule.timezone}`);
  console.log(`Next post:     ${next?.label ?? "none"}`);
  console.log(`Auto-publish:  ${config.autoPublish ? "on (generate if queue empty)" : "off (queue only)"}`);
  console.log(`Local date:    ${now.dateLocal} ${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`);
  console.log(`Would run:     ${decision.run ? "yes" : "no"} — ${decision.reason}`);
  console.log(`Drafts:        ${drafts.length}`);
  console.log(`Queued:        ${queue.length}`);
  console.log(`Posted:        ${history.posts.filter((p) => !p.dryRun).length}`);
}

async function runDaemon(config: ReturnType<typeof loadConfig>, dryRun: boolean) {
  log(
    `Scheduler started (${config.schedule.cadence} at ${config.schedule.hour}:${String(config.schedule.minute).padStart(2, "0")} ${config.schedule.timezone}). Ctrl+C to stop.`,
  );

  const tick = async () => {
    const history = await loadHistory();
    const now = zonedParts(new Date(), config.schedule.timezone);
    const last = history.posts.find((p) => p.dateLocal === now.dateLocal && !p.dryRun)?.dateLocal;
    const decision = shouldRunNow({
      timeZone: config.schedule.timezone,
      cadence: config.schedule.cadence,
      hour: config.schedule.hour,
      minute: config.schedule.minute,
      weekday: config.schedule.weekday,
      lastPostedLocalDate: last,
    });
    if (!decision.run) {
      await maintainQueue(config).catch((error) => {
        log(`Queue refill failed: ${error instanceof Error ? error.message : error}`);
      });
      return;
    }
    log(decision.reason);
    await runScheduled(config, { dryRun });
  };

  await tick();
  setInterval(() => {
    tick().catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }, 30_000);

  await new Promise(() => {
    /* run until killed */
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
