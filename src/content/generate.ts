import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { AppConfig } from "../config.ts";
import { PROFILE_PATH, TOPICS_PATH } from "../paths.ts";
import type { Format, HistoryEntry } from "../types.ts";
import { FORMATS } from "../types.ts";
import { generateLinkedInImage, parseImageMode, shouldAttachImage, type ImageMode } from "./image.ts";
import { ensureHashtags } from "./hashtags.ts";
import { fetchTrendingHeadlines, formatTrendsForPrompt } from "./trends.ts";
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
  const headlines = await fetchTrendingHeadlines(8);
  const trendsBlock = formatTrendsForPrompt(headlines);
  if (headlines.length > 0) {
    log(`Trends loaded (${headlines.length}): ${headlines[0]}`);
  }

  const recentBlock =
    recent
      .slice(-8)
      .map((post, i) => `${i + 1}. ${post.text.slice(0, 280)}`)
      .join("\n\n") || "(none yet)";

  const system = `You write LinkedIn posts for one person. The goal is follower growth from relevant, useful posts — not engagement bait.

Niche lock (non-negotiable):
- Lead with applied AI. Roughly 7 of every 10 posts should be AI-primary (agents, LLMs, RAG, copilots, document AI, evals, automation) tied to real ops/ERP/software work.
- Odoo / ERP / integrations are supporting context, not the default headline — use them when they sharpen an AI ops story.
- Every post must react to something circulating now: pick ONE headline from the trending list (or a clearly related current AI news beat) and give a practitioner take. Do not paste the headline verbatim as the hook. Do not invent quotes or fake "sources said".
- No generic "AI will change everything". No hustle, personal-brand tips, or LinkedIn-about-LinkedIn.

Voice rules:
- Founder's stance, never labelled. Write as the person who owns the company, the product bets, and the customer outcome. First person.
- Never write "Founder's Perspective", "As a founder", "Wearing my founder hat", "From a founder's lens", or any role announcement.
- Prefer: what a customer asked vs what they needed, the cost of a wrong AI bet, why we pushed back, what we refuse to automate.
- Specific, a little dry. Short sentences. Sound like someone still in the database at 1am who also has to stand behind the product on Monday.
- No markdown (LinkedIn will show asterisks). No bullet-symbol walls. Short lines and white space are good.
- No "I'm thrilled to announce", "In today's fast-paced world", "Let's dive in", "game-changer", "unlock", "here's the tea", or "comment YES".
- Max 2 emojis, usually zero.
- Do not pitch a product unless the profile says that is the point of this account.
- Do not invent employers, numbers, customers, or credentials.
- Hashtags: do not put them in the post body. Return 15 specific tags in the hashtags array, biased toward AI / LLM / automation tags plus any Odoo/ERP tags that fit.
- Mix concrete tags (DocumentAI, RAG, Agents, MasterData) with niche tags (AppliedAI, OdooImplementation). No #Motivation, #Success, or junk.

Hook (non-negotiable — this is the line that has to travel):
- Line 1 only, then a blank line. LinkedIn shows this before "see more". People quote this line, not the essay under it.
- 6–12 words. One sentence. A claim, a cost, or a contradiction.
- Specific enough that an operator or engineer would stop, agree hard, or argue. If the rest of the post disappeared, the hook would still be worth repeating.
- A take on the news angle, not the headline pasted in. Not a news-wire lead.
- Do not open with a question, a greeting, "Hot take", "Unpopular opinion", "Most people", "Here's why", or a plea for comments. Save the question for the last line.

Structure:
1. Hook, exactly as above.
2. Body: 120–220 words. One idea. How this trend shows up (or fails) in real systems. The second line must not repeat the hook.
3. Close: one real question that invites a story or a disagreement, not yes/no.

Return JSON only: {"topic":"...","text":"...","hashtags":["AppliedAI","RAG"],"imagePrompt":"one concrete visual metaphor a business reader would recognize, realistic objects or architecture, no words in the picture","newsAngle":"which headline or beat you used"}`;

  const user = `Author profile:
${profile}

Topic bank (prefer AI-heavy lines):
${topics || "(use the profile pillars)"}

Trending AI / tech headlines right now (react to one):
${trendsBlock}

Today's format: ${format}
Suggested angle: ${topicHint}

Recently published (do not repeat these ideas or openings):
${recentBlock}`;

  const requestDraft = async (extra: string) => {
    const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.openai.model,
        temperature: 0.85,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: extra ? `${user}\n\n${extra}` : user },
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

    return JSON.parse(content) as {
      topic?: string;
      text?: string;
      imagePrompt?: string;
      hashtags?: unknown;
    };
  };

  let parsed = await requestDraft("");
  let topic = parsed.topic || topicHint;
  let suggested = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.filter((tag): tag is string => typeof tag === "string")
    : [];
  let text = ensureHashtags(shapeHook(cleanPost(parsed.text ?? "")), topic, suggested);
  if (!hookIsStrong(text)) {
    log("Opening line was too soft. Rewriting the hook.");
    parsed = await requestDraft(
      "Rewrite the post. The first line failed. It must be 6–12 words, its own line, then a blank line: a claim, a cost, or a contradiction someone would quote. Do not open with a question.",
    );
    topic = parsed.topic || topicHint;
    suggested = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((tag): tag is string => typeof tag === "string")
      : [];
    text = ensureHashtags(shapeHook(cleanPost(parsed.text ?? "")), topic, suggested);
  }
  if (text.length < 80 || !hookIsStrong(text)) {
    throw new Error("Generated post had no usable hook. Try again.");
  }

  const result: GeneratedPost = { text, format, topic };
  const imageMode = parseImageMode(options.image ?? (config.imageChance >= 1 ? "yes" : "auto"));
  const wantImage = shouldAttachImage(format, imageMode, config.imageChance);
  if (wantImage) {
    const stem = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${topic.slice(0, 32)}`;
    result.image = await generateLinkedInImage(config, {
      prompt: parsed.imagePrompt || topic,
      fileStem: stem.replace(/[^a-zA-Z0-9-]+/g, "-"),
    });
    log(`Generated image ${result.image}`);
  }

  return result;
}

function pickFormat(count: number): Format {
  return FORMATS[count % FORMATS.length] ?? "personal_story";
}

function pickTopic(topicsFile: string | undefined, count: number): string {
  if (!topicsFile) return "Applied AI in real operations this week";
  const topics = topicsFile
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line && !line.startsWith("#"));
  if (topics.length === 0) return "Applied AI in real operations this week";

  const aiTopics = topics.filter((line) => /\b(ai|llm|rag|agent|gpt|model|ml|copilot|automat)/i.test(line));
  // ~70% of picks come from the AI-labelled lines when available.
  const preferAi = aiTopics.length > 0 && count % 10 < 7;
  const pool = preferAi ? aiTopics : topics;
  return pool[count % pool.length] ?? topics[0] ?? "Applied AI in real operations";
}

const WEAK_HOOK =
  /^(hot take|unpopular opinion|most people|here'?s why|here'?s the|let me|i'?m thrilled|in today|you won'?t|pov\b|thread\b|agree\??|thoughts\??)\b/i;

function wordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

/** First line is the shareable hook, then a blank line, then the post. */
function shapeHook(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return text;
  let hook = lines[0] ?? "";
  const rest = lines.slice(1);
  if (wordCount(hook) > 14) {
    const split = hook.match(/^(.{8,}?[.!?])\s+([\s\S]+)$/);
    const first = split?.[1]?.trim();
    const after = split?.[2]?.trim();
    if (first && after && wordCount(first) <= 14) {
      hook = first;
      rest.unshift(after);
    }
  }
  return [hook, "", ...rest].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function hookIsStrong(text: string): boolean {
  const hook = text.split("\n")[0]?.trim() ?? "";
  const words = wordCount(hook);
  if (words < 4 || words > 14) return false;
  if (hook.endsWith("?")) return false;
  if (WEAK_HOOK.test(hook)) return false;
  const body = text.split("\n").slice(1).join("\n").trim();
  return body.length >= 40;
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
