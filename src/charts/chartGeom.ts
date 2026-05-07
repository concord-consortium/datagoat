// Shared geometry computed once by the orchestrator (MetricBarChart) and
// threaded through to each subcomponent so they position themselves
// consistently inside the SVG viewBox.
export interface ChartGeom {
  plotLeft: number;   // x of plot left edge (inside the SVG)
  plotTop: number;    // y of plot top edge (small for SVG)
  plotRight: number;  // x of plot right edge
  plotBottom: number; // y of plot bottom edge (large for SVG)
  plotWidth: number;
  plotHeight: number;
}
