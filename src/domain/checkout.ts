import { dart, notation, type Dart } from "./darts";
import type { OutRule } from "./x01";

export interface CheckoutAdvice {
  readonly score: number;
  readonly dartsAvailable: 1 | 2 | 3;
  readonly checkout: boolean;
  readonly bogey: boolean;
  readonly primary: readonly Dart[] | null;
  readonly alternates: readonly (readonly Dart[])[];
  readonly setup: readonly Dart[] | null;
  readonly leave: number | null;
}

const PRO_ROUTES: Readonly<Record<number, readonly string[]>> = {
  170: ["T20", "T20", "DB"], 167: ["T20", "T19", "DB"], 164: ["T20", "T18", "DB"],
  161: ["T20", "T17", "DB"], 160: ["T20", "T20", "D20"], 158: ["T20", "T20", "D19"],
  157: ["T20", "T19", "D20"], 156: ["T20", "T20", "D18"], 155: ["T20", "T19", "D19"],
  154: ["T20", "T18", "D20"], 153: ["T20", "T19", "D18"], 152: ["T20", "T20", "D16"],
  151: ["T20", "T17", "D20"], 150: ["T20", "T18", "D18"], 147: ["T20", "T17", "D18"],
  141: ["T20", "T19", "D12"], 121: ["T20", "T11", "D14"], 100: ["T20", "D20"],
  81: ["T19", "D12"], 80: ["T20", "D10"], 76: ["T20", "D8"], 70: ["T18", "D8"],
  62: ["T10", "D16"], 50: ["DB"], 40: ["D20"], 32: ["D16"], 24: ["D12"], 16: ["D8"],
};

const ALL_DARTS: readonly Dart[] = [
  ...Array.from({ length: 20 }, (_, i) => dart((20 - i) as Dart["segment"], 3)),
  ...Array.from({ length: 20 }, (_, i) => dart((20 - i) as Dart["segment"], 2)),
  dart(25, 2),
  ...Array.from({ length: 20 }, (_, i) => dart((20 - i) as Dart["segment"], 1)),
  dart(25, 1),
];

const GOOD_LEAVES = [170, 167, 164, 161, 160, 158, 157, 156, 155, 154, 153, 152, 151, 150, 147, 141, 121, 100, 80, 64, 61, 60, 57, 56, 54, 52, 50, 48, 40, 36, 32, 24, 16, 8] as const;

export function checkoutAdvice(score: number, dartsAvailable: 1 | 2 | 3 = 3, outRule: OutRule = "double"): CheckoutAdvice {
  if (!Number.isInteger(score) || score < (outRule === "straight" ? 1 : 2)) return { score, dartsAvailable, checkout: false, bogey: false, primary: null, alternates: [], setup: null, leave: null };
  const routes = findRoutes(score, dartsAvailable, outRule);
  const preferred = parsePreferred(score, dartsAvailable, outRule);
  const ordered = preferred ? [preferred, ...routes.filter((r) => signature(r) !== signature(preferred))] : routes;
  const primary = ordered[0] ?? null;
  const alternates = ordered.slice(1, 4);
  const bogey = dartsAvailable === 3 && outRule === "double" && score <= 170 && routes.length === 0;
  if (primary) return { score, dartsAvailable, checkout: true, bogey: false, primary, alternates, setup: null, leave: 0 };
  const setupDart = ALL_DARTS.find((d) => d.score < score && GOOD_LEAVES.includes((score - d.score) as typeof GOOD_LEAVES[number]));
  return { score, dartsAvailable, checkout: false, bogey, primary: null, alternates: [], setup: setupDart ? [setupDart] : null, leave: setupDart ? score - setupDart.score : null };
}

function findRoutes(score: number, dartsAvailable: number, outRule: OutRule): Dart[][] {
  const found: Dart[][] = [];
  const walk = (left: number, remaining: number, route: Dart[]) => {
    if (found.length >= 12 || remaining === 0) return;
    for (const d of ALL_DARTS) {
      if (d.score > left) continue;
      if (d.score === left && qualifiesOut(d, outRule)) { found.push([...route, d]); continue; }
      if (d.score < left && remaining > 1) walk(left - d.score, remaining - 1, [...route, d]);
    }
  };
  walk(score, dartsAvailable, []);
  return found.sort((a, b) => routeRank(a) - routeRank(b));
}

function routeRank(route: readonly Dart[]) { return route.length * 100 - route.reduce((n, d) => n + (d.multiplier === 3 ? 3 : d.multiplier === 2 ? 2 : 0), 0); }
function qualifiesOut(d: Dart, rule: OutRule) { return rule === "straight" || d.multiplier === 2 || (rule === "master" && d.multiplier === 3); }
function signature(route: readonly Dart[]) { return route.map(notation).join(" "); }
function parsePreferred(score: number, dartsAvailable: number, outRule: OutRule): Dart[] | null {
  if (outRule !== "double") return null;
  const tokens = PRO_ROUTES[score];
  if (!tokens || tokens.length > dartsAvailable) return null;
  return tokens.map((token) => {
    if (token === "DB") return dart(25, 2);
    const multiplier = token[0] === "T" ? 3 : token[0] === "D" ? 2 : 1;
    return dart(Number(token.slice(1)) as Dart["segment"], multiplier);
  });
}
