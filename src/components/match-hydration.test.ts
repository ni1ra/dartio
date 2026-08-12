import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readComponent = (name: "round-match" | "drill-match") => readFileSync(
  new URL(`./${name}.tsx`, import.meta.url),
  "utf8",
);

/** Source-level guard for the one-frame contract before browser effects run. */
describe("match hydration gates", () => {
  it("keeps every round scoring side effect behind the active resume scope", () => {
    const source = readComponent("round-match");
    expect(source).toContain("const hydrated = hydratedScope === resumeScope;");
    expect(source).toContain('useScreenWakeLock(hydrated && game.status === "playing")');
    expect(source).toMatch(/const disabled = !hydrated\s+\|\| game\.status/);
    expect(source).toMatch(/ready: hydrated\s+&& isAi/);
    expect(source).toContain("if (!hydrated) return;");
    expect(source).toContain('disabled={!hydrated || game.status === "complete" || game.visits.length === 0}');
  });

  it("keeps drill scoring, recording, cleanup, and wake lock behind hydration", () => {
    const source = readComponent("drill-match");
    expect(source).toContain("const hydrated = hydratedDrill === drill;");
    expect(source).toContain("const disabled = !hydrated || finished;");
    expect(source).toContain("useScreenWakeLock(hydrated && !finished)");
    expect(source).toContain("if (!hydrated || !finished) return;");
    expect(source).toContain("hydrated && finished ? drillMatchRecord(log) : null");
    expect(source).toContain("<Dartboard darts={game.currentDarts} disabled={disabled}");
    expect(source).toContain("<DartInputPad disabled={disabled}");
  });
});
