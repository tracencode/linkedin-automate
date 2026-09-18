import { readFile } from "node:fs/promises";
import { mediaFilePath } from "../content/image.ts";

export async function uploadFeedImage(
  accessToken: string,
  ownerUrn: string,
  imageFileName: string,
): Promise<string> {
  const bytes = await readFile(mediaFilePath(imageFileName));
  const register = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: ownerUrn,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    }),
  });

  const payload = (await register.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: { uploadUrl?: string };
      };
    };
  };

  const uploadUrl =
    payload.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
  const asset = payload.value?.asset;
  if (!register.ok || !uploadUrl || !asset) {
    throw new Error(`LinkedIn image register failed (${register.status}): ${JSON.stringify(payload)}`);
  }

  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });

  if (!uploaded.ok) {
    const details = await uploaded.text();
    throw new Error(`LinkedIn image upload failed (${uploaded.status}): ${details}`);
  }

  return asset;
}
