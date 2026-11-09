/** Keep an auto comment to at most 5 short lines. */
export function limitCommentLines(text: string, maxLines = 5): string {
  const raw = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines =
    raw.length > 1 ? raw : (raw[0] ?? "").split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(0, maxLines).join("\n");
}
