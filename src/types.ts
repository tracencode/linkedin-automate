export type Tokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  personUrn: string;
  name?: string;
};

export type HistoryEntry = {
  id: string;
  postedAt: string;
  dateLocal: string;
  text: string;
  source: "queue" | "generated" | "manual";
  file?: string;
  dryRun?: boolean;
};

export type HistoryFile = {
  posts: HistoryEntry[];
};

export type PostDoc = {
  filePath: string;
  fileName: string;
  status: "draft" | "queued";
  format?: string;
  topic?: string;
  createdAt?: string;
  image?: string;
  text: string;
};

export const FORMATS = [
  "personal_story",
  "tactical_howto",
  "contrarian_take",
  "lesson_learned",
  "framework",
  "question_post",
] as const;

export type Format = (typeof FORMATS)[number];
