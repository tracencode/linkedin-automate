import type { AppConfig } from "../config.ts";
import type { Lead } from "./store.ts";

export async function draftLeadComment(config: AppConfig, lead: Pick<Lead, "title" | "snippet" | "url">): Promise<string> {
  if (!config.openai.apiKey) {
    return fallbackComment(lead);
  }
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
          content: `You write one LinkedIn comment for Shikhar Sharma of TraceNcode (https://www.tracencode.com).
TraceNcode implements and customizes Odoo ERP (India and UAE) and builds the software around it: integrations, migrations, and applied AI on real operations. 150+ implementations. Not a freelance profile.

Rules:
- 40–80 words. 2–4 short sentences. First person.
- React to a specific detail in the post. Sound like a peer who has done the work, not a salesperson.
- One quiet line on what TraceNcode does, then the URL once. No "DM me", no "happy to hop on a call", no hashtags, no emojis.
- Do not invent a client story or a price.
- Return the comment text only.`,
        },
        {
          role: "user",
          content: `Post title: ${lead.title}\n\nExcerpt: ${lead.snippet}\n\nURL: ${lead.url}`,
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !text) return fallbackComment(lead);
  return text.replace(/^["']|["']$/g, "").trim();
}

function fallbackComment(lead: Pick<Lead, "title">): string {
  return `The hard part of a request like this is usually the data and the go-live, not the module list. We implement and customize Odoo, and we build the integrations around it, at TraceNcode. https://www.tracencode.com`;
}
