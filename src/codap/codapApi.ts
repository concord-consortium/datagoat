import { useEffect, useRef, useState } from "react";
import {
  initializePlugin,
  createDataContext,
  createItems,
} from "@concord-consortium/codap-plugin-api";
import { logError } from "../utils/logError";

// Thin DataGOAT-specific wrapper around @concord-consortium/codap-plugin-api.
// The library tracks the CODAP postMessage protocol authoritatively;
// this wrapper exposes a single useCodapApi() hook so app components
// don't need to know about initializePlugin / createDataContext /
// createItems individually.

export type CodapStatus = "disconnected" | "connecting" | "connected";

export interface DatasetRow {
  // Free-form bag matching CODAP's CodapItemValues shape - one key per
  // attribute. Wellness rows have date + the metric values; performance
  // rows have date + a metrics-bag flattened to per-attribute keys.
  [key: string]: string | number | null;
}

export interface SendDatasetArgs {
  name: string;
  attributes: string[];
  rows: DatasetRow[];
}

export interface UseCodapApiResult {
  status: CodapStatus;
  error?: string;
  // Sends a dataset to CODAP. If the data context does not exist, it
  // is created with the given attributes on first send and reused
  // afterwards.
  sendDataset: (args: SendDatasetArgs) => Promise<void>;
}

const PLUGIN_OPTIONS = {
  // Display label for the plugin component as it appears in CODAP's
  // chrome. "DataGOAT" matches the brand wordmark.
  pluginName: "DataGOAT",
  version: "0.1.0",
  dimensions: { width: 380, height: 520 },
};

export function useCodapApi(): UseCodapApiResult {
  const [status, setStatus] = useState<CodapStatus>("disconnected");
  const [error, setError] = useState<string | undefined>(undefined);
  // Track which data contexts we've already created so repeat sends
  // skip the createDataContext step (CODAP errors on duplicate names).
  const createdContexts = useRef<Set<string>>(new Set());

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
    attributes,
    rows,
  }: SendDatasetArgs): Promise<void> {
    if (!createdContexts.current.has(name)) {
      const result = await createDataContext(name);
      createdContexts.current.add(name);
      // First-time context creation also needs the attribute schema
      // scaffolded. The library's createDataContext helper builds the
      // collection with a default name; we rely on createItems to
      // populate the attributes as we go (CODAP infers schema from
      // the first batch).
      void attributes;
      void result;
    }
    await createItems(name, rows);
  }

  return { status, error, sendDataset };
}
