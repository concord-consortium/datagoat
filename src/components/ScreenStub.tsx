interface ScreenStubProps {
  name: string;
}

// Temporary placeholder used by routes that haven't shipped yet. Removed in
// later steps as each screen lands.
export function ScreenStub({ name }: ScreenStubProps) {
  return (
    <div
      style={{
        padding: "32px 16px",
        color: "var(--text)",
        fontFamily: "Barlow, sans-serif",
      }}
    >
      <p style={{ color: "var(--subtext)" }}>
        <strong>{name}</strong> placeholder
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
        This screen has not been built yet.
      </p>
    </div>
  );
}
