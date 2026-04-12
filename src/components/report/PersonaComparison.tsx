import { motion } from 'framer-motion';
import type { PilotMetrics } from '../../lib/types';
import { personaBank } from '../../data/personaBank';
import { stagger, staggerItem } from '../../lib/animations';

interface Props {
  metrics: PilotMetrics;
}

const interpColors: Record<string, string> = {
  excellent: '#8FB89A', good: '#8BACD4', acceptable: '#E8A87C', poor: '#D48BB5', problematic: '#D47B7B',
};

export function PersonaComparison({ metrics }: Props) {
  if (metrics.byPersona.length === 0) return null;

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="card p-5">
      <h3 className="text-sm font-mono text-text-3 uppercase tracking-wider mb-4">metrics by persona</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-orchid/10">
              <th className="text-left py-2 pr-4 text-xs text-text-3 font-normal">metric</th>
              {metrics.byPersona.map(p => {
                const persona = personaBank.find(pb => pb.id === p.personaId);
                return (
                  <th key={p.personaId} className="text-center py-2 px-2 text-xs font-normal">
                    <span className="mr-1">{persona?.emoji || '👤'}</span>
                    <span className="text-text-2">{p.personaName}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Get unique metric names across all personas */}
            {(() => {
              const allNames = [...new Set(metrics.byPersona.flatMap(p => p.metrics.map(m => m.name)))];
              return allNames.map(name => (
                <motion.tr key={name} variants={staggerItem} className="border-b border-orchid/5">
                  <td className="py-2 pr-4 text-xs text-text-3">{name}</td>
                  {metrics.byPersona.map(p => {
                    const m = p.metrics.find(met => met.name === name);
                    if (!m) return <td key={p.personaId} className="text-center py-2 px-2 text-xs text-text-4">—</td>;
                    return (
                      <td key={p.personaId} className="text-center py-2 px-2">
                        <span className="text-sm font-mono" style={{ color: interpColors[m.interpretation] || '#6B5E7B' }}>
                          {m.value}
                        </span>
                        {m.flag && (
                          <span className="ml-1 text-[9px] text-peach">⚠</span>
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              ));
            })()}
          </tbody>
        </table>
      </div>

      {/* Honesty label */}
      <p className="text-[10px] text-text-4 mt-3 italic">
        Synthetic pilots with tunable assumptions — for stress-testing designs, not scientific claims.
      </p>
    </motion.div>
  );
}
