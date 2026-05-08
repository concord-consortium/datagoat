// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  CustomMetricsProvider,
  useCustomMetrics,
} from "./CustomMetricsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CustomMetricsProvider>{children}</CustomMetricsProvider>
);

describe("CustomMetricsContext", () => {
  it("starts with no metrics", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    expect(result.current.metrics).toEqual([]);
  });

  it("addMetric appends a new metric and returns it", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let created!: ReturnType<typeof result.current.addMetric>;
    act(() => {
      created = result.current.addMetric({
        ownerId: "u1",
        name: "5K Time",
        metricType: "performance",
        inputType: "numeric",
        unit: "min",
        goalRaw: 25,
        yTopRaw: 40,
        yBottomRaw: 15,
        avgDecimals: 1,
      });
    });
    expect(created.id.startsWith("c_")).toBe(true);
    expect(result.current.metrics).toHaveLength(1);
    expect(result.current.metrics[0].name).toBe("5K Time");
  });

  it("updateMetric patches in place", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      }).id;
    });
    act(() => result.current.updateMetric(id, { name: "y" }));
    expect(result.current.metrics[0].name).toBe("y");
  });

  it("deleteMetric removes the metric", () => {
    const { result } = renderHook(() => useCustomMetrics(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.addMetric({
        ownerId: "u1",
        name: "x",
        metricType: "wellness",
        inputType: "numeric",
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
      }).id;
    });
    act(() => result.current.deleteMetric(id));
    expect(result.current.metrics).toEqual([]);
  });

  it("accepts initialMetrics for test seeding", () => {
    const seed = [
      {
        id: "c_seed",
        ownerId: "u1",
        name: "seeded",
        metricType: "wellness" as const,
        inputType: "numeric" as const,
        unit: "",
        goalRaw: 0,
        yTopRaw: 10,
        yBottomRaw: 0,
        avgDecimals: 1,
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const seededWrapper = ({ children }: { children: React.ReactNode }) => (
      <CustomMetricsProvider initialMetrics={seed}>{children}</CustomMetricsProvider>
    );
    const { result } = renderHook(() => useCustomMetrics(), {
      wrapper: seededWrapper,
    });
    expect(result.current.metrics).toEqual(seed);
  });
});
