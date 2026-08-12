import { readFileSync } from "node:fs";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MatchError from "@/app/play/match/error";
import RootError from "@/app/error";

describe("route error boundaries", () => {
  it("renders the real match boundary with honest recovery copy and preserving actions", () => {
    const reset = () => undefined;
    const markup = renderToStaticMarkup(createElement(MatchError, { reset }));

    expect(markup).toContain("Your saved match is still here.");
    expect(markup).toContain("Darts already saved on this device are untouched.");
    expect(markup).toContain("every submitted visit remains on the server");
    expect(markup).toContain("waiting to be submitted may need to be thrown again");
    expect(markup).toContain("Try again");
    expect(markup).toContain('href="/play"');
    expect(markup).toContain("Neither action clears saved match data.");
  });

  it("keeps the root boundary generic and never exposes an exception", () => {
    const markup = renderToStaticMarkup(createElement(RootError, { reset: () => undefined }));
    expect(markup).toContain("The board went quiet.");
    expect(markup).toContain("Retrying does not clear account or on-device data.");
    expect(markup).toContain("Neither action clears account or on-device data.");
    expect(markup).not.toMatch(/match progress|room|saved match/i);

    // Error boundaries accept only reset; no exception text is reflected into
    // the DOM where it could expose an internal path, token, or provider detail.
    const source = readFileSync(new URL("../app/error.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/error\.message|digest/);
  });
});
