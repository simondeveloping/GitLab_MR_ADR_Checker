/** Gemeinsamer Eingangsfilter vor der Auswahl von ADR-Check oder Lernmodus. */
export interface ReviewAuthor {
  id?: number;
  username?: string;
  bot?: boolean;
}

export interface ReviewTriggerFilter {
  ignoredAuthors: string[];
  ignoredSourceBranchPrefixes: string[];
}

export function automatedReviewReason(
  sourceBranch: string | undefined,
  author: ReviewAuthor | undefined,
  filter: ReviewTriggerFilter,
): "source branch" | "bot author" | "excluded author" | null {
  if (typeof sourceBranch === "string" &&
    filter.ignoredSourceBranchPrefixes.some((prefix) => sourceBranch.startsWith(prefix))) {
    return "source branch";
  }
  if (author?.bot === true) return "bot author";
  if (typeof author?.username === "string" &&
    filter.ignoredAuthors.includes(author.username.toLowerCase())) return "excluded author";
  return null;
}
