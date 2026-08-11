const PRODUCTION_HOSTS = new Set([
  "dartioopus46.vercel.app",
  "dartio.vercel.app",
]);
const VERCEL_TEAM_SUFFIX = "-niras-projects-868b6f5f.vercel.app";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const messages = {
  argument: "REFUSED credentials and other configuration must never be positional arguments",
  credentials: "REFUSED DARTIO_QA_EMAIL and DARTIO_QA_PASSWORD are required",
  target: "REFUSED the Dartio deployment origin is invalid or untrusted",
};

/**
 * Resolves a credential-bearing deployment verifier without touching the network.
 *
 * Stable QA credentials may only be sent to named Dartio Production hosts, this
 * Vercel team's Dartio previews, or loopback. Refusals use fixed text because URL
 * parsers retain their input and a misplaced password must never be reflected.
 */
export function resolveCredentialedLiveConfiguration(arguments_, environment, usage) {
  const [target, ...unexpectedArguments] = arguments_;
  if (unexpectedArguments.length > 0) {
    return { ok: false, message: messages.argument };
  }
  if (!target) return { ok: false, message: usage };

  let origin;
  try {
    const parsed = new URL(target);
    const hostname = parsed.hostname.replace(/\.+$/, "");
    const loopback = LOOPBACK_HOSTS.has(hostname);
    const production = PRODUCTION_HOSTS.has(hostname);
    const teamPreview = hostname.startsWith("dartio-")
      && hostname.endsWith(VERCEL_TEAM_SUFFIX);
    const trustedHost = loopback || production || teamPreview;
    const safeProtocol = parsed.protocol === "https:" || parsed.protocol === "http:";
    const safePort = loopback || parsed.port === "";

    if (
      !trustedHost
      || !safeProtocol
      || !safePort
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
    ) {
      throw new Error("not a trusted Dartio origin");
    }

    // Neon Auth compares the canonical origin exactly. Remote HTTP input is
    // upgraded before any credential is sent; only loopback stays cleartext.
    parsed.hostname = hostname;
    if (!loopback && parsed.protocol === "http:") parsed.protocol = "https:";
    origin = parsed.origin;
  } catch {
    return { ok: false, message: messages.target };
  }

  const email = environment.DARTIO_QA_EMAIL;
  const password = environment.DARTIO_QA_PASSWORD;
  if (
    typeof email !== "string"
    || email.trim() === ""
    || typeof password !== "string"
    || password === ""
  ) {
    return { ok: false, message: messages.credentials };
  }
  return { ok: true, origin, email, password };
}

/** Cache directives are order- and case-insensitive; both protections are mandatory. */
export function hasPrivateNoStore(value) {
  if (typeof value !== "string") return false;
  const directives = new Set(value.split(",").map((part) => part.trim().toLowerCase()));
  return directives.has("private") && directives.has("no-store");
}
