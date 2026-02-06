import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getProfile, saveProfile } from "../services/profile";
import {
  SPORTS,
  SPORT_LABELS,
  GENDERS,
  GENDER_LABELS,
  type Sport,
  type Gender,
  type Profile,
} from "../types/profile";

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [sport, setSport] = useState<Sport>("baseball");
  const [weight, setWeight] = useState<number>(0);
  const [age, setAge] = useState<number>(0);
  const [gender, setGender] = useState<Gender>("unspecified");
  const [dailySetupComplete, setDailySetupComplete] = useState(false);
  const [outcomesSetupComplete, setOutcomesSetupComplete] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProfile(user.uid).then((profile) => {
      if (profile) {
        setUsername(profile.username);
        setSport(profile.sport);
        setWeight(profile.weight);
        setAge(profile.age);
        setGender(profile.gender);
        setDailySetupComplete(profile.dailySetupComplete);
        setOutcomesSetupComplete(profile.outcomesSetupComplete);
      }
      setLoading(false);
    });
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSaving(true);
    try {
      const profile: Omit<Profile, "schemaVersion"> = {
        username,
        sport,
        weight,
        age,
        gender,
        dailySetupComplete,
        outcomesSetupComplete,
      };
      await saveProfile(user.uid, profile);
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const hasSetup = dailySetupComplete || outcomesSetupComplete;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      {error && (
        <div className="alert alert-error text-base">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-control">
          <label className="label" htmlFor="username">
            <span className="label-text">Username</span>
          </label>
          <input
            id="username"
            type="text"
            className="input input-bordered w-full"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="form-control">
          <label className="label" htmlFor="sport">
            <span className="label-text">Sport</span>
          </label>
          <select
            id="sport"
            className="select select-bordered w-full"
            value={sport}
            onChange={(e) => setSport(e.target.value as Sport)}
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {SPORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="form-control">
            <label className="label" htmlFor="weight">
              <span className="label-text">Weight (lbs)</span>
            </label>
            <input
              id="weight"
              type="number"
              className="input input-bordered w-full"
              value={weight || ""}
              onChange={(e) => setWeight(Number(e.target.value))}
              min={0}
              max={500}
              required
            />
          </div>
          <div className="form-control">
            <label className="label" htmlFor="age">
              <span className="label-text">Age (yr)</span>
            </label>
            <input
              id="age"
              type="number"
              className="input input-bordered w-full"
              value={age || ""}
              onChange={(e) => setAge(Number(e.target.value))}
              min={0}
              max={100}
              required
            />
          </div>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="gender">
            <span className="label-text">Gender</span>
          </label>
          <select
            id="gender"
            className="select select-bordered w-full"
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
          >
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={saving}
        >
          {saving ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Save Profile"
          )}
        </button>
      </form>

      {/* Setup paths */}
      <div className="divider">Data Setup</div>

      {!hasSetup && (
        <div className="alert alert-info text-base">
          <span>
            Complete at least one setup to start tracking your data.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title text-base">
              Setup Your Daily Data
              {dailySetupComplete && (
                <span className="badge badge-success badge-sm">Done</span>
              )}
            </h3>
            <p className="text-base">Choose which body metrics to track daily.</p>
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => navigate("/setup/daily")}
            >
              {dailySetupComplete ? "Edit Setup" : "Get Started"}
            </button>
          </div>
        </div>

        <div className="card bg-base-200">
          <div className="card-body">
            <h3 className="card-title text-base">
              Setup Your Outcomes Data
              {outcomesSetupComplete && (
                <span className="badge badge-success badge-sm">Done</span>
              )}
            </h3>
            <p className="text-base">
              Choose which sport outcomes to track.
            </p>
            <button
              className="btn btn-primary btn-sm mt-2"
              onClick={() => navigate("/setup/outcomes")}
            >
              {outcomesSetupComplete ? "Edit Setup" : "Get Started"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
