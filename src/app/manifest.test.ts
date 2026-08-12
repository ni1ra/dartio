import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

function pngSize(path: string): { readonly width: number; readonly height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Decodes the repo's non-interlaced 8-bit RGBA icon without adding a PNG dependency. */
function pngRgba(path: string): { readonly width: number; readonly height: number; readonly pixels: Uint8Array } {
  const bytes = readFileSync(path);
  const { width, height } = pngSize(path);
  expect(bytes[24]).toBe(8);
  expect(bytes[25]).toBe(6);
  expect(bytes[28]).toBe(0);

  const chunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }

  const packed = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[source++]!;
    expect([0, 1, 2, 3, 4]).toContain(filter);
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[source++]!;
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4]! : 0;
      const prediction = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      pixels[y * stride + x] = (raw + prediction) & 0xff;
    }
  }
  return { width, height, pixels };
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

describe("install manifest", () => {
  it("declares one same-origin standalone Dartio application", () => {
    expect(manifest()).toEqual(expect.objectContaining({
      id: "/",
      name: "Dartio — every dart tells a story",
      short_name: "Dartio",
      start_url: "/play",
      scope: "/",
      display: "standalone",
      background_color: "#090a0a",
      theme_color: "#090a0a",
    }));
  });

  it("ships real PNGs at every dimension the manifest declares", () => {
    const root = fileURLToPath(new URL("../../public", import.meta.url));
    for (const icon of manifest().icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(typeof icon.sizes).toBe("string");
      if (typeof icon.sizes !== "string") throw new TypeError("Manifest icon has no dimensions");
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(`${root}${icon.src}`)).toEqual({ width, height });
    }
    expect(pngSize(`${root}/icons/dartio-180.png`)).toEqual({ width: 180, height: 180 });
  });

  it("keeps every visible mark pixel inside the maskable safe circle", () => {
    const root = fileURLToPath(new URL("../../public", import.meta.url));
    const { width, height, pixels } = pngRgba(`${root}/icons/dartio-512.png`);
    const centre = width / 2;
    let maxRadius = 0;
    let markPixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const isCanvas = pixels[offset] === 9
          && pixels[offset + 1] === 10
          && pixels[offset + 2] === 10
          && pixels[offset + 3] === 255;
        if (isCanvas) continue;
        markPixels += 1;
        maxRadius = Math.max(maxRadius, Math.hypot(x + 0.5 - centre, y + 0.5 - centre));
      }
    }

    expect(markPixels).toBeGreaterThan(0);
    expect(maxRadius).toBeLessThanOrEqual(width * 0.4);
  });
});
