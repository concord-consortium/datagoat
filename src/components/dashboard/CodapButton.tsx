import { useEffect, useState } from "react";
import { MobileCodapModal } from "./MobileCodapModal";
import css from "./CodapButton.module.css";

const CODAP_DI_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? `http://localhost:${window.location.port}/codap`
    : "https://datagoat.concord.org/codap";
const CODAP_URL = `https://codap3.concord.org?di=${CODAP_DI_URL}`;
const DESKTOP_QUERY = "(min-width: 640px)";

// "Analyze Your Data in CODAP" button. Behavior split by viewport:
//   - desktop (>= 640px): opens CODAP_URL in a new tab
//   - mobile  (<  640px): opens a modal explaining "use the desktop"
//
// Detection via subscribed matchMedia (NOT a one-shot mount read) so the
// branch flips reactively when the user resizes / toggles device mode.
// Same pattern as DashboardHeaderSlide's reduced-motion guard.
export function CodapButton() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    // Resync once on mount in case state and mq diverged (e.g., SSR).
    setIsDesktop(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function handleClick() {
    if (isDesktop) {
      window.open(CODAP_URL, "_blank", "noopener,noreferrer");
    } else {
      setModalOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        className={css.codapBtn}
        onClick={handleClick}
        aria-label="Analyze your data in CODAP"
      >
        <span className={css.codapLogo}>
          <svg
            viewBox="0 0 27 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <g stroke="none" fill="none" fillRule="evenodd">
              <g transform="translate(0.43,0)">
                <path
                  d="M6.32,0C7.877,0 9.344,0.553 10.492,1.517C11.557,1.175 12.677,1 13.82,1C19.895,1 24.82,5.925 24.82,12C24.82,12.834 24.727,13.657 24.543,14.456C25.651,15.471 26.32,16.924 26.32,18.5C26.32,21.538 23.858,24 20.82,24C19.389,24 18.055,23.448 17.057,22.511C16.02,22.835 14.931,23 13.82,23C7.745,23 2.82,18.075 2.82,12C2.82,11.992 2.82,11.984 2.82,11.976C0.991,10.809 -0.18,8.767 -0.18,6.5C-0.18,2.91 2.73,0 6.32,0Z"
                  fill="#080A0E"
                  fillRule="nonzero"
                />
                <circle fill="#7BD0E3" cx="13.82" cy="12" r="9" />
                <circle fill="#EC8B58" cx="20.82" cy="18.5" r="3.5" />
                <circle fill="#58B568" cx="6.32" cy="6.5" r="4.5" />
                <path
                  d="M20.82,15C21.311,15 21.778,15.101 22.202,15.283C21.37,17.406 19.756,19.134 17.715,20.116C17.462,19.632 17.32,19.083 17.32,18.5C17.32,16.567 18.887,15 20.82,15Z"
                  fill="#D18051"
                  fillRule="nonzero"
                />
                <path
                  d="M9.968,3.864C10.504,4.605 10.82,5.516 10.82,6.5C10.82,8.985 8.805,11 6.32,11C5.826,11 5.35,10.92 4.905,10.773C5.315,7.751 7.226,5.208 9.862,3.915L9.968,3.864Z"
                  fill="#3DA961"
                  fillRule="nonzero"
                />
              </g>
            </g>
          </svg>
        </span>
        <span className={css.codapLabel}>Analyze Your Data in CODAP</span>
        <svg
          className={css.extLinkIcon}
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="2"
          aria-hidden="true"
        >
          <g transform="translate(3, 3)">
            <rect
              fill="rgba(0,0,0,0.25)"
              x="0"
              y="1"
              width="17"
              height="17"
            />
            <path
              d="M18,9 L18,16 C18,17.1045695 17.1045695,18 16,18 L2,18 C0.8954305,18 0,17.1045695 0,16 L0,2 C0,0.8954305 0.8954305,0 2,0 L9,0"
              stroke="currentColor"
            />
            <polyline
              points="12 0 18 0 18 6"
              stroke="currentColor"
            />
            <line
              x1="7"
              y1="11"
              x2="18"
              y2="0"
              stroke="currentColor"
            />
          </g>
        </svg>
      </button>
      <MobileCodapModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
