import { parseEnv } from "node:util";

export const PREVIEW_DATABASE_HOST = "ep-shy-brook-afwoyw0n-pooler.c-2.us-west-2.aws.neon.tech";

const messages = {
  argument: "REFUSED keep the Preview credential only in ignored .env.local, never as an argument",
  database: "REFUSED ignored .env.local does not contain the expected Preview database",
  production: "REFUSED this script grants temporary Pro rows and must never run against production",
  target: "REFUSED the Preview deployment URL is invalid",
  usage: "usage: pnpm verify:rooms:live <preview-url>",
};

/**
 * Resolves the writer's two targets without touching HTTP or SQL.
 *
 * The injected reader makes refusal ordering testable: Production must be
 * rejected before the ignored file is opened, while ambient DATABASE_URL is
 * deliberately outside this function's authority.
 */
export function resolveLiveRoomConfiguration(arguments_, readEnvironment) {
  const [target, ...unexpectedArguments] = arguments_;
  if (unexpectedArguments.length > 0) {
    return { ok: false, message: messages.argument };
  }
  if (!target) {
    return { ok: false, message: messages.usage };
  }

  let origin;
  let targetHostname;
  try {
    const parsedTarget = new URL(target);
    if (
      !["http:", "https:"].includes(parsedTarget.protocol) ||
      parsedTarget.username ||
      parsedTarget.password
    ) {
      throw new Error("not a public deployment URL");
    }
    origin = parsedTarget.origin;
    // A terminal DNS root dot is equivalent on the wire but is preserved by
    // WHATWG URL parsing, so normalize it before comparing protected hosts.
    targetHostname = parsedTarget.hostname.replace(/\.+$/, "");
  } catch {
    // URL errors retain their input. Returning a fixed message keeps a misplaced
    // credential out of stderr when the caller gets the first argument wrong.
    return { ok: false, message: messages.target };
  }

  // Named explicitly rather than inferred: "does not look like production" is
  // not a safety property for a script that fabricates temporary billing state.
  if (["dartioopus46.vercel.app", "dartio.vercel.app"].includes(targetHostname)) {
    return { ok: false, message: messages.production };
  }

  try {
    // Node lets ambient variables override --env-file. Parsing the ignored file
    // directly makes that shell-level override irrelevant to this writer.
    const localEnvironment = parseEnv(readEnvironment());
    const databaseUrl = localEnvironment.DATABASE_URL;
    const parsedDatabase = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(parsedDatabase.protocol) ||
      parsedDatabase.hostname !== PREVIEW_DATABASE_HOST ||
      parsedDatabase.pathname !== "/neondb" ||
      decodeURIComponent(parsedDatabase.username) !== "neondb_owner" ||
      !parsedDatabase.password
    ) {
      throw new Error("not the Preview database");
    }
    return { ok: true, origin, databaseUrl };
  } catch {
    return { ok: false, message: messages.database };
  }
}
