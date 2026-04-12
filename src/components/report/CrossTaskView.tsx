import { motion } from 'framer-motion';
import type { CrossTaskAnalysis } from '../../context/types';
import { staggerItem } from '../../lib/animations';

function rColor(r: number): string {
  const abs = Math.abs(r);
  if (abs >= 0.5) return '#8FB89A';
  if (abs >= 0.3) return '#8BACD4';
  if (abs >= 0.15) return '#E8A87C';
  return '#A89BB5';
}

export function CrossTaskView({ analysis }: { analysis: CrossTaskAnalysis }) {
  return (
    <motion.div variants={staggerItem} className="card p-5">
      <h3 className="text-sm font-heading text-text mb-4">cross-task analysis</h3>

      {/* Correlation matrix */}
      <div className="mb-4">
        <h4 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2">correlations</h4>
        <div className="space-y-1.5">
          {analysis.correlationMatrix.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-text-3 w-32 text-right truncate">{c.task1}</span>
              <span className="text-text-4">×</span>
              <span className="text-text-3 w-32 truncate">{c.task2}</span>
              <div className="flex-1 h-3 bg-orchid/5 rounded-full overflow-hidden max-w-[100px]">
                <div className="h-full rounded-full" style={{
                  width: `${Math.abs(c.r) * 100}%`,
                  background: rColor(c.r),
                }} />
              </div>
              <span className="font-mono w-12 text-right" style={{ color: rColor(c.r) }}>
                r={c.r}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Factor loadings */}
      {analysis.factorLoadings.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2">factor structure (approximate)</h4>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead><tr className="border-b border-orchid/10 text-text-3">
                <th className="text-left py-1">task</th>
                <th className="text-right py-1">general factor</th>
                <th className="text-right py-1">specificity</th>
              </tr></thead>
              <tbody>
                {analysis.factorLoadings.map(f => (
                  <tr key={f.task} className="border-b border-orchid/5">
                    <td className="py-1 text-text-2">{f.task}</td>
                    <td className="py-1 text-right font-mono text-blue">{f.factor1}</td>
                    <td className="py-1 text-right font-mono text-peach">{f.factor2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary */}
      <p className="text-xs text-text-2 leading-relaxed">{analysis.summary}</p>
      <p className="text-[9px] text-text-4 mt-2 italic">
        correlations computed from simulated participant scores — for design exploration, not publication
      </p>
    </motion.div>
  );
}
