import { useCallback, useEffect, useRef, useState } from "react";
import { useNavMenu } from "../../contexts/NavMenuContext";
import { MotivationMessage } from "./MotivationMessage";
import css from "./DashboardHeaderSlide.module.css";

// Per-slide hold timings ported VERBATIM from the prototype's
// `_dashHoldTimes = [6750, 9000]` array (HTML around line 5242).
// Asymmetric on purpose - wordmark holds longer than the streak/motivation
// slide because the motivation copy is denser and wants more dwell time.
// A single ROTATION_MS constant would be wrong - the schedule must read
// the CURRENT slide's hold value via setTimeout, not setInterval.
export const WORDMARK_HOLD_MS = 6750;
export const MOTIVATION_HOLD_MS = 9000;
const HOLD_TIMES = [WORDMARK_HOLD_MS, MOTIVATION_HOLD_MS];

// Slide indexes. 0 = wordmark, 1 = motivation. Cycles 0 -> 1 -> 0.
type SlideIndex = 0 | 1;

export function DashboardHeaderSlide() {
  const [slide, setSlide] = useState<SlideIndex>(0);
  const { isOpen: navOpen } = useNavMenu();
  const timerRef = useRef<number | null>(null);

  const advance = useCallback(() => {
    setSlide((prev) => ((prev + 1) % 2) as SlideIndex);
  }, []);

  // Reduced-motion + nav-menu pause guard. Three reactive inputs:
  //   - mq.matches (prefers-reduced-motion at schedule time AND at OS toggle)
  //   - navOpen (pause while hamburger open per requirements
  //              "Ambient-animation coordination")
  //   - slide (the next-tick uses the CURRENT slide's hold value)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const clear = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = () => {
      clear();
      if (mq.matches) return; // reduced motion - hold on current slide
      if (navOpen) return; // nav menu open - pause
      const hold = HOLD_TIMES[slide];
      timerRef.current = window.setTimeout(advance, hold);
    };

    schedule();

    // matchMedia 'change' fires when the OS-level preference toggles. Reset
    // the timer to honor the new state. Subscribed listener (per spec
    // "matchMedia change listener subscribes/unsubscribes" - a one-shot
    // mount read would miss runtime toggles).
    const onMqChange = () => schedule();
    mq.addEventListener("change", onMqChange);

    return () => {
      clear();
      mq.removeEventListener("change", onMqChange);
    };
  }, [slide, navOpen, advance]);

  // Goat-tap-to-advance handler. Same `advance()` call as the timer; the
  // schedule effect re-fires after the slide change and resets the
  // setTimeout, so the user gets a full hold of the new slide. Active
  // under both normal motion and reduced motion (under reduced motion
  // it's the only way to advance).
  const handleGoatClick = () => {
    advance();
  };

  return (
    <div className={css.screenHeader}>
      <div className={css.headerSlideWrap}>
        <div
          className={`${css.headerSlideItem} ${css.headerContentDefault} ${
            slide === 0 ? css.active : css.exitLeft
          }`}
          aria-hidden={slide !== 0}
        >
          <button
            type="button"
            className={css.wordmark}
            aria-label="DataGOAT - tap to advance dashboard message"
            onClick={handleGoatClick}
            data-skip-link-exclude
          >
            <span className={css.data}>Data</span>
            <span className={css.goat}>
              <span className={css.goatG}>G</span>OA
              <span className={css.goatT}>T</span>
            </span>
          </button>
          <p className={css.tagline}>
            Empowering Student Athletes through Data
          </p>
        </div>
        <div
          className={`${css.headerSlideItem} ${css.headerContentStreak} ${
            slide === 1 ? css.active : css.exitLeft
          }`}
          aria-hidden={slide !== 1}
        >
          <MotivationMessage active={slide === 1} />
        </div>
      </div>
    </div>
  );
}
