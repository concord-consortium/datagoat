import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import css from "./InfoScreen.module.css";

// Topic-to-content lookup. Copy ported VERBATIM from the prototype's
// #athlete-type-info-screen, #gender-info-screen, #comp-term-info-screen
// markup (HTML lines 4403-4477). Strong tags are preserved, including
// the prototype's accent-tinted strong style.
//
// Unknown :topic falls back to /profile (the entry point reached via
// the profile-form info icons). Spec doesn't pin this fallback target,
// but /profile is the only place these info screens are reachable from.
type Topic = "athlete-type" | "gender" | "comp-term";

interface TopicContent {
  body: ReactNode;
}

const CONTENT: Record<Topic, TopicContent> = {
  "athlete-type": {
    body: (
      <>
        <p>
          Your <strong>Athlete Type</strong> selection will adjust some of
          your goals, while others stay the same regardless of what you
          choose. For example, your target 1RM will adjust based on{" "}
          <strong>Athlete Type</strong>, but your target sleep duration
          will not.
        </p>

        <h3 className={css.infoSectionHeading}>Athlete Types</h3>

        <p>
          <strong>Endurance:</strong> Endurance athletes take part in
          sports that require them to stay active for extended periods of
          time. They depend on their body's ability to use oxygen
          efficiently. Training and competition may include: moderate
          intensity for long durations of running, swimming, rowing,
          cycling, etc., high training volume (e.g., high mileage) and
          interval training.
        </p>

        <p>
          <strong>Strength and Power:</strong> Strength and power athletes
          compete in sports that require them to create a lot of force,
          usually in short bursts at a high intensity. Training and
          competition may include: sprints, jumps, accelerations,
          decelerations, and changes of direction. Performance depends on
          speed, agility, and power.
        </p>

        <p className={css.infoNote}>
          <strong>Note:</strong> Team-sport athletes compete in sports
          that require frequent changes in intensity, direction, and
          movement pattern (stop-and-go). They rely on a combination of
          endurance, strength, agility, and speed. Depending on your
          sport or position, you may identify as <strong>Endurance</strong>
          , <strong>Strength and Power</strong>, or a hybrid. Pick the
          option that best matches your training and competition - your
          choice will only influence some goals, such as 1RM and max
          speed.
        </p>
      </>
    ),
  },
  gender: {
    body: (
      <>
        <p>
          Your <strong>Gender</strong> selection will adjust some of your
          goals, while others stay the same regardless of what you
          choose. For example, your target 1RM will adjust based on{" "}
          <strong>Gender</strong>, but your target sleep duration will
          not.
        </p>
      </>
    ),
  },
  "comp-term": {
    body: (
      <>
        <p>
          Different sports use different terms for their official
          competitive events. Select the term your sport uses so DataGOAT
          can label your availability tracking correctly.
        </p>

        <h3 className={css.infoSectionHeading}>Bout</h3>
        <p className={css.metricDescription}>Fencing, Boxing</p>

        <h3 className={css.infoSectionHeading}>Game</h3>
        <p className={css.metricDescription}>
          Football, Basketball, Baseball, Softball, Ice Hockey, Field
          Hockey, Lacrosse, Water Polo
        </p>

        <h3 className={css.infoSectionHeading}>Match</h3>
        <p className={css.metricDescription}>
          Soccer, Tennis, Volleyball, Beach Volleyball, Wrestling, Rifle,
          Bowling
        </p>

        <h3 className={css.infoSectionHeading}>Meet</h3>
        <p className={css.metricDescription}>
          Track &amp; Field, Cross Country, Swimming &amp; Diving,
          Gymnastics, Equestrian, Acrobatics &amp; Tumbling
        </p>

        <h3 className={css.infoSectionHeading}>Race</h3>
        <p className={css.metricDescription}>
          Cross Country, Skiing, Triathlon, Rowing
        </p>

        <h3 className={css.infoSectionHeading}>Regatta</h3>
        <p className={css.metricDescription}>Rowing, Sailing</p>

        <h3 className={css.infoSectionHeading}>Tournament</h3>
        <p className={css.metricDescription}>Golf</p>
      </>
    ),
  },
};

const VALID_TOPICS: Topic[] = ["athlete-type", "gender", "comp-term"];

function isTopic(t: string | undefined): t is Topic {
  return !!t && (VALID_TOPICS as string[]).includes(t);
}

export function InfoScreen() {
  const { topic } = useParams<{ topic: string }>();
  if (!isTopic(topic)) {
    return <Navigate to="/profile" replace />;
  }
  return <div className={css.infoContent}>{CONTENT[topic].body}</div>;
}
