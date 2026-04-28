import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
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

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
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

export function MotivationMessage({ active }: MotivationMessageProps) {
  const { loadState } = useUser();
  const profile =
    loadState.status === "loaded" ? loadState.profile : null;
  const name = getMotivationName(profile?.nickname, profile?.fullName);

  const [index, setIndex] = useState(0);
  const prevActiveRef = useRef(false);

  // Advance to the next message each time the motivation slide goes
  // from inactive to active. This matches the prototype's pattern of
  // showing one motivation per cycle and advancing the index after
  // showing it.
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      setIndex((i) => (i + 1) % MOTIVATION_MESSAGES.length);
    }
    prevActiveRef.current = active;
  }, [active]);

  const msg = MOTIVATION_MESSAGES[index];
  const Icon = msg.iconKey ? ICONS[msg.iconKey] : null;
  // Prototype substitutes {name} via plain string replacement; we render
  // dangerouslySetInnerHTML because the templates contain <br> tags. The
  // <br> tags + name substitution are designer-controlled; templates ship
  // verbatim from src/data/motivationMessages.ts so XSS is not a concern.
  const html = msg.template.replace(/\{name\}/g, name);

  return (
    <span className={css.streakInner}>
      <span
        className={css.streakMsg}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <span className={css.streakIcon}>{Icon && <Icon />}</span>
    </span>
  );
}
