import { mean as calcMean } from '../../lib/metrics';

interface Props {
  label: string;
  groups: { name: string; values: number[]; color: string }[];
  unit: string;
}

export function DistributionChart({ label, groups, unit }: Props) {
  if (groups.length === 0 || groups.every(g => g.values.length === 0)) return null;

  const allValues = groups.flatMap(g => g.values);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const nBins = 8;
  const binWidth = range / nBins;

  const svgW = 300;
  const svgH = 80;
  const barW = svgW / nBins - 2;

  // Compute histograms
  const histograms = groups.map(g => {
    const bins = Array(nBins).fill(0);
    for (const v of g.values) {
      const idx = Math.min(Math.floor((v - min) / binWidth), nBins - 1);
      bins[idx]++;
    }
    return { ...g, bins, mean: calcMean(g.values) };
  });

  const maxCount = Math.max(...histograms.flatMap(h => h.bins), 1);

  return (
    <div className="card p-4">
      <div className="text-xs text-text-3 font-mono mb-2">{label} ({unit})</div>
      <svg viewBox={`0 0 ${svgW} ${svgH + 20}`} className="w-full">
        {histograms.map((h, gi) =>
          h.bins.map((count, bi) => {
            const height = (count / maxCount) * svgH;
            const x = bi * (svgW / nBins) + gi * (barW / histograms.length);
            const w = barW / histograms.length;
            return (
              <rect
                key={`${gi}-${bi}`}
                x={x}
                y={svgH - height}
                width={w}
                height={height}
                fill={h.color}
                opacity={0.7}
                rx={1}
              />
            );
          })
        )}
        {/* Mean lines */}
        {histograms.map((h, gi) => {
          const x = ((h.mean - min) / range) * svgW;
          return (
            <line
              key={`mean-${gi}`}
              x1={x} y1={0} x2={x} y2={svgH}
              stroke={h.color} strokeWidth={2} strokeDasharray="3,3"
            />
          );
        })}
        {/* X-axis labels */}
        <text x={0} y={svgH + 14} className="text-[8px]" fill="#A89BB5">{Math.round(min)}</text>
        <text x={svgW - 30} y={svgH + 14} className="text-[8px]" fill="#A89BB5">{Math.round(max)}</text>
      </svg>
      {/* Legend */}
      <div className="flex gap-3 mt-1">
        {histograms.map(h => (
          <div key={h.name} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: h.color }} />
            <span className="text-[10px] text-text-3">{h.name} (M={Math.round(h.mean)})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
