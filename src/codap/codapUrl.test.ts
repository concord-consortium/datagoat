// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCodapWrappedUrl, shouldRedirectToCodap } from "./codapUrl";

describe("buildCodapWrappedUrl", () => {
  const originalLocation = window.location;

  function stubLocation(url: string) {
    const fake = new URL(url);
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        href: fake.href,
        origin: fake.origin,
        hostname: fake.hostname,
        host: fake.host,
        protocol: fake.protocol,
        pathname: fake.pathname,
        search: fake.search,
      },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("uses localhost origin (with port) when running on localhost", () => {
    stubLocation("http://localhost:5173/codap");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=http://localhost:5173/codap",
    );
  });

  it("uses prod origin when running on datagoat.concord.org", () => {
    stubLocation("https://datagoat.concord.org/codap");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=https://datagoat.concord.org/codap",
    );
  });

  it("uses preview-channel origin when running on a Firebase preview host", () => {
    stubLocation("https://datagoat-staging--pr-3-abc.web.app/codap");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=https://datagoat-staging--pr-3-abc.web.app/codap",
    );
  });

  it("appends ?demo to the di target when demo is present in the current URL", () => {
    stubLocation("http://localhost:5173/dashboard?demo");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=http://localhost:5173/codap?demo",
    );
  });

  it("omits the demo suffix when the current URL has no demo param", () => {
    stubLocation("http://localhost:5173/dashboard");
    expect(buildCodapWrappedUrl()).toBe(
      "https://codap3.concord.org?di=http://localhost:5173/codap",
    );
  });
});

describe("shouldRedirectToCodap", () => {
  const originalLocation = window.location;

  function stubLocation(search: string) {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        href: `https://datagoat.concord.org/codap${search}`,
        origin: "https://datagoat.concord.org",
        hostname: "datagoat.concord.org",
        host: "datagoat.concord.org",
        protocol: "https:",
        pathname: "/codap",
        search,
      },
    });
  }

  beforeEach(() => {
    stubLocation("");
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
  });

  it("returns true at top level with no query", () => {
    expect(shouldRedirectToCodap()).toBe(true);
  });

  it("returns false when iframed (parent !== self)", () => {
    const fakeParent = {} as Window;
    Object.defineProperty(window, "parent", {
      configurable: true,
      get: () => fakeParent,
    });
    try {
      expect(shouldRedirectToCodap()).toBe(false);
    } finally {
      Object.defineProperty(window, "parent", {
        configurable: true,
        get: () => window,
      });
    }
  });

  it("returns false when ?noredirect=1 is set at top level", () => {
    stubLocation("?noredirect=1");
    expect(shouldRedirectToCodap()).toBe(false);
  });

  it("returns false when accessing window.parent throws (cross-origin)", () => {
    Object.defineProperty(window, "parent", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    try {
      expect(shouldRedirectToCodap()).toBe(false);
    } finally {
      Object.defineProperty(window, "parent", {
        configurable: true,
        get: () => window,
      });
    }
  });
});
