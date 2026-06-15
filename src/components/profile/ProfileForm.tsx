import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import { useLocation, useNavigate } from "react-router-dom";
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
import { profileAutosavePartial } from "./profileAutosave";
import buttons from "../form/buttons.module.css";
import fields from "../form/fields.module.css";
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
  const location = useLocation();
  const { user } = useAuth();
  const { loadState, updateProfile } = useUser();
  const [formError, setFormError] = useState("");

  const profile = loadState.status === "loaded" ? loadState.profile : null;
  // Onboarding vs edit keys off profileComplete, NOT mere doc existence:
  // auto-save now creates the profile doc before onboarding is finished, so a
  // loaded-but-incomplete profile is still onboarding. Mirrors the
  // HamburgerMenu gate, which already keys off profileComplete.
  const mode: "onboarding" | "edit" = profile?.profileComplete
    ? "edit"
    : "onboarding";

  const defaultValues = useMemo<ProfileFormValues>(() => {
    if (profile) {
      return {
        fullName: profile.fullName ?? "",
        nickname: profile.nickname ?? "",
        age: profile.age ? String(profile.age) : "",
        heightFt: profile.heightFt ? String(profile.heightFt) : "",
        heightIn: profile.heightIn != null ? String(profile.heightIn) : "",
        weight: profile.weight ? String(profile.weight) : "",
        // Fall back to the same "unselected" state as fresh onboarding: a
        // partially auto-saved doc can lack gender/athleteType, so normalize
        // missing values to "" rather than leaking undefined into the form.
        // ("" | Enum) overlaps the enum, so a plain cast suffices here.
        gender: (profile.gender ?? "") as ProfileFormValues["gender"],
        athleteType: (profile.athleteType ??
          "") as ProfileFormValues["athleteType"],
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
      // Start the two required selects unselected so first-timers see the
      // "Select …" placeholder and must make an explicit choice. "" isn't a
      // member of either enum, so the schema rejects it with the required
      // message until the user picks (hence the cast through unknown). Edit
      // mode seeds the stored value above, so returning users are unaffected;
      // competitionTerm stays optional - blank is valid, treated as "game".
      gender: "" as unknown as ProfileFormValues["gender"],
      athleteType: "" as unknown as ProfileFormValues["athleteType"],
      competitionTerm: "",
    };
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

  // Seed the form exactly once, after loadState first resolves. On cold start
  // the form can mount before useUser().loadState settles, so we wait out the
  // 'loading' state and seed on the first loaded/missing snapshot. We must NOT
  // re-seed on later snapshots: auto-save now pushes the profile doc back
  // through onSnapshot, and re-running reset() would clobber whatever the user
  // is mid-typing. While mounted, RHF is the source of truth.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    if (loadState.status === "loading") return;
    reset(defaultValues);
    seeded.current = true;
  }, [loadState.status, defaultValues, reset]);

  // Drive .has-value declaratively per spec - no global input listener.
  const watched = watch();

  // Auto-save: the Profile screen persists like the rest of the app (tracked
  // metrics, logs) instead of only on the button press, so a user who fills
  // the form and then leaves (e.g. hamburger -> About) doesn't lose anything.
  // Writes are debounced and only ever include the currently-valid subset
  // (see profileAutosavePartial), so a half-typed field never clobbers a
  // stored value and the profile is never marked complete here.
  const AUTOSAVE_DEBOUNCE_MS = 500;
  const autosaveTimer = useRef<number | null>(null);
  const pendingValues = useRef<ProfileFormValues | null>(null);
  // updateProfile's identity changes on every profile snapshot (its context
  // value is memoized on loadState). Hold it in a ref so the auto-save
  // callbacks stay stable and don't re-subscribe/flush on every snapshot.
  const updateProfileRef = useRef(updateProfile);
  updateProfileRef.current = updateProfile;

  const flushAutosave = useCallback(() => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const values = pendingValues.current;
    pendingValues.current = null;
    if (!values) return;
    // Safe to fire-and-forget: every write goes through the same setDoc on the
    // same doc/SDK instance, and Firestore queues same-client mutations in
    // issue order, so a stale autosave can't land after a later submit/Done.
    void updateProfileRef.current(profileAutosavePartial(values)).catch((err) =>
      logError(err, { stage: "profileForm.autosave" }),
    );
  }, []);

  useEffect(() => {
    // `name` is undefined for the programmatic reset() seed; only schedule on
    // a real user edit so a fresh onboarding form doesn't write empty defaults.
    const sub = watch((values, { name }) => {
      if (!name) return;
      pendingValues.current = values as ProfileFormValues;
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
      }
      autosaveTimer.current = window.setTimeout(
        flushAutosave,
        AUTOSAVE_DEBOUNCE_MS,
      );
    });
    return () => sub.unsubscribe();
  }, [watch, flushAutosave]);

  // Flush any pending write when the form unmounts (navigation away), so the
  // last edit before a debounce fires isn't dropped.
  useEffect(() => flushAutosave, [flushAutosave]);

  async function onSubmit(values: ProfileFormValues) {
    if (!user) return;
    // Only onboarding submits. Edit mode saves continuously via auto-save and
    // leaves via the "Done" button, so a stray Enter keypress must not write
    // or navigate.
    if (mode === "edit") return;
    setFormError("");
    // The authoritative write below supersedes any pending auto-save; cancel
    // it so the unmount flush after navigation doesn't fire a redundant write.
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    pendingValues.current = null;
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
      // Only the form fields + profileComplete are written. tracked*Metrics
      // and trackingSetupComplete are intentionally omitted: setDoc(merge:true)
      // leaves untouched fields alone, so a true new user gets a doc without
      // them (TrackedDataSetup defaults to the full registry when these are
      // undefined), and a returning user who reached the form via a stale
      // load state keeps any existing tracking selections rather than having
      // them clobbered. The next screen (TrackedDataSetup) is what writes
      // these fields for real.
      //
      // Stamp profileComplete: true here so an incomplete-but-loaded doc -
      // which mode now treats as onboarding (mode keys off profileComplete,
      // not mere doc existence) - heals into a complete profile on submit
      // instead of leaving the user stuck on /profile. Only onboarding reaches
      // this code; edit mode saves via auto-save and exits via "Done".
      await updateProfile({
        ...profilePartial,
        profileComplete: true,
      });
      // Onboarding advances to the tracked-data setup step.
      navigate("/setup/tracking");
    } catch (err) {
      // The Auth-side displayName may have already updated; we don't
      // try to roll it back since Firebase Auth has no transactional
      // API. The next successful submit re-syncs both writes.
      logError(err, { stage: "profileForm.updateProfile", mode });
      setFormError("Couldn't save your profile. Please try again.");
    }
  }

  // Edit-mode exit: saving is automatic, so "Done" simply returns the user to
  // wherever they came from. The hamburger seeds location.state.backTo when it
  // links here; with no known origin (deep link / refresh) we fall back to the
  // dashboard so the user is never stranded on the screen.
  function handleDone() {
    flushAutosave();
    const backTo = (location.state as { backTo?: string } | null)?.backTo;
    navigate(backTo ?? "/dashboard");
  }

  return (
    <div className={css.screenContent}>
      {mode === "onboarding" && (
        <div className={css.profileWelcome}>
          <h2 className={css.profileWelcomeTitle}>Welcome to DataGOAT</h2>
          <p>
            First, complete your profile. Then you&rsquo;ll choose what training
            and competition data to track.
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

        {/* Age / Height / Weight render the prototype's flat single-row
            markup (label + narrow input(s) + unit(s) + error all as direct
            children of .inlineField) rather than going through TextField,
            whose label-above-input wrapper splits these short-label fields
            across lines and traps the error message inside the row. */}
        <div className={css.inlineField}>
          <label className={fields.fieldLabel} htmlFor="profile-age">
            Age
            <span className={fields.requiredMark} aria-hidden="true">*</span>
          </label>
          <input
            id="profile-age"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            className={clsx(
              fields.fieldInput,
              css.numInputWide,
              watched.age && fields.hasValue,
              errors.age && fields.fieldError,
            )}
            aria-required="true"
            aria-invalid={errors.age ? true : undefined}
            aria-describedby={errors.age ? "profile-age-error" : undefined}
            value={watched.age ?? ""}
            {...register("age")}
          />
          <span className={css.fieldUnit}>Yrs</span>
          {errors.age && (
            <p id="profile-age-error" className={fields.fieldErrorMsg} role="alert">
              {errors.age.message}
            </p>
          )}
        </div>

        {/* Height: one "Height" label (bound to the feet input), two narrow
            inputs with Ft/In units, and a single shared error line. The
            inches input has no visible label per spec - it carries an
            aria-label instead. role="group" + aria-label restores the
            programmatic grouping the old <fieldset>/<legend> provided (the
            two inputs are one measurement) without its layout baggage. */}
        <div className={css.inlineField} role="group" aria-label="Height">
          <label className={fields.fieldLabel} htmlFor="profile-height-ft">
            Height
            <span className={fields.requiredMark} aria-hidden="true">*</span>
          </label>
          <input
            id="profile-height-ft"
            type="text"
            inputMode="numeric"
            pattern="[0-8]"
            maxLength={1}
            className={clsx(
              fields.fieldInput,
              css.numInput,
              watched.heightFt && fields.hasValue,
              errors.heightFt && fields.fieldError,
            )}
            aria-required="true"
            aria-invalid={errors.heightFt ? true : undefined}
            aria-describedby={
              errors.heightFt || errors.heightIn
                ? "profile-height-error"
                : undefined
            }
            value={watched.heightFt ?? ""}
            {...register("heightFt")}
          />
          <span className={css.fieldUnit}>Ft</span>
          <input
            id="profile-height-in"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.]?[0-9]*"
            maxLength={5}
            aria-label="Height inches"
            className={clsx(
              fields.fieldInput,
              css.numInput,
              watched.heightIn && fields.hasValue,
              errors.heightIn && fields.fieldError,
            )}
            aria-required="true"
            aria-invalid={errors.heightIn ? true : undefined}
            aria-describedby={
              errors.heightFt || errors.heightIn
                ? "profile-height-error"
                : undefined
            }
            value={watched.heightIn ?? ""}
            {...register("heightIn")}
          />
          <span className={css.fieldUnit}>In</span>
          {(errors.heightFt || errors.heightIn) && (
            <p
              id="profile-height-error"
              className={fields.fieldErrorMsg}
              role="alert"
            >
              {errors.heightFt?.message ?? errors.heightIn?.message}
            </p>
          )}
        </div>

        <div className={css.inlineField}>
          <label className={fields.fieldLabel} htmlFor="profile-weight">
            Weight
            <span className={fields.requiredMark} aria-hidden="true">*</span>
          </label>
          <input
            id="profile-weight"
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.]?[0-9]*"
            maxLength={6}
            className={clsx(
              fields.fieldInput,
              css.numInputWide,
              watched.weight && fields.hasValue,
              errors.weight && fields.fieldError,
            )}
            aria-required="true"
            aria-invalid={errors.weight ? true : undefined}
            aria-describedby={errors.weight ? "profile-weight-error" : undefined}
            value={watched.weight ?? ""}
            {...register("weight")}
          />
          <span className={css.fieldUnit}>Lbs</span>
          {errors.weight && (
            <p
              id="profile-weight-error"
              className={fields.fieldErrorMsg}
              role="alert"
            >
              {errors.weight.message}
            </p>
          )}
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

        {mode === "onboarding" ? (
          <button
            type="submit"
            className={buttons.setupBtn}
            disabled={isSubmitting}
          >
            Set Up Your Tracked Data
          </button>
        ) : (
          // Saving is automatic in edit mode, so this is a plain exit, not a
          // submit - it returns the user to where they came from.
          <button
            type="button"
            className={buttons.setupBtn}
            onClick={handleDone}
          >
            Done
          </button>
        )}

        {formError && (
          <p className={css.formError} role="alert">
            {formError}
          </p>
        )}
      </form>
    </div>
  );
}
