import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { darts, matches, players, turns, users } from "@/db/schema";
import type { MatchRecord } from "@/domain/match-record";
import { setObservabilitySink } from "./observability";
import { MatchHistoryError, recordMatch, type Database } from "./match-history";

const LIVE_ROLLBACK_ENABLED = process.env.DARTIO_RUN_LIVE_ROLLBACK_PROOF === "1";
const DISPOSABLE_ENDPOINTS = new Set([
  "ep-damp-rice-afmrsj1i.c-2.us-west-2.aws.neon.tech",
  "ep-damp-rice-afmrsj1i-pooler.c-2.us-west-2.aws.neon.tech",
]);
const PRODUCTION_ENDPOINT_PREFIX = "ep-raspy-lake-afeigwvp";

afterEach(() => setObservabilitySink(null));

interface RollbackEnvironment {
  readonly DARTIO_ROLLBACK_DATABASE_URL?: string;
  readonly DARTIO_ROLLBACK_DATABASE_KIND?: string;
  readonly DARTIO_ROLLBACK_DISPOSABLE_CONFIRM?: string;
}

/**
 * Refuses ambient, retained-Preview, and Production credentials before the proof
 * makes a write. Only the dedicated child endpoint plus an explicit disposable
 * acknowledgement can cross this boundary.
 */
