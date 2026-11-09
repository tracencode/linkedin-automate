import type { AppConfig } from "../config.ts";
import type { CommentTarget } from "./store.ts";

export async function draftComment(
  config: AppConfig,
  target: Pick<CommentTarget, "title" | "snippet" | "url">,
): Promise<string> {
  if (!config.openai.apiKey) return fallbackComment();
  const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: `You write one LinkedIn comment as Shikhar Sharma. He implements Odoo and applies AI to real operations.

Rules:
- 40–80 words. 2–4 short sentences. First person.
- React to a specific detail in the post. Add one concrete observation from doing the work.
- No company pitch, no URL, no "DM me", no hashtags, no emojis, no "great post".
- Do not invent a client story or a price.
- Return the comment text only.`,
        },
        {
          role: "user",
          content: `Post title: ${target.title}\n\nExcerpt: ${target.snippet}\n\nURL: ${target.url}`,
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !text) return fallbackComment();
  return text.replace(/^["']|["']$/g, "").trim();
}

function fallbackComment(): string {
  return `The part that usually slips is the data sitting under the workflow, not the feature list. A go-live holds when the exceptions are named before the automation is turned on.`;
}
