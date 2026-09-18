import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import type { AppConfig } from "../config.ts";
import { requireLinkedInApp } from "../config.ts";
import { DATA_DIR, TOKENS_PATH } from "../paths.ts";
import type { Tokens } from "../types.ts";
import { log } from "../log.ts";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const SCOPES = ["openid", "profile", "email", "w_member_social"];

export async function loadTokens(config: AppConfig): Promise<Tokens | undefined> {
  if (config.linkedin.accessToken && config.linkedin.personUrn) {
    return {
      accessToken: config.linkedin.accessToken,
      refreshToken: config.linkedin.refreshToken,
      expiresAt: Date.now() + 50 * 24 * 60 * 60 * 1000,
      personUrn: config.linkedin.personUrn,
    };
  }

  if (!existsSync(TOKENS_PATH)) return undefined;
  const raw = await readFile(TOKENS_PATH, "utf8");
  return JSON.parse(raw) as Tokens;
}

export async function saveTokens(tokens: Tokens) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n", "utf8");
}

export async function getValidAccess(config: AppConfig): Promise<Tokens> {
  const tokens = await loadTokens(config);
  if (!tokens) {
    throw new Error('Not signed in. Run `npm run auth` first.');
  }

  const stillValid = tokens.expiresAt - Date.now() > 5 * 60 * 1000;
  if (stillValid) return tokens;

  if (!tokens.refreshToken) {
    throw new Error("Access token expired and no refresh token is stored. Run `npm run auth` again.");
  }

  log("Refreshing LinkedIn access token...");
  const refreshed = await refreshAccessToken(config, tokens);
  await saveTokens(refreshed);
  if (
    process.env.GITHUB_ACTIONS &&
    refreshed.refreshToken &&
    refreshed.refreshToken !== tokens.refreshToken
  ) {
    log("LinkedIn issued a new refresh token. Update the LINKEDIN_REFRESH_TOKEN secret.");
  }
  return refreshed;
}

async function refreshAccessToken(config: AppConfig, tokens: Tokens): Promise<Tokens> {
  const app = requireLinkedInApp(config);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken ?? "",
    client_id: app.clientId,
    client_secret: app.clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  const accessToken = String(payload.access_token ?? "");
  const refreshToken = payload.refresh_token
    ? String(payload.refresh_token)
    : tokens.refreshToken;
  const expiresIn = Number(payload.expires_in ?? 5184000);

  return {
    ...tokens,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function loginWithBrowser(config: AppConfig): Promise<Tokens> {
  const app = requireLinkedInApp(config);
  const redirect = new URL(app.redirectUri);
  if (redirect.hostname !== "localhost" && redirect.hostname !== "127.0.0.1") {
    throw new Error("LINKEDIN_REDIRECT_URI must be a localhost URL for this CLI.");
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", app.clientId);
  authUrl.searchParams.set("redirect_uri", app.redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", SCOPES.join(" "));

  const port = Number(redirect.port || 80);
  const code = await waitForCode({ port, pathname: redirect.pathname, state, authUrl: authUrl.toString() });
  const tokenPayload = await exchangeCode(app, code);
  const profile = await fetchUserInfo(tokenPayload.access_token);

  const tokens: Tokens = {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: Date.now() + tokenPayload.expires_in * 1000,
    personUrn: `urn:li:person:${profile.sub}`,
    name: profile.name,
  };

  await saveTokens(tokens);
  return tokens;
}

async function exchangeCode(
  app: { clientId: string; clientSecret: string; redirectUri: string },
  code: string,
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: app.redirectUri,
    client_id: app.clientId,
    client_secret: app.clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      `OAuth token exchange failed (${response.status}): ${payload.error_description ?? JSON.stringify(payload)}`,
    );
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_in: payload.expires_in ?? 5184000,
  };
}

async function fetchUserInfo(accessToken: string): Promise<{ sub: string; name?: string }> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json()) as { sub?: string; name?: string };
  if (!response.ok || !payload.sub) {
    throw new Error(`Could not read LinkedIn profile: ${JSON.stringify(payload)}`);
  }
  return { sub: payload.sub, name: payload.name };
}

function waitForCode(opts: {
  port: number;
  pathname: string;
  state: string;
  authUrl: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);
      if (url.pathname !== opts.pathname) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const returnedState = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error || !code || returnedState !== opts.state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>LinkedIn sign-in failed</h1><p>You can close this tab.</p>");
        server.close();
        reject(new Error(error || "OAuth callback missing code/state"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>Signed in</h1><p>You can close this tab and return to the terminal.</p>");
      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      log(`Listening for LinkedIn redirect on ${opts.pathname} (port ${opts.port})`);
      log("Open this URL if the browser does not launch:\n");
      console.log(opts.authUrl + "\n");
      openBrowser(opts.authUrl);
    });
  });
}

function openBrowser(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  execFile(cmd, args, () => {
    /* ignore */
  });
}
