import { useEffect, useState } from "react";
import {
  initializePlugin,
  createTable,
  createItems,
  getAllItems,
  getDataContext,
  updateAttribute,
  updateItemByID,
  codapInterface,
} from "@concord-consortium/codap-plugin-api";
import { logError } from "../utils/logError";

// Thin DataGOAT-specific wrapper around @concord-consortium/codap-plugin-api.
// The library tracks the CODAP postMessage protocol authoritatively;
// this wrapper exposes a single useCodapApi() hook so app components
// don't need to know about the multi-step create dance.

export type CodapStatus = "disconnected" | "connecting" | "connected";

export interface DatasetRow {
  // Free-form bag matching CODAP's CodapItemValues shape - one key per
  // attribute. Health rows have date + the metric values; competition
  // rows have date + a metrics-bag flattened to per-attribute keys.
  [key: string]: string | number | null;
}

export interface AttributeSpec {
  // Attribute name CODAP shows as the column header.
  name: string;
  // CODAP attribute type: "date" | "numeric" | "categorical".
  type: string;
  // Optional unit CODAP renders on numeric axes. Omitted when empty.
  unit?: string;
}

export interface SendDatasetArgs {
  // Resource-safe identifier for the data context (e.g.
  // "DataGOAT-Health"). Used in CODAP's bracket-notation resource
  // paths, so it must avoid spaces and `&`.
  name: string;
  // Display label CODAP shows on the table tab. Set on the data
  // context's `title` field. Free-form - can include spaces and `&`.
  // Defaults to `name` when omitted.
  title?: string;
  // Name of the single collection inside the data context.
  collectionName: string;
  // Internal component name for the case-table CODAP renders. The
  // visible label comes from the data context's `title`, not this -
  // setting it just gives the component a stable identifier.
  tableName?: string;
  attributes: AttributeSpec[];
  rows: DatasetRow[];
  // Attribute used to match incoming rows against existing items in
  // CODAP. Rows whose value at this key matches an existing item's
  // value are updated in place; rows with no match are appended via
  // createItems. Defaults to "date" because that is DataGOAT's
  // natural per-day primary key. Pass `null` to disable upsert and
  // append every row (the pre-existing behavior).
  keyAttribute?: string | null;
}

export interface UseCodapApiResult {
  status: CodapStatus;
  error?: string;
  // Sends a dataset to CODAP. If the data context does not exist, it
  // is created with a flat collection (named "Cases"), the attribute
  // schema is set up, and a CODAP case-table component is opened so
  // the rows are visible. Subsequent sends for the same dataset name
  // skip the create dance and just append items.
  sendDataset: (args: SendDatasetArgs) => Promise<void>;
}

const PLUGIN_OPTIONS = {
  pluginName: "DataGOAT",
  version: "0.1.0",
  dimensions: { width: 380, height: 520 },
};

// Subset of the data-context shape returned by getDataContext that we
// actually consume during type reconciliation on re-send.
interface ExistingDataContextShape {
  collections?: Array<{
    name: string;
    attrs?: Array<{ name: string; type?: string }>;
  }>;
}

// Exported for unit tests; not part of the public hook surface.
export function ensureSuccess(
  result: { success?: boolean } | undefined,
  step: string,
): void {
  if (!result || result.success === false) {
    throw new Error(`CODAP ${step} failed`);
  }
}

