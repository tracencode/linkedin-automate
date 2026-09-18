import { existsSync } from "node:fs";
import type { AppConfig } from "../config.ts";
import { mediaFilePath } from "../content/image.ts";
import { uploadFeedImage } from "./media.ts";

export type CreatePostResult = {
  id: string;
};

export async function createPost(
  config: AppConfig,
  accessToken: string,
  authorUrn: string,
  text: string,
  imageFileName?: string,
): Promise<CreatePostResult> {
  if (imageFileName && existsSync(mediaFilePath(imageFileName))) {
    const asset = await uploadFeedImage(accessToken, authorUrn, imageFileName);
    return createUgcPost(accessToken, authorUrn, text, asset);
  }
  if (config.linkedin.postApi === "rest") {
    return createRestPost(config, accessToken, authorUrn, text);
  }
  return createUgcPost(accessToken, authorUrn, text);
}

/** @deprecated use createPost */
export async function createTextPost(
  config: AppConfig,
  accessToken: string,
  authorUrn: string,
  text: string,
): Promise<CreatePostResult> {
  return createPost(config, accessToken, authorUrn, text);
}

async function createUgcPost(
  accessToken: string,
  authorUrn: string,
  text: string,
  imageAsset?: string,
): Promise<CreatePostResult> {
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
  };
  if (imageAsset) {
    shareContent.media = [
      {
        status: "READY",
        media: imageAsset,
      },
    ];
  }

  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": shareContent,
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });

  return parseCreateResponse(response, "ugc");
}

async function createRestPost(
  config: AppConfig,
  accessToken: string,
  authorUrn: string,
  text: string,
): Promise<CreatePostResult> {
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": config.linkedin.apiVersion,
    },
    body: JSON.stringify({
      author: authorUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  return parseCreateResponse(response, "rest");
}

async function parseCreateResponse(response: Response, api: string): Promise<CreatePostResult> {
  const id = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");
  if (response.status === 201 && id) {
    return { id };
  }

  let details = await response.text();
  try {
    details = JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    /* keep text */
  }

  throw new Error(
    `LinkedIn ${api} post failed (${response.status}). ${hintForStatus(response.status)}\n${details}`,
  );
}

function hintForStatus(status: number): string {
  if (status === 401) return "Token is invalid or expired. Run `npm run auth` again.";
  if (status === 403) {
    return "Your app needs the Share on LinkedIn product (w_member_social) in the LinkedIn Developer Portal.";
  }
  if (status === 426) {
    return "REST Posts API rejected the version header. Try LINKEDIN_POST_API=ugc (recommended for personal apps).";
  }
  return "";
}
