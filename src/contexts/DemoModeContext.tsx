// Session-scoped demo-mode flag. Read once at mount from the `?demo` URL
// param and held for the rest of the session — navigation that drops
// the param doesn't kick the user out of demo mode. A page refresh
// without `?demo` in the URL resets the flag (the intentional way to
// leave demo mode).
//
// Used by chart consumers (DashboardChartCard, MetricDetail) via
// useDemoMode() to swap between Firestore-backed series and the random
// demo generator (see src/charts/useChartSeries.ts).

import { createContext, useContext, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

const DemoModeContext = createContext(false);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const [enabled] = useState(() => params.get("demo") !== null);
  return (
    <DemoModeContext.Provider value={enabled}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode(): boolean {
  return useContext(DemoModeContext);
}
