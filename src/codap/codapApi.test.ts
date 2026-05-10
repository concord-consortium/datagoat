// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the codap-plugin-api module boundary so the tests don't try to
// reach a real CODAP host.
const codapMocks = vi.hoisted(() => ({
  initializePlugin: vi.fn(async () => undefined),
  createTable: vi.fn(async () => ({ success: true })),
  createItems: vi.fn(async () => ({ success: true })),
  getAllItems: vi.fn(
    async () =>
      ({ success: true, values: [] }) as {
        success: boolean;
        values: Array<{ id: number | string; values: Record<string, unknown> }>;
      },
  ),
  getDataContext: vi.fn(
    async () => ({ success: false }) as Record<string, unknown>,
  ),
  updateAttribute: vi.fn(async () => ({ success: true })),
  updateItemByID: vi.fn(async () => ({ success: true })),
  codapInterface: {
    sendRequest: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock("@concord-consortium/codap-plugin-api", () => codapMocks);

vi.mock("../utils/logError", () => ({ logError: vi.fn() }));

import {
  ensureSuccess,
  inferAttributeType,
  useCodapApi,
  type DatasetRow,
} from "./codapApi";

describe("inferAttributeType", () => {
  it("returns 'date' when the attribute name is 'date' regardless of rows", () => {
    expect(inferAttributeType("date", [])).toBe("date");
    expect(inferAttributeType("date", [{ date: 1 }])).toBe("date");
  });

  it("returns 'numeric' when the first non-null value is a number", () => {
    const rows: DatasetRow[] = [
      { hydration: null },
      { hydration: 64 },
      { hydration: "skipped" },
    ];
    expect(inferAttributeType("hydration", rows)).toBe("numeric");
  });

  it("returns 'categorical' when the first non-null value is non-numeric", () => {
    const rows: DatasetRow[] = [{ availability: "practice:full" }];
    expect(inferAttributeType("availability", rows)).toBe("categorical");
  });

  it("falls back to 'categorical' when all rows are null/missing", () => {
    const rows: DatasetRow[] = [{ x: null }, {}, { x: null }];
    expect(inferAttributeType("x", rows)).toBe("categorical");
  });
});

describe("ensureSuccess", () => {
  it("throws 'CODAP <step> failed' when result is undefined", () => {
    expect(() => ensureSuccess(undefined, "createItems")).toThrow(
      "CODAP createItems failed",
    );
  });

  it("throws when result.success is false", () => {
    expect(() => ensureSuccess({ success: false }, "updateAttribute")).toThrow(
      "CODAP updateAttribute failed",
    );
  });

  it("does not throw when result.success is true", () => {
    expect(() => ensureSuccess({ success: true }, "createTable")).not.toThrow();
  });
});

describe("useCodapApi sendDataset", () => {
  beforeEach(() => {
    for (const fn of Object.values(codapMocks)) {
      if (typeof fn === "function") fn.mockClear();
    }
    codapMocks.codapInterface.sendRequest.mockClear();
    codapMocks.initializePlugin.mockResolvedValue(undefined);
    codapMocks.createTable.mockResolvedValue({ success: true });
    codapMocks.createItems.mockResolvedValue({ success: true });
    codapMocks.getAllItems.mockResolvedValue({ success: true, values: [] });
    codapMocks.getDataContext.mockResolvedValue({ success: false });
    codapMocks.updateAttribute.mockResolvedValue({ success: true });
    codapMocks.updateItemByID.mockResolvedValue({ success: true });
    codapMocks.codapInterface.sendRequest.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderApi() {
    const { result } = renderHook(() => useCodapApi());
    await waitFor(() => expect(result.current.status).toBe("connected"));
    return result;
  }

  it("creates the data context + table + items when no context exists", async () => {
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        title: "Health & Performance",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [{ date: "2026-04-01", hydration: 64 }],
      });
    });

    expect(codapMocks.codapInterface.sendRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create",
        resource: "dataContext",
        values: expect.objectContaining({
          name: "DataGOAT-Health",
          title: "Health & Performance",
          collections: [
            expect.objectContaining({
              name: "Health",
              attrs: [
                { name: "date", type: "date" },
                { name: "hydration", type: "numeric" },
              ],
            }),
          ],
        }),
      }),
    );
    expect(codapMocks.createTable).toHaveBeenCalledWith(
      "DataGOAT-Health",
      undefined,
    );
    expect(codapMocks.createItems).toHaveBeenCalledWith(
      "DataGOAT-Health",
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-04-01", hydration: 64 }),
      ]),
    );
  });

  it("updates by id when an existing item matches the keyAttribute", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: { collections: [] },
    });
    codapMocks.getAllItems.mockResolvedValue({
      success: true,
      values: [{ id: 11, values: { date: "2026-04-01", hydration: 60 } }],
    });
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [{ date: "2026-04-01", hydration: 64 }],
      });
    });
    expect(codapMocks.updateItemByID).toHaveBeenCalledWith(
      "DataGOAT-Health",
      11,
      expect.objectContaining({ hydration: 64 }),
    );
    expect(codapMocks.createItems).not.toHaveBeenCalled();
  });

  it("creates new items for rows that don't match an existing key", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: { collections: [] },
    });
    codapMocks.getAllItems.mockResolvedValue({
      success: true,
      values: [{ id: 11, values: { date: "2026-04-01", hydration: 60 } }],
    });
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [{ date: "2026-04-02", hydration: 65 }],
      });
    });
    expect(codapMocks.updateItemByID).not.toHaveBeenCalled();
    expect(codapMocks.createItems).toHaveBeenCalledWith(
      "DataGOAT-Health",
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-04-02" }),
      ]),
    );
  });

  it("only updates the first item id for duplicate keys and warns about the divergence", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: { collections: [] },
    });
    codapMocks.getAllItems.mockResolvedValue({
      success: true,
      values: [
        { id: 1, values: { date: "2026-04-01", hydration: 60 } },
        { id: 2, values: { date: "2026-04-01", hydration: 70 } },
      ],
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [{ date: "2026-04-01", hydration: 80 }],
      });
    });
    expect(codapMocks.updateItemByID).toHaveBeenCalledTimes(1);
    expect(codapMocks.updateItemByID).toHaveBeenCalledWith(
      "DataGOAT-Health",
      1,
      expect.objectContaining({ hydration: 80 }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("duplicate date"),
      expect.arrayContaining(["2026-04-01"]),
    );
    warnSpy.mockRestore();
  });

  it("upgrades a categorical attr to numeric on a populated re-send", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: {
        collections: [
          {
            name: "Health",
            attrs: [
              { name: "date", type: "date" },
              { name: "hydration", type: "categorical" },
            ],
          },
        ],
      },
    });
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [{ date: "2026-04-01", hydration: 64 }],
      });
    });
    expect(codapMocks.updateAttribute).toHaveBeenCalledWith(
      "DataGOAT-Health",
      "Health",
      "hydration",
      { name: "hydration" },
      { type: "numeric" },
    );
  });

  it("does NOT downgrade a numeric attr to categorical when re-sending empty rows", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: {
        collections: [
          {
            name: "Health",
            attrs: [
              { name: "date", type: "date" },
              { name: "hydration", type: "numeric" },
            ],
          },
        ],
      },
    });
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date", "hydration"],
        rows: [],
      });
    });
    expect(codapMocks.updateAttribute).not.toHaveBeenCalled();
  });

  it("does nothing destructive when rows are empty and the context already exists", async () => {
    codapMocks.getDataContext.mockResolvedValue({
      success: true,
      values: { collections: [] },
    });
    const result = await renderApi();
    await act(async () => {
      await result.current.sendDataset({
        name: "DataGOAT-Health",
        collectionName: "Health",
        attributes: ["date"],
        rows: [],
      });
    });
    expect(codapMocks.createItems).not.toHaveBeenCalled();
    expect(codapMocks.updateItemByID).not.toHaveBeenCalled();
    expect(codapMocks.codapInterface.sendRequest).not.toHaveBeenCalled();
  });
});
