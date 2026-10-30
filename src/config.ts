import "dotenv/config";

export type Cadence = "daily" | "weekdays" | "3x" | "weekly";
export type PostApi = "ugc" | "rest";
export type PostTime = { hour: number; minute: number };

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return parsed;
}
function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function parsePostTimes(): PostTime[] {
  const raw = process.env.POST_TIMES?.trim();
  if (raw) {
    const times = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(part);
        if (!match) {
          throw new Error(`POST_TIMES entry "${part}" must look like HH:MM`);
        }
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
          throw new Error(`POST_TIMES entry "${part}" is out of range`);
        }
        return { hour, minute };
      });
    if (times.length === 0) {
      throw new Error("POST_TIMES must list at least one HH:MM time");
    }
    return times.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  }

  const count = Math.min(3, Math.max(1, numberEnv("POSTS_PER_DAY", 3)));
  const first = { hour: numberEnv("POST_HOUR", 9), minute: numberEnv("POST_MINUTE", 15) };
  if (count === 1) return [first];
  if (count === 2) {
    return [first, { hour: 13, minute: 15 }].sort(
      (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute),
    );
  }
  return [
    first,
    { hour: 13, minute: 15 },
    { hour: 18, minute: 15 },
  ].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

export function formatPostTimes(times: PostTime[]): string {
  return times.map((t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`).join(", ");
}

export function loadConfig() {
  const cadence = (process.env.SCHEDULE ?? "daily").toLowerCase();
  if (!["daily", "weekdays", "3x", "weekly"].includes(cadence)) {
    throw new Error("SCHEDULE must be one of: daily, weekdays, 3x, weekly");
  }

  const postApi = (process.env.LINKEDIN_POST_API ?? "ugc").toLowerCase();
  if (postApi !== "ugc" && postApi !== "rest") {
    throw new Error("LINKEDIN_POST_API must be ugc or rest");
  }

  const weekday = (process.env.POST_WEEKDAY ?? "tuesday").toLowerCase();
  if (!WEEKDAYS.includes(weekday as Weekday)) {
    throw new Error(`POST_WEEKDAY must be one of: ${WEEKDAYS.join(", ")}`);
  }

  const times = parsePostTimes();
  const first = times[0] ?? { hour: 9, minute: 15 };

  return {
    linkedin: {
      clientId: optional("LINKEDIN_CLIENT_ID"),
      clientSecret: optional("LINKEDIN_CLIENT_SECRET"),
      redirectUri: process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:3456/callback",
      accessToken: optional("LINKEDIN_ACCESS_TOKEN"),
      refreshToken: optional("LINKEDIN_REFRESH_TOKEN"),
      personUrn: optional("LINKEDIN_PERSON_URN"),
      postApi: postApi as PostApi,
      apiVersion: process.env.LINKEDIN_API_VERSION ?? "202509",
    },
    openai: {
      apiKey: optional("OPENAI_API_KEY"),
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2.5-flare",
      baseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    },
    schedule: {
      cadence: cadence as Cadence,
      hour: first.hour,
      minute: first.minute,
      times,
      postsPerDay: times.length,
      weekday: weekday as Weekday,
      timezone: process.env.TIMEZONE ?? "Asia/Kolkata",
    },
    autoPublish: boolEnv("AUTO_PUBLISH", false),
    // Every post gets an image by default.
    imageChance: floatEnv("IMAGE_CHANCE", 1),
    queueMin: numberEnv("QUEUE_MIN", 9),
    // On Render the free disk is ephemeral; GitHub Actions is the durable publisher.
    // Default the hosted scheduler off unless explicitly enabled.
    schedulerEnabled: boolEnv(
      "SCHEDULER_ENABLED",
      !(process.env.RENDER === "true" || process.env.RENDER === "1"),
    ),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

export function requireLinkedInApp(config: AppConfig) {
  return {
    clientId: requiredValue("LINKEDIN_CLIENT_ID", config.linkedin.clientId),
    clientSecret: requiredValue("LINKEDIN_CLIENT_SECRET", config.linkedin.clientSecret),
    redirectUri: config.linkedin.redirectUri,
  };
}

function requiredValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
