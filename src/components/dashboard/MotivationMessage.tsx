import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { MOTIVATION_MESSAGES } from "../../data/motivationMessages";
import { useUser } from "../../contexts/UserContext";
import css from "./DashboardHeaderSlide.module.css";

import StreakIcon from "@/icons/motivation-streak.svg?react";
import PbIcon from "@/icons/motivation-pb.svg?react";
import ComebackIcon from "@/icons/motivation-comeback.svg?react";
import PbClockIcon from "@/icons/motivation-pb-clock.svg?react";
import TrophyIcon from "@/icons/motivation-trophy.svg?react";
import ScoreboardIcon from "@/icons/motivation-scoreboard.svg?react";

export const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  "motivation-streak": StreakIcon,
  "motivation-pb": PbIcon,
  "motivation-comeback": ComebackIcon,
  "motivation-pb-clock": PbClockIcon,
  "motivation-trophy": TrophyIcon,
  "motivation-scoreboard": ScoreboardIcon,
};

interface MotivationMessageProps {
  // The parent (DashboardHeaderSlide) advances every motivation cycle.
  // We rotate to the next message each time the slide becomes active.
  active: boolean;
}

// Resolves the motivation name per the prototype's verbatim fallback chain
// (HTML around line 5209-5215):
//   nickname || fullName.split(' ')[0] || '(name)'
// The first-name `.split(' ')[0]` is load-bearing - half-completed profiles
// (full name set, nickname empty) would otherwise render the user's full
// name instead of just the first name. The literal '(name)' placeholder
// catches empty profiles - dropping it surfaces as `undefined` in motivation
// copy on Day 1 demos.
function getMotivationName(
  nickname: string | undefined,
  fullName: string | undefined,
): string {
  if (nickname && nickname.trim()) return nickname.trim();
  if (fullName && fullName.trim()) return fullName.trim().split(" ")[0];
  return "(name)";
}

// Module-scope rotation cursor so the index survives /dashboard
// remounts within a single page-load - matching the prototype's
// window._motivationIndex lifetime (resets only on full reload).
// Component-local state would restart at -1 on every remount, causing
// the streak greeting to repeat each time the user re-enters the
// dashboard. Initial -1 so the FIRST inactive->active transition
// lands on index 0; a naive 0 would advance to 1 on the first show.
let motivationIndex = -1;

// Test-only reset so each test starts from a clean rotation; the
// production code path never calls this.
export function __resetMotivationRotationForTests(): void {
  motivationIndex = -1;
}

export function MotivationMessage({ active }: MotivationMessageProps) {
  const { loadState } = useUser();
  const profile =
    loadState.status === "loaded" ? loadState.profile : null;
  const name = getMotivationName(profile?.nickname, profile?.fullName);

  // Mirror the module-scope cursor in component state so React
  // re-renders when we advance. useState reads the current cursor at
  // mount, so a remount picks up wherever rotation left off.
  const [index, setIndex] = useState(motivationIndex);
  const prevActiveRef = useRef(false);

  // Advance to the next message each time the motivation slide goes
  // from inactive to active. This matches the prototype's pattern of
  // showing one motivation per cycle and advancing the index after
  // showing it.
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      motivationIndex = (motivationIndex + 1) % MOTIVATION_MESSAGES.length;
      setIndex(motivationIndex);
    }
    prevActiveRef.current = active;
  }, [active]);

  const safeIndex = index < 0 ? 0 : index;
  const msg = MOTIVATION_MESSAGES[safeIndex];
  const Icon = msg.iconKey ? ICONS[msg.iconKey] : null;

  return (
    <span className={css.streakInner}>
      <span className={css.streakMsg}>{renderTemplate(msg.template, name)}</span>
      <span className={css.streakIcon}>{Icon && <Icon />}</span>
    </span>
  );
}

// Templates contain only two markup tokens: <br> for line breaks and {name}
// for the user's name. We split on both and emit a React tree so the user's
// name (which can be any Firestore string) is rendered as a text node, never
// as HTML.
function renderTemplate(template: string, name: string): ReactNode {
  return template.split("<br>").map((line, lineIdx, lines) => (
    <Fragment key={lineIdx}>
      {line.split("{name}").map((piece, pieceIdx, pieces) => (
        <Fragment key={pieceIdx}>
          {piece}
          {pieceIdx < pieces.length - 1 ? name : null}
        </Fragment>
      ))}
      {lineIdx < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}
