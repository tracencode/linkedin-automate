import { searchScored } from "../search/bing.ts";
import { COMMENT_QUERIES, scoreComment } from "./queries.ts";

export function searchCommentPosts() {
  return searchScored(COMMENT_QUERIES, scoreComment, 2);
}
