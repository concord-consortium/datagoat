import type { MigrationFn } from "./types";

export const registry = new Map<string, MigrationFn>();
