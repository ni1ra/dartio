/**
 * Postgres error shapes worth branching on.
 *
 * The unique-violation check existed twice — once for the identity upsert and once
 * for a room code collision — and both walked the cause chain the same way looking
 * for the same code. Two copies of a magic number is two places to get it wrong.
 */

/** `23505`: a unique index refused the row. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  // Drivers wrap: the code can be a few causes deep, and a cycle would hang a walk.
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
