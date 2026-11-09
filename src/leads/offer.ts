import type { AppConfig } from "../config.ts";
import type { Lead } from "./store.ts";

export const OFFER_COMMENT = `The usual gap on a request like this is the data and the go-live, not the list of modules.

TraceNcode implements and customizes Odoo in India and the UAE, and builds the software around it: integrations, migrations, and applied AI on the operation itself. https://www.tracencode.com

If you want to take this further, send me a DM here or a WhatsApp on +91 97547 08777.`;

export async function draftOfferComment(
  config: AppConfig,
  lead: Pick<Lead, "title" | "snippet" | "url">,
): Promise<string> {
  if (!config.openai.apiKey) return OFFER_COMMENT;
  const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You write one LinkedIn comment as Shikhar Sharma. The post is someone looking for a developer, an Odoo partner, or a development team.

Use this comment as the pattern. Keep the TraceNcode facts, the URL, and the DM / WhatsApp line. Change only the first sentence so it fits the post.

${OFFER_COMMENT}

Rules:
- 50–100 words. First person.
- Sentence 1 reacts to what they asked for. Do not invent a client, a price, or a result.
- Then say TraceNcode implements and customizes Odoo in India and the UAE, and builds the software around it: integrations, migrations, and applied AI on the operation itself.
- Include https://www.tracencode.com once.
- Close by asking them to send a DM or a WhatsApp on +91 97547 08777.
- No hashtags, no emojis.
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
  if (!response.ok || !text) return OFFER_COMMENT;
  return ensureOffer(text.replace(/^["']|["']$/g, "").trim());
}

function ensureOffer(text: string): string {
  let out = text;
  if (!/tracencode/i.test(out)) {
    out +=
      "\n\nTraceNcode implements and customizes Odoo in India and the UAE, and builds the software around it: integrations, migrations, and applied AI on the operation itself.";
  }
  if (!/tracencode\.com/i.test(out)) out += " https://www.tracencode.com";
  if (!/9754708777/.test(out.replace(/\s/g, ""))) {
    out += "\n\nIf you want to take this further, send me a DM here or a WhatsApp on +91 97547 08777.";
  }
  return out.trim();
}
