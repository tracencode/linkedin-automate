import type { AppConfig } from "../config.ts";
import { limitCommentLines } from "../comments/lines.ts";
import type { Lead } from "./store.ts";

const OFFER_OPENER = "The hard part here is the data and the go-live, not the module list.";
const OFFER_TAIL = [
  "TraceNcode implements and customizes Odoo in India and the UAE.",
  "We build the integrations, migrations, and applied AI around that.",
  "https://www.tracencode.com",
  "Send me a DM, or WhatsApp +91 97547 08777.",
];

export const OFFER_COMMENT = [OFFER_OPENER, ...OFFER_TAIL].join("\n");

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

Return exactly 5 lines. One sentence per line. Change only line 1 so it fits the post. Copy lines 2 to 5 unchanged.

${OFFER_COMMENT}

Rules:
- Exactly 5 lines. Never a 6th line. No blank lines.
- Line 1 reacts to what they asked for. One short sentence. Do not invent a client, a price, or a result.
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
  return shapeOffer(text.replace(/^["']|["']$/g, "").trim());
}

function shapeOffer(text: string): string {
  const first = limitCommentLines(text, 1) || OFFER_OPENER;
  const opener = first.length > 140 ? OFFER_OPENER : first;
  return [opener, ...OFFER_TAIL].join("\n");
}
