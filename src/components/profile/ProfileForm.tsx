import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { updateProfile as firebaseUpdateProfile } from "firebase/auth";
import { auth } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext";
import { useUser } from "../../contexts/UserContext";
import { TextField } from "../form/TextField";
import { SelectField } from "../form/SelectField";
import { PasswordField } from "../auth/PasswordField";
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

  const mode: "onboarding" | "edit" =
    loadState.status === "loaded" ? "edit" : "onboarding";
  const profile = loadState.status === "loaded" ? loadState.profile : null;

  const defaultValues = useMemo<ProfileFormValues>(() => {
    if (profile) {
      return {
        fullName: profile.fullName ?? "",
        email: profile.email ?? user?.email ?? "",
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
      email: user?.email ?? "",
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
      email: values.email,
      nickname: values.nickname ?? "",
      age: Number(values.age),
      heightFt: Number(values.heightFt),
      heightIn: Number(values.heightIn),
      weight: Number(values.weight),
      gender: values.gender,
      athleteType: values.athleteType,
      competitionTerm: values.competitionTerm,
    };

    if (mode === "onboarding") {
      await updateProfile({
        ...profilePartial,
        profileComplete: true,
        // Preserve any existing tracking arrays; first-time onboarding
        // users will run TrackedDataSetup next which sets these.
        trackedWellnessMetrics: profile?.trackedWellnessMetrics ?? [],
        trackedPerformanceMetrics: profile?.trackedPerformanceMetrics ?? [],
        trackingSetupComplete: profile?.trackingSetupComplete ?? false,
      });
      navigate("/setup/tracking");
      return;
    }
    await updateProfile(profilePartial);
    navigate("/dashboard");
  }

  return (
    <div className={css.screenContent}>
      {mode === "onboarding" && (
        <p className={css.profileWelcome}>
          <strong className={css.profileWelcomeTitle}>
            Welcome to DataGOAT
          </strong>
          First, complete your profile. Then you&rsquo;ll choose what training
          and performance data to track.
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

        <TextField
          id="profile-email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@school.edu"
          value={watched.email ?? ""}
          error={errors.email?.message}
          {...register("email")}
        />

        {mode === "onboarding" && (
          <PasswordField
            id="profile-password"
            label="Password"
            autoComplete="new-password"
            placeholder="Create a password"
          />
        )}

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
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            short
            required
            value={watched.age ?? ""}
            error={errors.age?.message}
            {...register("age")}
          />
          <span className={css.fieldUnit}>Yrs</span>
        </div>

        <div className={css.inlineField}>
          <TextField
            id="profile-height-ft"
            label="Height"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            short
            required
            value={watched.heightFt ?? ""}
            error={errors.heightFt?.message}
            {...register("heightFt")}
          />
          <span className={css.fieldUnit}>Ft</span>
          <TextField
            id="profile-height-in"
            label="In"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            short
            required
            ariaLabel="Height inches"
            value={watched.heightIn ?? ""}
            error={errors.heightIn?.message}
            {...register("heightIn")}
          />
          <span className={css.fieldUnit}>In</span>
        </div>

        <div className={css.inlineField}>
          <TextField
            id="profile-weight"
            label="Weight"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
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
      </form>
    </div>
  );
}
