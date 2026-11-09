import { searchScored } from "../search/bing.ts";
import { LEAD_QUERIES, scoreLead } from "./queries.ts";

export function searchLeadPosts() {
  return searchScored(LEAD_QUERIES, scoreLead, 3);
}
