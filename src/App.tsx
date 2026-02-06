import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { DailyDataSetupPage } from "./pages/DailyDataSetupPage";
import { OutcomesSetupPage } from "./pages/OutcomesSetupPage";
import { TrackBodyPage } from "./pages/TrackBodyPage";
import { MetricDetailPage } from "./pages/MetricDetailPage";
import { TrackOutcomesPage } from "./pages/TrackOutcomesPage";
import { AdminPage } from "./pages/AdminPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/setup/daily" element={<DailyDataSetupPage />} />
            <Route path="/setup/outcomes" element={<OutcomesSetupPage />} />
            <Route path="/track/body" element={<TrackBodyPage />} />
            <Route
              path="/track/body/:metricId"
              element={<MetricDetailPage />}
            />
            <Route path="/track/outcomes" element={<TrackOutcomesPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