function rollbackDatabaseUrl(environment: RollbackEnvironment = {
  DARTIO_ROLLBACK_DATABASE_URL: process.env.DARTIO_ROLLBACK_DATABASE_URL,
  DARTIO_ROLLBACK_DATABASE_KIND: process.env.DARTIO_ROLLBACK_DATABASE_KIND,
  DARTIO_ROLLBACK_DISPOSABLE_CONFIRM: process.env.DARTIO_ROLLBACK_DISPOSABLE_CONFIRM,
}): string {
  const raw = environment.DARTIO_ROLLBACK_DATABASE_URL;
  const target = environment.DARTIO_ROLLBACK_DATABASE_KIND;
  if (!raw || target !== "disposable") {
    throw new Error("The live rollback proof requires the dedicated disposable database target");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("The live rollback proof database URL is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !parsed.hostname.endsWith(".neon.tech")
    || !parsed.username
    || !parsed.password
  ) {
    throw new Error("The live rollback proof requires an authenticated Neon Postgres URL");
  }
  if (parsed.hostname.startsWith(PRODUCTION_ENDPOINT_PREFIX)) {
    throw new Error("The live rollback proof refuses the production endpoint");
  }
  if (!DISPOSABLE_ENDPOINTS.has(parsed.hostname)) {
    throw new Error("The live rollback proof target does not match the dedicated disposable endpoint");
  }
  if (environment.DARTIO_ROLLBACK_DISPOSABLE_CONFIRM !== "discardable") {
    throw new Error("A disposable rollback target must be explicitly acknowledged as discardable");
  }
  return raw;
}

describe("live rollback configuration boundary", () => {
  const enabled = {
    DARTIO_ROLLBACK_DATABASE_KIND: "disposable",
    DARTIO_ROLLBACK_DISPOSABLE_CONFIRM: "discardable",
  };

  it.each([
    "postgresql://user:synthetic-password@ep-raspy-lake-afeigwvp.c-2.us-west-2.aws.neon.tech/neondb",
    "postgresql://user:synthetic-password@ep-shy-brook-afwoyw0n.c-2.us-west-2.aws.neon.tech/neondb",
    "postgresql://user:synthetic-password@ep-damp-rice-afmrsj1i-attacker.c-2.us-west-2.aws.neon.tech/neondb",
  ])("refuses every retained or merely similar Neon endpoint", (url) => {
    expect(() => rollbackDatabaseUrl({
      ...enabled,
      DARTIO_ROLLBACK_DATABASE_URL: url,
    })).toThrow();
  });

  it("requires every opt-in and accepts only the exact dedicated child", () => {
    const url = "postgresql://user:synthetic-password@ep-damp-rice-afmrsj1i.c-2.us-west-2.aws.neon.tech/neondb";
    expect(() => rollbackDatabaseUrl({
      DARTIO_ROLLBACK_DATABASE_KIND: "disposable",
      DARTIO_ROLLBACK_DATABASE_URL: url,
    })).toThrow("explicitly acknowledged");
    expect(rollbackDatabaseUrl({
      ...enabled,
      DARTIO_ROLLBACK_DATABASE_URL: url,
    })).toBe(url);
  });
});

type BatchInput = Parameters<Database["batch"]>[0];

/**
 * Keeps recordMatch's real statements intact while adding all probe setup and the
 * guaranteed failure to that same Neon HTTP batch. The invalid state version is
 * rejected by matches_state_version_nonnegative only after every valid write.
 */
function databaseWithConstraintFailure(database: Database, userId: string, marker: string): Database {
  const userStatement = database.insert(users).values({
    id: userId,
    authSubject: `rollback-proof:${marker}`,
    email: `rollback-proof-${marker}@example.invalid`,
  });
  const failureStatement = database.insert(matches).values({
    mode: "rollback-proof-sentinel",
    status: "abandoned",
    options: { rollbackProof: marker, sentinel: true },
    stateVersion: -1,
  });

  return new Proxy(database, {
    get(target, property) {
      if (property === "batch") {
        return async (statements: BatchInput) => target.batch([
          userStatement,
          ...statements,
          failureStatement,
        ] as unknown as BatchInput);
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

interface ResidueRow extends Record<string, unknown> {
  readonly matchCount: number;
  readonly playerCount: number;
  readonly turnCount: number;
  readonly dartCount: number;
  readonly userCount: number;
}

describe.skipIf(!LIVE_ROLLBACK_ENABLED)("Neon HTTP match-history rollback proof", () => {
  it("rolls every recordMatch table back when the final statement violates a constraint", async () => {
    const marker = randomUUID();
    const userId = randomUUID();
    const queryClient = neon(rollbackDatabaseUrl());
    const database = drizzle(queryClient, { schema });
    const injectedDatabase = databaseWithConstraintFailure(database, userId, marker);
    const record: MatchRecord = {
      mode: "rollback-proof",
      options: { rollbackProof: marker },
      players: [{ seat: 0, displayName: "Rollback proof", isBot: false }],
      turns: [{
        seat: 0,
        turnNumber: 1,
        legNumber: 1,
        scoreBefore: 20,
        scoreAfter: 0,
        bust: false,
        dartsThrown: 1,
        darts: [{ ordinal: 1, segment: 20, multiplier: 1 }],
      }],
      winnerSeat: 0,
    };

    // The expected failure includes a random user id in recordMatch's normal event.
    // Suppress that event so the proof cannot print credentials or identifiers.
    setObservabilitySink(() => undefined);
    let failure: unknown;
    try {
      await recordMatch(userId, record, 0, injectedDatabase);
    } catch (cause) {
      failure = cause;
    }

    let residue: ResidueRow | undefined;
    try {
      const result = await database.execute<ResidueRow>(sql`
        select
          (select count(*)::int from ${matches} as probe_match
            where probe_match.options ->> 'rollbackProof' = ${marker}) as "matchCount",
          (select count(*)::int from ${players} as probe_player
            join ${matches} as probe_match on probe_match.id = probe_player.match_id
            where probe_match.options ->> 'rollbackProof' = ${marker}) as "playerCount",
          (select count(*)::int from ${turns} as probe_turn
            join ${matches} as probe_match on probe_match.id = probe_turn.match_id
            where probe_match.options ->> 'rollbackProof' = ${marker}) as "turnCount",
          (select count(*)::int from ${darts} as probe_dart
            join ${turns} as probe_turn on probe_turn.id = probe_dart.turn_id
            join ${matches} as probe_match on probe_match.id = probe_turn.match_id
            where probe_match.options ->> 'rollbackProof' = ${marker}) as "dartCount",
          (select count(*)::int from ${users} as probe_user
            where probe_user.id = ${userId}) as "userCount"
      `);
      residue = result.rows[0];
    } catch {
      // Keep infrastructure failures from echoing a URL, query parameter, or id.
      throw new Error("The live rollback proof could not read its residue counts");
    }

    const rollbackError = failure instanceof MatchHistoryError;
    const constraintFailure = failure instanceof MatchHistoryError
      && failure.cause instanceof Error
      && failure.cause.message.includes("matches_state_version_nonnegative");
    expect({ rollbackError, constraintFailure, residue }).toEqual({
      rollbackError: true,
      constraintFailure: true,
      residue: {
        matchCount: 0,
        playerCount: 0,
        turnCount: 0,
        dartCount: 0,
        userCount: 0,
      },
    });
    // No cleanup DELETE follows: residue would be the evidence that rollback broke.
  }, 60_000);
});
