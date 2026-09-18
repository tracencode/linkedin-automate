import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.ts";
import { MEDIA_DIR } from "../paths.ts";
import type { Format } from "../types.ts";

export type ImageMode = "auto" | "yes" | "no";

export function parseImageMode(value: unknown): ImageMode {
  if (value === "yes" || value === "no" || value === "auto") return value;
  return "auto";
}

export function shouldAttachImage(format: Format, mode: ImageMode, chance: number): boolean {
  if (mode === "yes") return true;
  if (mode === "no") return false;
  let probability = chance;
  if (format === "framework" || format === "tactical_howto") probability += 0.15;
  if (format === "question_post" || format === "personal_story") probability -= 0.2;
  probability = Math.min(0.7, Math.max(0.08, probability));
  return Math.random() < probability;
}

export function mediaFilePath(fileName: string): string {
  const safe = path.basename(fileName);
  if (!safe || safe !== fileName.replace(/^.*[/\\]/, "")) {
    throw new Error("Invalid image file name");
  }
  return path.join(MEDIA_DIR, safe);
}

export async function generateLinkedInImage(
  config: AppConfig,
  input: { prompt: string; fileStem: string },
): Promise<string> {
  if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images.");
  }

  const prompt = [
    "Editorial still for a LinkedIn post about Odoo, ERP, applied AI, or practical software.",
    "Photoreal or clean isometric. Restrained color. No readable text, letters, logos, watermarks, or fake software UI.",
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
  return [...new Set([preferred, "gpt-image-1", "dall-e-3", "dall-e-2"])];
}
