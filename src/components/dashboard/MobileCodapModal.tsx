import { Dialog } from "../common/Dialog";
import css from "./CodapButton.module.css";

interface MobileCodapModalProps {
  open: boolean;
  onClose: () => void;
}

// Centered Dialog rendering desktop-redirect copy on mobile viewports.
// CODAP doesn't work well on small screens (per requirements), so on
// mobile the CODAP button opens this modal instead of the CODAP URL.
// The shared <Dialog variant="centered"> primitive handles role,
// focus-trap, focus-restore, Escape, and backdrop click; this file only
// owns the slot content.
export function MobileCodapModal({ open, onClose }: MobileCodapModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Analyze Your Data in CODAP"
      variant="centered"
    >
      <p className={css.modalCopy}>
        CODAP doesn’t work well on small screens. Visit{" "}
        <strong>datagoat.concord.org</strong> on your desktop to analyze
        your data.
      </p>
      <div className={css.modalActions}>
        <button
          type="button"
          className={css.modalDismissBtn}
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </Dialog>
  );
}
