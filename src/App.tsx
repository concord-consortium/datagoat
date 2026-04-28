import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import { AppRoutes } from "./routes/AppRoutes";
import css from "./App.module.css";

export const APP_VERSION = "v0.1.0";
export const APP_VERSION_DESC = "Prototype-to-React conversion (foundations)";

export default function App() {
  return (
    <div className={css.app}>
      <BrowserRouter>
        <AuthProvider>
          <UserProvider>
            <AppRoutes />
          </UserProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
