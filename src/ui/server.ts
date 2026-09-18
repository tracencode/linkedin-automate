import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { loadConfig } from "../config.ts";
import { generatePost } from "../content/generate.ts";
import {
  approveDraft,
  deletePost,
  getPost,
  loadHistory,
  saveDraft,
  saveQueued,
  updatePost,
} from "../content/queue.ts";
import { getDashboard } from "../dashboard.ts";
import { log } from "../log.ts";
import { MEDIA_DIR, PROFILE_PATH, ROOT, TOPICS_PATH } from "../paths.ts";
import { fillQueue, seedRuntimeStore } from "../content/fillQueue.ts";
import { generateLinkedInImage, parseImageMode } from "../content/image.ts";
import { publishNext, runScheduled } from "../schedule/run.ts";
import { shouldRunNow, zonedParts } from "../schedule/shouldPost.ts";
import { FORMATS, type Format } from "../types.ts";

const hosted = Boolean(process.env.RENDER);
const HOST = hosted ? "0.0.0.0" : "127.0.0.1";
const PORT = Number(process.env.PORT ?? process.env.UI_PORT ?? 4567);
const UI_PASSWORD = process.env.UI_PASSWORD?.trim();
const PUBLIC_DIR = path.join(ROOT, "src/ui/public");

function isAuthorized(req: import("node:http").IncomingMessage): boolean {
  if (!UI_PASSWORD) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const password = sep === -1 ? decoded : decoded.slice(sep + 1);
  return password === UI_PASSWORD;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  if (Buffer.isBuffer(body)) {
    res.end(body);
    return;
  }
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function serveStatic(urlPath: string, res: import("node:http").ServerResponse) {
  const relative = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, "Forbidden", "text/plain");
    return;
  }
  if (!existsSync(filePath)) {
    send(res, 404, "Not found", "text/plain");
    return;
  }
  const ext = path.extname(filePath);
  send(res, 200, await readFile(filePath), MIME[ext] ?? "application/octet-stream");
}

