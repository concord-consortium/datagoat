import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler);

interface SparklineChartProps {
  data: number[];
  metricName: string;
}

export function SparklineChart({ data, metricName }: SparklineChartProps) {
  if (data.length < 3) {
    return (
      <div className="w-20 h-8 flex items-center justify-center">
        <span className="text-sm text-base-content/40" aria-label={`${metricName}: Not enough data`}>—</span>
        <span className="sr-only">{metricName}: Not enough data</span>
      </div>
    );
  }

  const avg = (data.reduce((a, b) => a + b, 0) / data.length).toFixed(1);
  const trend = data[data.length - 1] >= data[0] ? "trending up" : "trending down";
  const srText = `${metricName}: ${trend}, ${avg} avg over ${data.length} days`;

  return (
    <div className="w-20 h-8 relative" title={srText}>
      <span className="sr-only">{srText}</span>
      <Line
        data={{
          labels: data.map((_, i) => i.toString()),
          datasets: [
            {
              data,
              borderColor: "#0693e3",
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
              tension: 0.3,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { display: false },
            y: { display: false },
          },
          animation: false,
        }}
      />
    </div>
  );
}
