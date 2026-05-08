import { lazy, Suspense } from "react";
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
import { MetricDetail } from "../charts/MetricDetail";
import { AddMetric } from "../components/tracking/AddMetric";
import { CustomMetricForm } from "../components/tracking/CustomMetricForm";
import { InfoScreen } from "../components/info/InfoScreen";
import { About } from "../components/about/About";
import { Loading } from "../components/Loading";

// Lazy-loaded to keep the codap-plugin-api dependency out of the initial bundle for non-CODAP visitors.
const CodapPlugin = lazy(() => import("@/codap/CodapPlugin"));

export function AppRoutes() {
  return (
    <Routes>
      {/* /codap lives at the TOP LEVEL of <Routes>, as a sibling of the
          AppShell layout route. The route-tree position is what
          excludes /codap from the AppShell - no AppHeader, no
          HamburgerMenu, no VerificationBanner - by virtue of where it
          sits in the tree, not by any path-checking elsewhere. */}
      <Route
        path="/codap"
        element={
          <Suspense fallback={<Loading />}>
            <CodapPlugin />
          </Suspense>
        }
      />

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
          {/* /info/:topic lives under OnboardingRoute (not ProtectedRoute
              as initially spec'd) because the info screens are reached
              from the /profile field-info-btn buttons during onboarding,
              when loadState.status === 'missing'. ProtectedRoute would
              redirect back to /profile, dead-ending the info link. */}
          <Route path="/info/:topic" element={<InfoScreen />} />
        </Route>

        {/* Authed routes. ProtectedRoute redirects 'missing' profiles to
            /profile (onboarding entry point). */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/wellness" element={<WellnessLog />} />
          <Route
            path="/wellness/:metricId"
            element={<MetricDetail type="wellness" />}
          />
          <Route path="/performance" element={<PerformanceLog />} />
          <Route
            path="/performance/:metricId"
            element={<MetricDetail type="performance" />}
          />
          <Route path="/add-metric/:type/new" element={<CustomMetricForm />} />
          <Route
            path="/add-metric/:type/:metricId"
            element={<CustomMetricForm />}
          />
          <Route path="/add-metric/:type" element={<AddMetric />} />
          <Route path="/about" element={<About />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