async function serveMedia(urlPath: string, res: import("node:http").ServerResponse) {
  const fileName = decodeURIComponent(urlPath.replace(/^\/media\//, ""));
  const filePath = path.normalize(path.join(MEDIA_DIR, path.basename(fileName)));
  if (!filePath.startsWith(MEDIA_DIR) || !existsSync(filePath)) {
    send(res, 404, "Not found", "text/plain");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, await readFile(filePath), MIME[ext] ?? "application/octet-stream");
}

async function handleApi(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  url: URL,
) {
  const config = loadConfig();
  const method = req.method ?? "GET";
  const route = url.pathname;

  try {
    if (route === "/api/status" && method === "GET") {
      send(res, 200, await getDashboard(config));
      return;
    }

    if (route === "/api/profile" && method === "PUT") {
      const body = await readJson(req);
      if (typeof body.profile === "string") {
        await writeFile(PROFILE_PATH, body.profile, "utf8");
      }
      if (typeof body.topics === "string") {
        await writeFile(TOPICS_PATH, body.topics, "utf8");
      }
      send(res, 200, await getDashboard(config));
      return;
    }

    if (route === "/api/drafts" && method === "POST") {
      const body = await readJson(req);
      const history = await loadHistory();
      const format = (FORMATS as readonly string[]).includes(String(body.format ?? ""))
        ? (body.format as Format)
        : undefined;
      const generated = await generatePost(config, history.posts, {
        topic: typeof body.topic === "string" ? body.topic : undefined,
        format,
        image: parseImageMode(body.image),
      });
      const draft = await saveDraft(generated);
      send(res, 201, { draft, generated });
      return;
    }

    if (route === "/api/queue" && method === "POST") {
      const body = await readJson(req);
      if (typeof body.text !== "string" || body.text.trim().length < 20) {
        send(res, 400, { error: "Write a bit more before queueing a post." });
        return;
      }
      const queued = await saveQueued({
        text: body.text,
        topic: typeof body.topic === "string" ? body.topic : "manual",
      });
      send(res, 201, { queued });
      return;
    }

    const addImage = route.match(/^\/api\/(drafts|queue)\/([^/]+)\/image$/);
    if (addImage && method === "POST") {
      const kind = addImage[1] === "drafts" ? "draft" : "queue";
      const fileName = decodeURIComponent(addImage[2] ?? "");
      const post = await getPost(kind, fileName);
      const stem = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${fileName.replace(/\.md$/, "")}`.slice(0, 80);
      const image = await generateLinkedInImage(config, {
        prompt: post.topic || post.text.split("\n")[0] || "Odoo, applied AI, and practical software in a workshop",
        fileStem: stem.replace(/[^a-zA-Z0-9-]+/g, "-"),
      });
      const updated = await updatePost(kind, fileName, { image });
      send(res, 201, { post: updated, image });
      return;
    }

    const approve = route.match(/^\/api\/drafts\/([^/]+)\/approve$/);
    if (approve && method === "POST") {
      const queued = await approveDraft(decodeURIComponent(approve[1] ?? ""));
      send(res, 200, { queued });
      return;
    }

    const update = route.match(/^\/api\/(drafts|queue)\/([^/]+)$/);
    if (update && method === "PUT") {
      const kind = update[1] === "drafts" ? "draft" : "queue";
      const body = await readJson(req);
      const post = await updatePost(kind, decodeURIComponent(update[2] ?? ""), {
        text: typeof body.text === "string" ? body.text : undefined,
        topic: typeof body.topic === "string" ? body.topic : undefined,
        image: body.image === null ? null : typeof body.image === "string" ? body.image : undefined,
      });
      send(res, 200, { post });
      return;
    }

    if (update && method === "DELETE") {
      const kind = update[1] === "drafts" ? "draft" : "queue";
      await deletePost(kind, decodeURIComponent(update[2] ?? ""));
      send(res, 200, { ok: true });
      return;
    }

    if (route === "/api/publish" && method === "POST") {
      const body = await readJson(req);
      if (body.from === "draft" && typeof body.fileName === "string") {
        await approveDraft(body.fileName);
      }
      const published = await publishNext(config, {
        dryRun: body.dryRun === true,
        ignoreSchedule: true,
        allowGenerate: body.generate === true,
        fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      });
      send(res, 200, published);
      return;
    }

    send(res, 404, { error: "Unknown API route" });
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function startScheduler() {
  const config = loadConfig();
  log(
    `Scheduler on (${config.schedule.cadence} at ${String(config.schedule.hour).padStart(2, "0")}:${String(config.schedule.minute).padStart(2, "0")} ${config.schedule.timezone})`,
  );
  const tick = async () => {
    const history = await loadHistory();
    const now = zonedParts(new Date(), config.schedule.timezone);
    const last = history.posts.find((post) => post.dateLocal === now.dateLocal && !post.dryRun)?.dateLocal;
    const decision = shouldRunNow({
      timeZone: config.schedule.timezone,
      cadence: config.schedule.cadence,
      hour: config.schedule.hour,
      minute: config.schedule.minute,
      weekday: config.schedule.weekday,
      lastPostedLocalDate: last,
    });
    if (!decision.run) return;
    log(decision.reason);
    await runScheduled(config);
  };
  tick().catch((error) => console.error(error));
  setInterval(() => {
    tick().catch((error) => console.error(error instanceof Error ? error.message : error));
  }, 30_000);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") {
    send(res, 200, { ok: true });
    return;
  }
  if (hosted && UI_PASSWORD && !isAuthorized(req)) {
    res.writeHead(401, {
      "WWW-Authenticate": 'Basic realm="Personal Poster"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end("Password required");
    return;
  }
  if (url.pathname.startsWith("/media/")) {
    serveMedia(url.pathname, res).catch(() => send(res, 500, "Error", "text/plain"));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((error) => {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
    return;
  }
  serveStatic(url.pathname, res).catch(() => send(res, 500, "Error", "text/plain"));
});

server.listen(PORT, HOST, () => {
  log(`Desk UI: http://${HOST}:${PORT}`);
  seedRuntimeStore()
    .then(() => startScheduler())
    .then(() => fillQueue(loadConfig()))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  if (!hosted) {
    const href = `http://127.0.0.1:${PORT}`;
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", href] : [href];
    execFile(cmd, args, () => {
      /* ignore */
    });
  }
});
