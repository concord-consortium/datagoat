import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { DataProvider } from "./contexts/DataContext";
import { DemoModeProvider } from "./contexts/DemoModeContext";
import { CustomMetricsProvider } from "./contexts/CustomMetricsContext";
import { MetricOverridesProvider } from "./contexts/MetricOverridesContext";
import { AppRoutes } from "./routes/AppRoutes";
import css from "./App.module.css";

export const APP_VERSION = "v0.4.1";
export const APP_VERSION_DESC = "Editable metric goals, performance metric tracking";

export default function App() {
  return (
    <div className={css.app}>
      <BrowserRouter>
        <DemoModeProvider>
          <AuthProvider>
            <UserProvider>
              <CustomMetricsProvider>
                <MetricOverridesProvider>
                  <DataProvider>
                    <AppRoutes />
                  </DataProvider>
                </MetricOverridesProvider>
              </CustomMetricsProvider>
            </UserProvider>
          </AuthProvider>
        </DemoModeProvider>
      </BrowserRouter>
    </div>
  );
}
