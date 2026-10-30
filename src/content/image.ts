import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.ts";
import { MEDIA_DIR } from "../paths.ts";
import type { Format } from "../types.ts";

export type ImageMode = "auto" | "yes" | "no";

const COLOR_STYLES = [
  "Bold isometric scene with neon teal, coral, and amber on deep indigo — high saturation, no beige",
  "Cinematic still with electric magenta rim light, cobalt shadows, and warm gold highlights",
  "Playful paper-craft diorama in lime, tangerine, hot pink, and ultramarine",
  "Abstract data-flow sculpture in emerald, sapphire, ruby, and metallic gold",
  "Watercolor-meets-tech wash in vivid aqua, violet, marigold, and crimson",
  "Glass and light refraction study with prismatic rainbow caustics over a tech subject",
  "Retro-futurist poster vibe: cherry red, chrome cyan, sunflower yellow, matte black accents",
  "Soft 3D clay render with candy colors — mint, peach, periwinkle, and butter yellow",
  "Night-city neon: hot pink, acid green, deep purple, and ice-blue reflections",
  "Sunlit workshop table with saturated props — turquoise tools, orange cables, indigo screens",
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
  const jitter = Math.floor(Math.random() * COLOR_STYLES.length);
  return COLOR_STYLES[(hash + jitter) % COLOR_STYLES.length] ?? COLOR_STYLES[0]!;
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
    "Editorial visual for a LinkedIn post about applied AI, ERP, or practical software.",
    `Look and color direction (mandatory): ${style}.`,
    "Use at least four distinct bright hues in the frame. Never monochrome, never gray-only, never flat corporate blue wash, never muted beige.",
    "Photoreal, clean 3D, or rich illustration — pick one look and commit. Strong contrast and mixed lighting.",
    "No readable text, letters, logos, watermarks, charts with labels, or fake software UI screens.",
    "No celebrity likeness. No extra limbs. Professional, not stock-photo grinning.",
    `Subject: ${input.prompt.trim()}`,
  ].join(" ");

  const models = uniqueModels(config.openai.imageModel);
  let lastError = "No image model succeeded.";
  let imageBytes: Buffer | undefined;

  for (const model of models) {
    const size = model.includes("gpt-image")
      ? "1536x1024"
      : model.includes("dall-e-2")
        ? "1024x1024"
        : "1792x1024";
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
      }),
    });
    const payload = (await response.json()) as {
      data?: { b64_json?: string; url?: string }[];
      error?: { message?: string };
    };
    if (!response.ok) {
      lastError = `Image generation failed (${response.status}): ${payload.error?.message ?? JSON.stringify(payload)}`;
      continue;
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
        lastError = `Could not download generated image (${image.status})`;
        continue;
      }
      imageBytes = Buffer.from(await image.arrayBuffer());
      break;
    }
    lastError = "Image API returned neither base64 nor a URL.";
  }

  if (!imageBytes) {
    throw new Error(lastError);
  }

  await mkdir(MEDIA_DIR, { recursive: true });
  const fileName = `${input.fileStem}.png`;
  const filePath = path.join(MEDIA_DIR, fileName);
  await writeFile(filePath, imageBytes);
  return fileName;
}

function uniqueModels(preferred: string): string[] {
  return [
    ...new Set([
      preferred,
      "gpt-image-1.5",
      "gpt-image-2",
      "gpt-image-1-mini",
      "chatgpt-image-latest",
      "gpt-image-1",
    ]),
  ];
}
