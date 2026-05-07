import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("firebase/analytics", () => ({
  logEvent: vi.fn(),
  getAnalytics: vi.fn(),
  isSupported: vi.fn(async () => true),
}));

vi.mock("../firebase", () => ({
  getAnalyticsLazy: vi.fn(),
}));

describe("logError", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("calls console.error with both args (dev path)", async () => {
    vi.stubEnv("PROD", false);
    const { logError } = await import("./logError");
    const err = new Error("boom");
    const ctx = { feature: "test" };
    logError(err, ctx);
    expect(consoleErrorSpy).toHaveBeenCalledWith(err, ctx);
  });

  it("does not call logEvent when import.meta.env.PROD is false", async () => {
    vi.stubEnv("PROD", false);
    const analyticsMod = await import("firebase/analytics");
    const firebaseMod = await import("../firebase");
    const fakeAnalytics = {} as unknown;
    vi.mocked(firebaseMod.getAnalyticsLazy).mockResolvedValue(
      fakeAnalytics as Parameters<typeof analyticsMod.logEvent>[0],
    );
    const { logError } = await import("./logError");
    logError(new Error("oops"));
    await Promise.resolve();
    await Promise.resolve();
    expect(analyticsMod.logEvent).not.toHaveBeenCalled();
  });

  it("calls logEvent with app_error event when PROD and analytics is available", async () => {
    vi.stubEnv("PROD", true);
    const analyticsMod = await import("firebase/analytics");
    const firebaseMod = await import("../firebase");
    const fakeAnalytics = { fake: "analytics" } as unknown;
    vi.mocked(firebaseMod.getAnalyticsLazy).mockResolvedValue(
      fakeAnalytics as Parameters<typeof analyticsMod.logEvent>[0],
    );
    const { logError } = await import("./logError");
    logError(new Error("boom"), { route: "/dashboard" });
    await Promise.resolve();
    await Promise.resolve();
    expect(analyticsMod.logEvent).toHaveBeenCalledWith(
      fakeAnalytics,
      "app_error",
      {
        message: "boom",
        context: JSON.stringify({ route: "/dashboard" }),
      },
    );
  });
});
