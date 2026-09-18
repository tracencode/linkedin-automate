import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..");
export const STORE = path.resolve(process.env.STORE_DIR || ROOT);
export const CONTENT_DIR = path.join(STORE, "content");
export const REPO_CONTENT_DIR = path.join(ROOT, "content");
export const DRAFTS_DIR = path.join(CONTENT_DIR, "drafts");
export const QUEUE_DIR = path.join(CONTENT_DIR, "queue");
export const HISTORY_DIR = path.join(CONTENT_DIR, "history");
export const DATA_DIR = path.join(STORE, ".data");
export const TOKENS_PATH = path.join(DATA_DIR, "tokens.json");
export const HISTORY_PATH = path.join(CONTENT_DIR, "history.json");
export const PROFILE_PATH = path.join(REPO_CONTENT_DIR, "profile.md");
export const TOPICS_PATH = path.join(REPO_CONTENT_DIR, "topics.md");
export const MEDIA_DIR = path.join(CONTENT_DIR, "media");
