import { useState, type FormEvent } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Link } from "react-router-dom";
import { auth } from "../services/firebase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError("Failed to send reset email. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200 px-4">
      <div className="card w-full max-w-md bg-base-100 shadow-lg">
        <div className="card-body">
          <div className="text-center mb-4">
            <h1 className="text-3xl font-bold text-secondary">DataGOAT</h1>
          </div>

          <h2 className="text-xl font-semibold text-center">Reset Password</h2>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="alert alert-success text-base">
                <span>
                  Password reset email sent to <strong>{email}</strong>. Check
                  your inbox.
                </span>
              </div>
              <Link to="/login" className="btn btn-primary">
                Back to Login
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="alert alert-error text-base">
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-control">
                  <label className="label" htmlFor="email">
                    <span className="label-text">Email address</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="input input-bordered w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Send Reset Email"
                  )}
                </button>
              </form>

              <p className="text-center text-base mt-2">
                <Link to="/login" className="link link-primary">
                  Back to Login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
