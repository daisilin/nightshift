import { motion } from 'framer-motion';
import type { MetricResult, MetricInterpretation } from '../../lib/types';

const interpretationColors: Record<MetricInterpretation, string> = {
  excellent: '#8FB89A',
  good: '#8BACD4',
  acceptable: '#E8A87C',
  poor: '#D48BB5',
  problematic: '#D47B7B',
};

export function MetricCard({ metric }: { metric: MetricResult }) {
  const color = interpretationColors[metric.interpretation];
  const barWidth = metric.interpretation === 'excellent' ? 95
    : metric.interpretation === 'good' ? 75
    : metric.interpretation === 'acceptable' ? 55
    : metric.interpretation === 'poor' ? 35 : 15;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-text-3 font-mono">{metric.name}</span>
        {metric.flag && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-peach/15 text-peach">
            {metric.flag}
          </span>
        )}
      </div>
      <div className="text-2xl font-heading mb-1" style={{ color }}>
        {metric.value}{metric.unit === 'ms' ? '' : ''}<span className="text-sm text-text-3 ml-1">{metric.unit}</span>
      </div>
      {metric.ci && (
        <div className="text-[10px] text-text-4 mb-2">
          95% CI: [{metric.ci[0]}, {metric.ci[1]}]
        </div>
      )}
      <div className="h-1.5 bg-orchid/8 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <div className="text-[10px] mt-1" style={{ color }}>{metric.interpretation}</div>
    </div>
  );
}
