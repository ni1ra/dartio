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
  usage: "usage: pnpm verify:ai:live <deployment-origin>",
};

/**
 * Resolves a credential-bearing verifier without touching the network.
 *
 * Stable QA credentials are more sensitive than a throwaway probe identity, so
 * they may only be sent to Dartio's named Production hosts, this Vercel team's
 * Dartio previews, or loopback. Every refusal is fixed text because URL parsers
 * retain their input and a misplaced password must never be reflected to stderr.
 */
export function resolveLiveAiConfiguration(arguments_, environment) {
  const [target, ...unexpectedArguments] = arguments_;
  if (unexpectedArguments.length > 0) {
    return { ok: false, message: messages.argument };
  }
  if (!target) {
    return { ok: false, message: messages.usage };
  }

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

    // Normalize a terminal DNS root dot before constructing request URLs and
    // Origin headers, because Neon Auth compares the canonical origin exactly.
    // Remote HTTP input is accepted for CLI parity but upgraded before any QA
    // credential is sent; only loopback is ever contacted over cleartext.
    parsed.hostname = hostname;
    if (!loopback && parsed.protocol === "http:") parsed.protocol = "https:";
    origin = parsed.origin;
  } catch {
    return { ok: false, message: messages.target };
  }

  const email = environment.DARTIO_QA_EMAIL;
  const password = environment.DARTIO_QA_PASSWORD;
  if (typeof email !== "string" || email.trim() === "" || typeof password !== "string" || password === "") {
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

const BOARD_CLOCKWISE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const INNER_BULL = 6.35 / 170;
const OUTER_BULL = 15.9 / 170;
const TREBLE_INNER = 99 / 170;
const TREBLE_OUTER = 107 / 170;
const DOUBLE_INNER = 162 / 170;
const OUTER = 1;
// Level 20 has normalized one-axis spread below 0.045. Twenty-five independent
// landings reduce the centroid spread below 0.009, so 0.04 is non-flaky for the
// real sampler while still separating single, treble, double, and both bulls.
export const LIVE_AI_SAMPLE_SIZE = 25;
const LEVEL_20_CENTROID_RADIUS = 0.04;

/**
 * Independently scores a returned point so the live gate does not trust the API
 * fields it is meant to verify. These are the same published steel-tip dimensions
 * used by the product's board domain, expressed in its normalized radius.
 */
function scorePoint(x, y) {
  const radius = Math.hypot(x, y);
  const wireTolerance = Number.EPSILON * 8;
  if (radius > OUTER + wireTolerance) return { segment: 0, multiplier: 1, score: 0 };
  if (radius <= INNER_BULL + wireTolerance) return { segment: 25, multiplier: 2, score: 50 };
  if (radius <= OUTER_BULL + wireTolerance) return { segment: 25, multiplier: 1, score: 25 };

  const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
  const index = Math.floor((angle + 9) / 18) % 20;
  const segment = BOARD_CLOCKWISE[index];
  const multiplier = radius >= DOUBLE_INNER - wireTolerance
    ? 2
    : radius >= TREBLE_INNER - wireTolerance && radius <= TREBLE_OUTER + wireTolerance
      ? 3
      : 1;
  return { segment, multiplier, score: segment * multiplier };
}

/** Returns the one strict, physically self-consistent dart, or null on any drift. */
export function parsePhysicallyConsistentDart(payload) {
  if (!isRecordWithKeys(payload, ["dart"])) return null;
  const value = payload.dart;
  if (!isRecordWithKeys(value, ["multiplier", "score", "segment", "x", "y"])) return null;

  const legalSegment = Number.isInteger(value.segment)
    && (value.segment === 0 || value.segment === 25 || (value.segment >= 1 && value.segment <= 20));
  const legalMultiplier = Number.isInteger(value.multiplier)
    && (value.multiplier === 1 || value.multiplier === 2 || value.multiplier === 3)
    && (value.segment !== 0 || value.multiplier === 1)
    && (value.segment !== 25 || value.multiplier !== 3);
  if (
    !legalSegment
    || !legalMultiplier
    || !Number.isInteger(value.score)
    || value.score !== value.segment * value.multiplier
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
  ) {
    return null;
  }

  const scored = scorePoint(value.x, value.y);
  if (
    scored.segment !== value.segment
    || scored.multiplier !== value.multiplier
    || scored.score !== value.score
  ) {
    return null;
  }
  return value;
}

/**
 * Proves a level-20 sample is centered on the requested scoring bed.
 *
 * A throw may legally miss its target, so equality with the requested bed would
 * be a false gate. The sample centroid retains physical variance while rejecting
 * an endpoint that ignores the requested segment or multiplier.
 */
export function isPlausiblyAimedSample(darts, target) {
  const center = representativeTargetPoint(target);
  if (
    center === null
    || !Array.isArray(darts)
    || darts.length !== LIVE_AI_SAMPLE_SIZE
    || darts.some((dart) => !Number.isFinite(dart?.x) || !Number.isFinite(dart?.y))
  ) return false;
  const centroid = darts.reduce(
    (total, dart) => ({ x: total.x + dart.x, y: total.y + dart.y }),
    { x: 0, y: 0 },
  );
  return Math.hypot(
    centroid.x / darts.length - center.x,
    centroid.y / darts.length - center.y,
  ) <= LEVEL_20_CENTROID_RADIUS;
}

function representativeTargetPoint(target) {
  if (
    typeof target !== "object"
    || target === null
    || Array.isArray(target)
    || !Number.isInteger(target.segment)
    || !Number.isInteger(target.multiplier)
    || ![1, 2, 3].includes(target.multiplier)
    || (target.segment === 25 && target.multiplier === 3)
  ) return null;

  if (target.segment === 25) {
    return {
      x: 0,
      y: target.multiplier === 2 ? 0 : (INNER_BULL + OUTER_BULL) / 2,
    };
  }
  const index = BOARD_CLOCKWISE.indexOf(target.segment);
  if (index < 0) return null;
  const angle = index * Math.PI / 10;
  const radius = target.multiplier === 3
    ? (TREBLE_INNER + TREBLE_OUTER) / 2
    : target.multiplier === 2
      ? (DOUBLE_INNER + OUTER) / 2
      : 0.72;
  return {
    x: Math.sin(angle) * radius,
    y: -Math.cos(angle) * radius,
  };
}

function isRecordWithKeys(value, expectedKeys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index]);
}
