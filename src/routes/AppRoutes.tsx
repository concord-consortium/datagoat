import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { RedirectIfAuthed } from "../components/auth/RedirectIfAuthed";
import { LoginForm } from "../components/auth/LoginForm";
import { SignupForm } from "../components/auth/SignupForm";
import { ScreenStub } from "../components/ScreenStub";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Auth routes — LoginForm + SignupForm landed in Step 7;
            ForgotPassword + EmailVerification land in Step 8 (still stubbed
            via SignupForm so the routes are reachable for now).
            RedirectIfAuthed sends signed-in users on to /dashboard so
            signInWithPopup success actually leaves the auth screen. */}
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route
            path="/forgot-password"
            element={<ScreenStub name="ForgotPassword" />}
          />
          <Route
            path="/verify-email"
            element={<ScreenStub name="EmailVerification" />}
          />
        </Route>

        {/* Authed routes. Onboarding-route gating arrives with UserContext. */}
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ScreenStub name="ProfileForm" />} />
          <Route
            path="/setup/tracking"
            element={<ScreenStub name="TrackedDataSetup" />}
          />
          <Route path="/dashboard" element={<ScreenStub name="Dashboard" />} />
          <Route path="/wellness" element={<ScreenStub name="WellnessLog" />} />
          <Route
            path="/wellness/:metricId"
            element={<ScreenStub name="MetricDetail (wellness)" />}
          />
          <Route
            path="/performance"
            element={<ScreenStub name="PerformanceLog" />}
          />
          <Route
            path="/performance/:metricId"
            element={<ScreenStub name="MetricDetail (performance)" />}
          />
          <Route
            path="/add-metric/:type"
            element={<ScreenStub name="AddMetric" />}
          />
          <Route path="/info/:topic" element={<ScreenStub name="InfoScreen" />} />
          <Route path="/about" element={<ScreenStub name="About" />} />
        </Route>

        {/* /codap is intentionally not wrapped in ProtectedRoute - it inspects
            useAuth() directly. Lands as a top-level sibling of the AppShell
            layout route in the CODAP plugin step (this stub keeps the route
            reachable until then). */}
        <Route path="/codap" element={<ScreenStub name="CodapPlugin" />} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
