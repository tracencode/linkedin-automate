import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { AppConfig } from "../config.ts";
import { PROFILE_PATH, TOPICS_PATH } from "../paths.ts";
import type { Format, HistoryEntry } from "../types.ts";
import { FORMATS } from "../types.ts";
import { generateLinkedInImage, parseImageMode, shouldAttachImage, type ImageMode } from "./image.ts";
import { log } from "../log.ts";

export type GeneratedPost = {
  text: string;
  format: Format;
  topic: string;
  image?: string;
};

export async function generatePost(
  config: AppConfig,
  recent: HistoryEntry[],
  options: { topic?: string; format?: Format; image?: ImageMode } = {},
): Promise<GeneratedPost> {
  if (!config.openai.apiKey) {
    throw new Error(
      "Queue is empty and OPENAI_API_KEY is not set. Add a markdown file to content/queue or set an API key to auto-draft.",
    );
  }

  const profile = await readOptional(PROFILE_PATH);
  const topics = await readOptional(TOPICS_PATH);
  if (!profile || profile.includes("TODO:")) {
    throw new Error(
      "Fill in content/profile.md before generating posts. Replace the TODO placeholders with your niche, audience, and voice.",
    );
  }

  const format = options.format ?? pickFormat(recent.length);
  const topicHint = options.topic?.trim() || pickTopic(topics, recent.length);

  const recentBlock =
    recent
      .slice(-8)
      .map((post, i) => `${i + 1}. ${post.text.slice(0, 280)}`)
      .join("\n\n") || "(none yet)";

  const system = `You write LinkedIn posts for one person. The goal is follower growth from relevant, useful posts — not engagement bait.

Niche lock (non-negotiable):
- Every post must be about Odoo, applied AI, or practical technology (ERP, integrations, engineering judgment).
- Tie AI to a real operations or software problem. No generic "AI will change everything".
- If an angle drifts into hustle, personal-brand tips, or LinkedIn-about-LinkedIn, pull it back into Odoo/AI/tech.

Voice rules:
- First-person, specific, practitioner tone. Sound like a person who does the work.
- No markdown (LinkedIn will show asterisks). No bullet-symbol walls. Short lines and white space are good.
- No "I'm thrilled to announce", "In today's fast-paced world", "Let's dive in", "game-changer", "unlock", "here's the tea", or "comment YES".
- Max 2 emojis, usually zero.
- Do not pitch a product unless the profile says that is the point of this account.
- Do not invent employers, numbers, customers, or credentials. If a detail is missing, stay general or skip it.
- Hashtags: 0–2 from #Odoo #AI #ERP only if they fit. Put them at the end.

Structure:
1. Hook: first line, under 12 words, concrete enough to stop a scroll.
2. Body: 120–220 words. One idea. A story, a tactic, or a sharp take — not all three.
3. Close: one real question that invites a story or a disagreement, not yes/no.

Return JSON only: {"topic":"...","text":"...","imagePrompt":"one visual sentence, no words in the picture"}`;

  const user = `Author profile:
${profile}

Topic bank:
${topics || "(use the profile pillars)"}

Today's format: ${format}
Suggested angle: ${topicHint}

Recently published (do not repeat these ideas or openings):
${recentBlock}`;

  const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${payload.error?.message ?? JSON.stringify(payload)}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned an empty draft.");
  }

  const parsed = JSON.parse(content) as { topic?: string; text?: string; imagePrompt?: string };
  const text = cleanPost(parsed.text ?? "");
  if (text.length < 80) {
    throw new Error("Generated post was too short. Try again.");
  }

  const topic = parsed.topic || topicHint;
  const result: GeneratedPost = { text, format, topic };
  const imageMode = parseImageMode(options.image);
  if (shouldAttachImage(format, imageMode, config.imageChance)) {
    try {
      const stem = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${topic.slice(0, 32)}`;
      result.image = await generateLinkedInImage(config, {
        prompt: parsed.imagePrompt || topic,
        fileStem: stem.replace(/[^a-zA-Z0-9-]+/g, "-"),
      });
      log(`Generated image ${result.image}`);
    } catch (error) {
      log(`Image skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  return result;
}

function pickFormat(count: number): Format {
  return FORMATS[count % FORMATS.length] ?? "personal_story";
}

function pickTopic(topicsFile: string | undefined, count: number): string {
  if (!topicsFile) return "Use the strongest content pillar in the profile";
  const topics = topicsFile
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line && !line.startsWith("#"));
  if (topics.length === 0) return "Use the strongest content pillar in the profile";
  return topics[count % topics.length] ?? topics[0] ?? "core niche";
}

function cleanPost(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function readOptional(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) return undefined;
  return readFile(filePath, "utf8");
}
