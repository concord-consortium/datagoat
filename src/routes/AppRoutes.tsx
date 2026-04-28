import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./AppShell";
import {
  ProtectedRoute,
  OnboardingRoute,
} from "../components/auth/ProtectedRoute";
import { RedirectIfAuthed } from "../components/auth/RedirectIfAuthed";
import { LoginForm } from "../components/auth/LoginForm";
import { SignupForm } from "../components/auth/SignupForm";
import { ForgotPassword } from "../components/auth/ForgotPassword";
import { EmailVerification } from "../components/auth/EmailVerification";
import { ProfileForm } from "../components/profile/ProfileForm";
import { TrackedDataSetup } from "../components/tracking/TrackedDataSetup";
import { WellnessLog } from "../components/logs/WellnessLog";
import { PerformanceLog } from "../components/logs/PerformanceLog";
import { Dashboard } from "../components/dashboard/Dashboard";
import { ScreenStub } from "../components/ScreenStub";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Auth routes. RedirectIfAuthed sends signed-in users on to
            /dashboard so signInWithPopup success actually leaves the auth
            screen. /verify-email is intentionally OUTSIDE the
            RedirectIfAuthed wrapper because the just-signed-up user is
            authenticated when they reach it (createUser puts them in an
            authed state, then SignupForm navigates to /verify-email);
            redirecting them away on auth state would prevent them from
            ever seeing the screen. Deviation from the Session 1 hand-off
            note "RedirectIfAuthed wraps the auth routes" - documented in
            implementation.md auth-screens-2 step. */}
        <Route element={<RedirectIfAuthed />}>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route path="/verify-email" element={<EmailVerification />} />

        {/* Onboarding routes - gate only on loadState !== 'loading' so new
            users (status='missing') can reach the form and existing users
            (status='loaded') can edit. ProtectedRoute would redirect them
            to /profile, which is where they already are. */}
        <Route element={<OnboardingRoute />}>
          <Route path="/profile" element={<ProfileForm />} />
          <Route path="/setup/tracking" element={<TrackedDataSetup />} />
        </Route>

        {/* Authed routes. ProtectedRoute redirects 'missing' profiles to
            /profile (onboarding entry point). */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wellness" element={<WellnessLog />} />
          <Route
            path="/wellness/:metricId"
            element={<ScreenStub name="MetricDetail (wellness)" />}
          />
          <Route path="/performance" element={<PerformanceLog />} />
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
