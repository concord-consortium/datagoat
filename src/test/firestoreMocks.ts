// Shared utilities for tests that mount the real <DataProvider>
// against a mocked Firestore + auth boundary. The DataContext
// optimistic-merge contract is a cross-cutting invariant; tests that
// mock DataContext itself bypass the merge memo and reconciliation,
// defeating the purpose.
//
// Each test file owns its own hoisted state object (defined with
// vi.hoisted so it is available inside vi.mock factories) and passes
// it to the helpers below.
import { vi } from "vitest";

export interface MockSnapshotDoc {
  path: string;
  data: Record<string, unknown>;
}

export interface MockSnapshot {
  forEach(
    cb: (d: {
      ref: { path: string };
      data(): Record<string, unknown>;
    }) => void,
  ): void;
  metadata?: { hasPendingWrites: boolean };
}

export interface MockSubscriptionHandle {
  path: string;
  emit(
    docs: MockSnapshotDoc[],
    metadata?: { hasPendingWrites: boolean },
  ): void;
  active: boolean;
}

export interface MockUserHandle {
  current: { uid: string } | null;
}

export interface FirestoreMockState {
  setDoc: ReturnType<typeof vi.fn>;
  healthSubs: MockSubscriptionHandle[];
  competitionSubs: MockSubscriptionHandle[];
  user: MockUserHandle;
}

export function makeSnapshot(
  docs: MockSnapshotDoc[],
  metadata?: { hasPendingWrites: boolean },
): MockSnapshot {
  return {
    forEach(cb) {
      docs.forEach((d) =>
        cb({
          ref: { path: d.path },
          data: () => d.data,
        }),
      );
    },
    metadata,
  };
}

// Build the firebase/firestore mock object from the state. Use inside
// a vi.mock("firebase/firestore", () => firestoreMockFactory(state))
// factory.
// Sentinel class so tests can verify deleteField() was passed.
export class DeleteFieldSentinel {
  readonly _type = "deleteField" as const;
}

export function firestoreMockFactory(state: FirestoreMockState) {
  return {
    deleteField: () => new DeleteFieldSentinel(),
    collection: (..._args: unknown[]) => {
      const parts = _args.slice(1).filter((a) => typeof a === "string");
      return { path: parts.join("/") };
    },
    doc: (..._args: unknown[]) => {
      const parts = _args.slice(1).filter((a) => typeof a === "string");
      return { path: parts.join("/") };
    },
    // query() preserves the underlying ref's path so onSnapshot's
    // path-based routing keeps working. where() is opaque - the mock
    // does not enforce filtering; the production code is what we test.
    query: (ref: { path: string }, ..._constraints: unknown[]) => ({
      path: ref.path,
    }),
    where: (..._args: unknown[]) => ({ __mockWhere: true }),
    onSnapshot: (
      ref: { path: string },
      cb: (snap: MockSnapshot) => void,
    ) => {
      const handle: MockSubscriptionHandle = {
        path: ref.path,
        active: true,
        emit(docs, metadata) {
          if (!handle.active) return;
          cb(makeSnapshot(docs, metadata));
        },
      };
      const segments = ref.path.split("/");
      if (segments.includes("healthEntries")) {
        state.healthSubs.push(handle);
      } else if (segments.includes("competitionEntries")) {
        state.competitionSubs.push(handle);
      }
      return () => {
        handle.active = false;
      };
    },
    setDoc: state.setDoc,
  };
}

// Build the AuthContext mock from the state. Ref-style user handle:
// mutating state.user.current does NOT trigger a re-render.
export function authMockFactory(state: FirestoreMockState) {
  return {
    useAuth: () => ({ user: state.user.current }),
  };
}

// Convenience: returns the most-recently-attached active subscription
// for a collection. The provider re-subscribes on user change, so
// older handles may be inactive.
export function latestSub(
  subs: MockSubscriptionHandle[],
): MockSubscriptionHandle | undefined {
  return subs.filter((s) => s.active).slice(-1)[0];
}

// Reset state between tests. Mutates in place so refs from vi.hoisted
// remain valid.
export function resetFirestoreState(state: FirestoreMockState) {
  state.setDoc.mockClear();
  state.healthSubs.length = 0;
  state.competitionSubs.length = 0;
  state.user.current = null;
}
