import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { updateProfile as firebaseUpdateProfile } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import { TextField } from "../form/TextField";
import { SelectField } from "../form/SelectField";
import { logError } from "../../utils/logError";
import {
  profileSchema,
  type ProfileFormValues,
  COMPETITION_TERM_OPTIONS,
  GENDER_OPTIONS,
  ATHLETE_TYPE_OPTIONS,
} from "./profileSchema";
import buttons from "../form/buttons.module.css";
import css from "./ProfileForm.module.css";

// Profile screen. Two derived modes: 'onboarding' when no Firestore profile
// exists yet, 'edit' when one is loaded. Mode is derived inline from
// useUser().loadState - no prop drilling.
//
// Submit dual-writes:
//   1. Firebase Auth updateProfile({ displayName: fullName }) - keeps
//      user.displayName consistent with the Firestore fullName.
//   2. Firestore profile via useUser().updateProfile().
// If the Auth-side write rejects, log via logError and continue to the
// Firestore write - the Firestore profile is canonical.
export function ProfileForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loadState, updateProfile } = useUser();
  const [formError, setFormError] = useState("");

  const mode: "onboarding" | "edit" =
    loadState.status === "loaded" ? "edit" : "onboarding";
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const defaultValues = useMemo<ProfileFormValues>(() => {
    if (profile) {
      return {
        fullName: profile.fullName ?? "",
        nickname: profile.nickname ?? "",
        age: profile.age ? String(profile.age) : "",
        heightFt: profile.heightFt ? String(profile.heightFt) : "",
        heightIn: profile.heightIn != null ? String(profile.heightIn) : "",
        weight: profile.weight ? String(profile.weight) : "",
        gender: profile.gender,
        athleteType: profile.athleteType,
        competitionTerm: profile.competitionTerm ?? "",
      };
    }
    return {
      fullName: user?.displayName ?? "",
      nickname: "",
      age: "",
      heightFt: "",
      heightIn: "",
      weight: "",
      gender: "unspecified",
      athleteType: "endurance",
      competitionTerm: "",
    } as ProfileFormValues;
  }, [profile, user]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });

  // Reset when the underlying profile load finishes - on cold start the form
  // mounts before useUser().loadState resolves, so we re-seed once it does.
  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  // Drive .has-value declaratively per spec - no global input listener.
  const watched = watch();

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    setFormError("");
    if (auth.currentUser) {
      try {
        await firebaseUpdateProfile(auth.currentUser, {
          displayName: values.fullName,
        });
      } catch (err) {
        // Non-fatal: the Firestore profile write is canonical.
        logError(err, { stage: "profileForm.firebaseUpdateProfile" });
      }
    }

    const profilePartial = {
      fullName: values.fullName,
      // Copy the auth-side email into the Firestore profile so other
      // consumers (Dashboard, MetricDetail, future export flows) can
      // read profile.email without a roundtrip through auth. The user
      // never edits this on the screen - Firebase Auth is canonical.
      email: user.email ?? "",
      nickname: values.nickname ?? "",
      age: Number(values.age),
      heightFt: Number(values.heightFt),
      heightIn: Number(values.heightIn),
      weight: Number(values.weight),
      gender: values.gender,
      athleteType: values.athleteType,
      competitionTerm: values.competitionTerm,
    };

    try {
      if (mode === "onboarding") {
        // Only the form fields + profileComplete are written. tracked*Metrics
        // and trackingSetupComplete are intentionally omitted: setDoc(merge:true)
        // leaves untouched fields alone, so a true new user gets a doc without
        // them (TrackedDataSetup defaults to the full registry when these are
        // undefined), and a returning user who reached the form via a stale
        // load state keeps any existing tracking selections rather than having
        // them clobbered. The next screen (TrackedDataSetup) is what writes
        // these fields for real.
        await updateProfile({
          ...profilePartial,
          profileComplete: true,
        });
        navigate("/setup/tracking");
        return;
      }
      await updateProfile(profilePartial);
      navigate("/dashboard");
    } catch (err) {
      // The Auth-side displayName may have already updated; we don't
      // try to roll it back since Firebase Auth has no transactional
      // API. The next successful submit re-syncs both writes.
      logError(err, { stage: "profileForm.updateProfile", mode });
      setFormError("Couldn't save your profile. Please try again.");
    }
  }

  return (
    <div className={css.screenContent}>
      {mode === "onboarding" && (
        <div className={css.profileWelcome}>
          <h2 className={css.profileWelcomeTitle}>Welcome to DataGOAT</h2>
          <p>
            First, complete your profile. Then you&rsquo;ll choose what training
            and performance data to track.
          </p>
        </div>
      )}

      {user?.email && (
        <p className={css.signedInAs}>
          Signed in as <strong>{user.email}</strong>
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          id="profile-fullname"
          label="Full Name"
          required
          autoComplete="name"
          placeholder="Your name"
          value={watched.fullName ?? ""}
          error={errors.fullName?.message}
          {...register("fullName")}
        />

        {/* Email is NOT a form field. The prototype's #profile-screen
            shows an editable email + a password field; the React app
            relies on Firebase Auth as the canonical source for both,
            so neither is editable here. Email is rendered above the
            form as read-only "Signed in as ..." muted text; a future
            change-email flow goes through re-auth + updateEmail(). */}

        <TextField
          id="profile-nickname"
          label="Nickname"
          autoComplete="nickname"
          placeholder="What teammates call you"
          value={watched.nickname ?? ""}
          error={errors.nickname?.message}
          {...register("nickname")}
        />

        <div className={css.inlineField}>
          <TextField
            id="profile-age"
            label="Age"
            type="number"
            min={0}
            short
            required
            value={watched.age ?? ""}
            error={errors.age?.message}
            {...register("age")}
          />
          <span className={css.fieldUnit}>Yrs</span>
        </div>

        <fieldset className={css.heightFieldset}>
          <legend className={css.heightLegend}>Height</legend>
          <div className={`${css.inlineField} ${css.heightInlineField}`}>
            <TextField
              id="profile-height-ft"
              label="Feet"
              labelVisuallyHidden
              type="number"
              min={0}
              short
              required
              value={watched.heightFt ?? ""}
              error={errors.heightFt?.message}
              {...register("heightFt")}
            />
            <span className={css.fieldUnit} aria-hidden="true">Ft</span>
            <TextField
              id="profile-height-in"
              label="In"
              type="number"
              min={0}
              short
              required
              value={watched.heightIn ?? ""}
              error={errors.heightIn?.message}
              {...register("heightIn")}
            />
            <span className={css.fieldUnit} aria-hidden="true">In</span>
          </div>
        </fieldset>

        <div className={css.inlineField}>
          <TextField
            id="profile-weight"
            label="Weight"
            type="number"
            min={0}
            short
            required
            value={watched.weight ?? ""}
            error={errors.weight?.message}
            {...register("weight")}
          />
          <span className={css.fieldUnit}>Lbs</span>
        </div>

        <SelectField
          id="profile-gender"
          label="Gender"
          required
          options={GENDER_OPTIONS}
          infoTopic="gender"
          infoLabel="Gender info"
          value={watched.gender ?? ""}
          error={errors.gender?.message}
          {...register("gender")}
        />

        <SelectField
          id="profile-sport"
          label="Athlete Type"
          required
          options={ATHLETE_TYPE_OPTIONS}
          infoTopic="athlete-type"
          infoLabel="Athlete Type info"
          value={watched.athleteType ?? ""}
          error={errors.athleteType?.message}
          {...register("athleteType")}
        />

        <SelectField
          id="profile-competition-term"
          label="Competition Term"
          options={COMPETITION_TERM_OPTIONS}
          infoTopic="comp-term"
          infoLabel="Competition Term info"
          value={watched.competitionTerm ?? ""}
          error={errors.competitionTerm?.message}
          {...register("competitionTerm")}
        />

        <button
          type="submit"
          className={buttons.setupBtn}
          disabled={isSubmitting}
        >
          {mode === "onboarding" ? "Set Up Your Tracked Data" : "Save"}
        </button>

        {formError && (
          <p className={css.formError} role="alert">
            {formError}
          </p>
        )}
      </form>
    </div>
  );
}
