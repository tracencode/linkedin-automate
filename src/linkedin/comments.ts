import type { AppConfig } from "../config.ts";

export async function createComment(
  config: AppConfig,
  accessToken: string,
  actorUrn: string,
  objectUrn: string,
  text: string,
): Promise<void> {
  const response = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(objectUrn)}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": config.linkedin.apiVersion,
      },
      body: JSON.stringify({
        actor: actorUrn,
        object: objectUrn,
        message: { text: text.slice(0, 1250) },
      }),
    },
  );
  if (response.ok) return;
  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `LinkedIn refused the comment (${response.status}). Share on LinkedIn can publish your own posts. Commenting on someone else's post needs the Community Management comment permission (w_member_social_feed). Copy the draft and post it by hand until that product is on the app. ${body.slice(0, 180)}`,
    );
  }
  throw new Error(`LinkedIn comment failed (${response.status}): ${body.slice(0, 240)}`);
}