export function useCodapApi(): UseCodapApiResult {
  const [status, setStatus] = useState<CodapStatus>("disconnected");
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStatus("connecting");
    initializePlugin(PLUGIN_OPTIONS)
      .then(() => {
        if (cancelled) return;
        setStatus("connected");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logError(err, { source: "codapApi.initializePlugin" });
        setError(
          err instanceof Error ? err.message : "Failed to connect to CODAP",
        );
        setStatus("disconnected");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendDataset({
    name,
    title,
    collectionName,
    tableName,
    attributes,
    rows,
    keyAttribute = "date",
  }: SendDatasetArgs): Promise<void> {
    // Source of truth is CODAP itself, not in-memory state - a page
    // reload of the plugin would otherwise re-trigger create and fail
    // with a duplicate-name error.
    const existing = await getDataContext(name);
    if (!existing?.success) {
      // Create the data context with name + title + collection in one
      // shot via the lower-level sendRequest, matching the noaa-codap-
      // plugin pattern. The library's createDataContext helper only
      // accepts a name, so it can't set the title (which is what CODAP
      // uses as the visible table-tab label).
      ensureSuccess(
        (await codapInterface.sendRequest({
          action: "create",
          resource: "dataContext",
          values: {
            name,
            title: title ?? name,
            collections: [
              {
                name: collectionName,
                title: collectionName,
                attrs: attributes.map((a) => ({
                  name: a.name,
                  type: a.type,
                  ...(a.unit ? { unit: a.unit } : {}),
                })),
              },
            ],
          },
        })) as { success?: boolean },
        "createDataContext",
      );
      // Open a case-table component (attached to the data context, not
      // the collection) so the rows are visible. Without this, items
      // land in CODAP's data model but no UI surfaces them.
      ensureSuccess(await createTable(name, tableName), "createTable");
    } else {
      // Context already exists. Reconcile attribute types from the
      // known specs (no sample-row inference needed). Types are
      // authoritative from the metric registry, so an older context
      // created with a wrong type gets corrected here.
      const existingValues = (
        existing as { values?: ExistingDataContextShape }
      ).values;
      const existingCollection = existingValues?.collections?.find(
        (c) => c.name === collectionName,
      );
      if (existingCollection?.attrs) {
        for (const spec of attributes) {
          const current = existingCollection.attrs.find(
            (a) => a.name === spec.name,
          );
          if (current && current.type !== spec.type) {
            ensureSuccess(
              await updateAttribute(
                name,
                collectionName,
                spec.name,
                { name: spec.name },
                { type: spec.type, ...(spec.unit ? { unit: spec.unit } : {}) },
              ),
              "updateAttribute",
            );
          }
        }
      }
    }
    if (rows.length === 0) return;

    // Upsert path: match incoming rows against existing items by
    // keyAttribute (default "date") so re-pressing "Send to CODAP"
    // updates rows in place rather than producing duplicates.
    if (keyAttribute) {
      const existingItems = await getAllItems(name);
      const keyToId = new Map<string, number | string>();
      const duplicateKeys = new Set<string>();
      if (existingItems?.success) {
        const items = (existingItems.values as
          | Array<{ id: number | string; values: DatasetRow }>
          | undefined) ?? [];
        for (const item of items) {
          const k = item.values?.[keyAttribute];
          if (k == null) continue;
          const key = String(k);
          // Preserve the first id we see for each key. If the user has
          // manually duplicated rows in CODAP, fanning the update out
          // to every duplicate could overwrite intentional edits, so
          // only the first match is updated and the rest are left
          // alone. The console warning surfaces the divergence so it
          // can be cleaned up manually.
          if (keyToId.has(key)) {
            duplicateKeys.add(key);
          } else {
            keyToId.set(key, item.id);
          }
        }
      }
      if (duplicateKeys.size > 0) {
        console.warn(
          `CODAP dataset "${name}" has duplicate ${keyAttribute} values; only the first row for each was updated:`,
          Array.from(duplicateKeys),
        );
      }
      const toCreate: DatasetRow[] = [];
      for (const row of rows) {
        const k = row[keyAttribute];
        const id = k != null ? keyToId.get(String(k)) : undefined;
        if (id !== undefined) {
          ensureSuccess(
            await updateItemByID(name, id, row),
            "updateItemByID",
          );
        } else {
          toCreate.push(row);
        }
      }
      if (toCreate.length > 0) {
        ensureSuccess(await createItems(name, toCreate), "createItems");
      }
      return;
    }

    ensureSuccess(await createItems(name, rows), "createItems");
  }

  return { status, error, sendDataset };
}
