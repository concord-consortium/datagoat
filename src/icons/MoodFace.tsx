// Outline-style mood face icon (Google Material "sentiment" style), drawn
// locally so it needs no icon font and inherits the card's text color via
// `currentColor`. `value` 1..5 maps sad -> happy by curving the mouth; the
// icon is decorative (aria-hidden) - the card button carries the label.
interface MoodFaceProps {
  value: number;
  size?: number;
}

export function MoodFace({ value, size = 24 }: MoodFaceProps) {
  const v = Math.min(5, Math.max(1, Math.round(value)));
  // Mouth is a quadratic curve between two fixed corners; the control-point Y
  // moves below the corners for a smile (v > 3) and above for a frown (v < 3).
  const ctrlY = 15 + (v - 3) * 2.6;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
      <path d={`M8 15 Q12 ${ctrlY} 16 15`} />
    </svg>
  );
}
