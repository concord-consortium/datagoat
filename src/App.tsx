import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { DataProvider } from "./contexts/DataContext";
import { DemoModeProvider } from "./contexts/DemoModeContext";
import { CustomMetricsProvider } from "./contexts/CustomMetricsContext";
import { AppRoutes } from "./routes/AppRoutes";
import css from "./App.module.css";

export const APP_VERSION = "v0.3.0";
export const APP_VERSION_DESC = "Custom metrics and more default metrics";

export default function App() {
  return (
    <div className={css.app}>
      <BrowserRouter>
        <DemoModeProvider>
          <AuthProvider>
            <UserProvider>
              <CustomMetricsProvider>
                <DataProvider>
                  <AppRoutes />
                </DataProvider>
              </CustomMetricsProvider>
            </UserProvider>
          </AuthProvider>
        </DemoModeProvider>
      </BrowserRouter>
    </div>
  );
}
