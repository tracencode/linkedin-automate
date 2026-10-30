import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.ts";
import { MEDIA_DIR } from "../paths.ts";
import type { Format } from "../types.ts";

export type ImageMode = "auto" | "yes" | "no";

const EDITORIAL_LOOKS = [
  "Quiet architectural still: glass, stone, and one precise object in a navy atrium, soft north light, large empty space",
  "Charcoal desk still life: one closed notebook, a matte ceramic vessel, warm white light, no clutter",
  "Machined metal planes interlocking like a system, muted blue edge light, white void, clean geometry",
  "Consulting-report model: a small plaster and navy-glass city block on a limestone plinth, overhead soft light",
  "Frosted glass panels and a single thin brass line, deep navy, charcoal, off-white, refined texture",
  "Calm infrastructure as architecture: a quiet server hall in cool grey with one amber indicator, not science fiction",
  "Thick cotton paper and a graphite diagram with no readable words, soft shadow, magazine crop",
  "Single split stone sphere on a dark plinth, studio charcoal, one muted copper accent",
  "Linen, steel, and window light in a corner of a boardroom, deep shadow, editorial restraint",
  "Layered concrete and oak planes with one empty chair, a faint cool screen glow, generous negative space",
];

export function parseImageMode(value: unknown): ImageMode {
  if (value === "yes" || value === "no" || value === "auto") return value;
  return "auto";
}

export function shouldAttachImage(_format: Format, mode: ImageMode, chance: number): boolean {
  if (mode === "yes") return true;
  if (mode === "no") return false;
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return Math.random() < chance;
}

export function mediaFilePath(fileName: string): string {
  const safe = path.basename(fileName);
  if (!safe || safe !== fileName.replace(/^.*[/\\]/, "")) {
    throw new Error("Invalid image file name");
  }
  return path.join(MEDIA_DIR, safe);
}

function pickStyle(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const jitter = Math.floor(Math.random() * EDITORIAL_LOOKS.length);
  return EDITORIAL_LOOKS[(hash + jitter) % EDITORIAL_LOOKS.length] ?? EDITORIAL_LOOKS[0]!;
}

export async function generateLinkedInImage(
  config: AppConfig,
  input: { prompt: string; fileStem: string },
): Promise<string> {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images.");
  }

  const style = pickStyle(input.fileStem + input.prompt);
  const prompt = [
    "Premium editorial visual for a B2B technology company's LinkedIn thought-leadership article.",
    "Art direction: modern corporate editorial illustration. Sophisticated, minimal, visually balanced. Inspired by premium technology publications, enterprise consulting reports, and professional business magazines.",
    "Wide 16:9 landscape. One clear focal point. Generous negative space. Clean uncluttered background. Polished in a LinkedIn feed.",
    `Composition (mandatory): ${style}.`,
    "Palette: deep navy, charcoal, muted blue, white, and at most one subtle accent. Restrained and elegant. Professional lighting, refined textures, clean geometry.",
    "Communicate the idea through a strong visual metaphor: realistic objects, subtle 3D, architectural composition, or a refined conceptual illustration. Not a literal cartoon scene.",
    "Strictly avoid: cartoon characters, cute robots, mascots, children's-book styles, bright rainbow or oversaturated color, playful toy-like 3D, emoji graphics, generic futuristic AI stock, neon, excessive decoration.",
    "No readable text, letters, logos, watermarks, charts with labels, or fake software UI. No celebrity likeness. No extra limbs.",
    "Overall impression: intelligent, credible, premium, enterprise-grade, professionally art-directed.",
    `Metaphor for this post: ${input.prompt.trim()}`,
  ].join(" ");

  const models = uniqueModels(config.openai.imageModel);
  const errors: string[] = [];
  let imageBytes: Buffer | undefined;

  for (const model of models) {
    for (const size of ["1536x864", "1536x1024"] as const) {
      const response = await fetch(`${config.openai.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality: "high",
        }),
      });
      const payload = (await response.json()) as {
        data?: { b64_json?: string; url?: string }[];
        error?: { message?: string };
      };
      if (!response.ok) {
        const message = payload.error?.message ?? JSON.stringify(payload);
        errors.push(`${model} ${size} (${response.status}): ${message}`);
        if (/size|dimension|aspect/i.test(message)) continue;
        break;
      }
      const b64 = payload.data?.[0]?.b64_json;
      if (b64) {
        imageBytes = Buffer.from(b64, "base64");
        break;
      }
      const imageUrl = payload.data?.[0]?.url;
      if (imageUrl) {
        const image = await fetch(imageUrl);
        if (!image.ok) {
          errors.push(`${model}: could not download generated image (${image.status})`);
          continue;
        }
        imageBytes = Buffer.from(await image.arrayBuffer());
        break;
      }
      errors.push(`${model}: Image API returned neither base64 nor a URL.`);
      break;
    }
    if (imageBytes) break;
  }

  if (!imageBytes) {
    throw new Error(
      errors.length > 0
        ? `Image generation failed. ${errors.join(" | ")}`
        : "No image model succeeded.",
    );
  }

  await mkdir(MEDIA_DIR, { recursive: true });
  const fileName = `${input.fileStem}.png`;
  const filePath = path.join(MEDIA_DIR, fileName);
  await writeFile(filePath, imageBytes);
  return fileName;
}

const RETIRED_IMAGE_MODELS = new Set(["dall-e-2", "dall-e-3", "gpt-image-1"]);

const IMAGE_MODEL_FALLBACKS = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "gpt-image-2",
  "gpt-image-1.5",
];

function uniqueModels(preferred: string): string[] {
  return [
    ...new Set(
      [preferred, ...IMAGE_MODEL_FALLBACKS].filter(
        (model) => model && !RETIRED_IMAGE_MODELS.has(model),
      ),
    ),
  ];
}
