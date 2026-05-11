const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function mintCustomMetricId(): string {
  let suffix = "";
  for (let i = 0; i < 10; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `c_${suffix}`;
}
