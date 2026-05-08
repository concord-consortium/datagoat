// Linear interpolation from domain to range. Pure and stateless.
//
// SVG y conventionally has the origin at the top, so most callers pass an
// "inverted" range like [plotBottom, plotTop] to put low values at the
// bottom of the plot. Hydration is the unusual case: the metric scale
// itself is inverted (1 = best, 8 = worst), so the chart passes
// [plotTop, plotBottom] over the natural domain to keep "1" at the top.
export function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  // Zero-span domain → return the lower range bound for any input.
  if (span === 0) return () => r0;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}
