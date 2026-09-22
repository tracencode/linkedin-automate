import type { HistoryEntry, HistoryFile } from "../types.ts";

/** Normalize post body so tiny whitespace/hashtag drift still matches. */
export function fingerprintPost(text: string): string {
  return text
    .toLowerCase()
    .replace(/#[a-z0-9_]+/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function publishedFingerprints(history: HistoryFile): Set<string> {
  const set = new Set<string>();
  for (const post of history.posts) {
    if (post.dryRun) continue;
    const fp = fingerprintPost(post.text);
    if (fp) set.add(fp);
  }
  return set;
}

export function alreadyPublished(history: HistoryFile, text: string): boolean {
  const fp = fingerprintPost(text);
  if (!fp) return false;
  return publishedFingerprints(history).has(fp);
}

export function historyFiles(history: HistoryFile): Set<string> {
  return new Set(
    history.posts.filter((post) => !post.dryRun && post.file).map((post) => post.file as string),
  );
}

export function isSamePost(a: HistoryEntry | { text: string }, b: { text: string }): boolean {
  return fingerprintPost(a.text) === fingerprintPost(b.text);
}
