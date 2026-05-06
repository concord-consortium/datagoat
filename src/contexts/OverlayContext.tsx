import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// OverlayContext counts the number of open modal overlays in the tree
// (Dialog primitives, future top-sheets, etc.). Components that should
// pause ambient behavior while ANY overlay is open (the dashboard
// header carousel, AppShell's focusin auto-scroll, etc.) read
// useIsAnyOverlayOpen() instead of subscribing to a specific overlay's
// state.
//
// Provider mounts in AppShell so every authed-route consumer can read
// the count. Dialog calls register on open and unregister on close;
// re-entrancy is supported via reference counting (multiple dialogs
// open simultaneously -> count > 1, isAnyOpen still true).

interface OverlayContextValue {
  register: () => () => void;
  isAnyOpen: boolean;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  // Track the function-instance count separately from React state so
  // strict-mode double-effect doesn't double-count.
  const refCount = useRef(0);

  const register = useCallback(() => {
    refCount.current += 1;
    setCount(refCount.current);
    return () => {
      refCount.current = Math.max(0, refCount.current - 1);
      setCount(refCount.current);
    };
  }, []);

  const value = useMemo<OverlayContextValue>(
    () => ({ register, isAnyOpen: count > 0 }),
    [register, count],
  );

  return (
    <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
  );
}

export function useIsAnyOverlayOpen(): boolean {
  const ctx = useContext(OverlayContext);
  // Contexts not provided (e.g. tests rendering Dialog in isolation)
  // are treated as "no overlays open" rather than throwing - the
  // pause-guard semantics degrade safely.
  return ctx?.isAnyOpen ?? false;
}

export function useOverlayRegister(): () => () => void {
  const ctx = useContext(OverlayContext);
  // Same fallback rationale as useIsAnyOverlayOpen - if no provider
  // exists, register is a no-op so Dialog still works in isolated
  // renders.
  return ctx?.register ?? (() => () => {});
}
