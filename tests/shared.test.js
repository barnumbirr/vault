import { describe, it, expect, vi, afterEach } from "vitest";
import { timingSafeEqual, KEY_PATTERN } from "../functions/lib/shared.js";

// A faithful stand-in for the Workers-only crypto.subtle.timingSafeEqual:
// byte-wise equality that is (vacuously) true for two zero-length buffers.
// Node has no native implementation, so without this stub the suite would
// only ever exercise the XOR fallback — the branch production never runs.
function nativeStub() {
  return vi.fn((a, b) => a.byteLength === b.byteLength && a.every((v, i) => v === b[i]));
}

describe("timingSafeEqual", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts equal strings", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
  });

  it("rejects differing strings of equal length", () => {
    expect(timingSafeEqual("secret", "secreX")).toBe(false);
  });

  it("rejects different lengths", () => {
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("rejects empty vs non-empty", () => {
    expect(timingSafeEqual("", "secret")).toBe(false);
  });

  it("rejects two empty strings (fallback path)", () => {
    expect(timingSafeEqual("", "")).toBe(false);
  });

  it("rejects two empty strings on the native path without calling it", () => {
    // Regression: the native branch used to return true for empty-vs-empty,
    // so an unset SECRET_KEY authenticated requests with no Authorization
    // header in production while the fallback-based tests stayed green.
    const native = nativeStub();
    vi.stubGlobal("crypto", { subtle: { timingSafeEqual: native } });
    expect(timingSafeEqual("", "")).toBe(false);
    expect(native).not.toHaveBeenCalled();
  });

  it("delegates non-empty comparisons to the native implementation", () => {
    const native = nativeStub();
    vi.stubGlobal("crypto", { subtle: { timingSafeEqual: native } });
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(native).toHaveBeenCalledTimes(2);
  });

  it("burns a self-comparison on length mismatch (native path)", () => {
    const native = nativeStub();
    vi.stubGlobal("crypto", { subtle: { timingSafeEqual: native } });
    expect(timingSafeEqual("a", "ab")).toBe(false);
    expect(native).toHaveBeenCalledTimes(1);
  });
});

describe("KEY_PATTERN", () => {
  it("accepts 1 to 64 alphanumeric characters", () => {
    expect(KEY_PATTERN.test("a")).toBe(true);
    expect(KEY_PATTERN.test("M12KsL")).toBe(true);
    expect(KEY_PATTERN.test("a".repeat(64))).toBe(true);
  });

  it("rejects empty, oversized, and non-alphanumeric keys", () => {
    expect(KEY_PATTERN.test("")).toBe(false);
    expect(KEY_PATTERN.test("a".repeat(65))).toBe(false);
    expect(KEY_PATTERN.test("abc-123")).toBe(false);
    expect(KEY_PATTERN.test("abc/123")).toBe(false);
  });
});
