import { motion } from 'framer-motion';
import type { ExperimentDesign, PilotMetrics } from '../../lib/types';
import { INTERN_PROFILES } from '../../lib/interns';
import type { InternRole } from '../../context/types';

interface Props {
  design: ExperimentDesign;
  metrics: PilotMetrics;
  selected: boolean;
  onSelect: () => void;
}

const recColors = { proceed: '#8FB89A', revise: '#E8A87C', redesign: '#D47B7B' };

export function DesignCard({ design, metrics, selected, onSelect }: Props) {
  const intern = INTERN_PROFILES[design.internRole as InternRole];
  const params = design.params;

  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`card p-5 text-left w-full cursor-pointer transition-all duration-200 ${
        selected ? 'ring-2 ring-orchid/40' : 'hover:border-orchid/20'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{intern?.emoji || '🔬'}</span>
        <span className="text-sm font-semibold" style={{ color: intern?.color || '#8BACD4' }}>
          {intern?.name || design.internRole}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-text mb-2">{design.name}</h3>

      <div className="space-y-1 text-xs text-text-3 mb-3">
        {params.type === 'behavioral' ? (
          <>
            <div>{params.nTrials} trials · {params.nConditions} conditions</div>
            <div>difficulty: {params.difficulty} · {params.withinSubject ? 'within' : 'between'}-subject</div>
            <div>conditions: {params.conditionLabels.join(', ')}</div>
          </>
        ) : (
          <>
            <div>{params.nItems} items · {params.scalePoints}-point scale</div>
            <div>{params.nSubscales} subscales</div>
          </>
        )}
        <div>{design.nParticipantsPerPersona} participants/persona</div>
      </div>

      {design.hypotheses.length > 0 && (
        <p className="text-xs text-text-3 italic mb-3">{design.hypotheses[0]}</p>
      )}

      {/* Score badge */}
      <div className="flex items-center justify-between">
        <div className="text-2xl font-heading" style={{ color: recColors[metrics.recommendation] }}>
          {metrics.overallScore}
          <span className="text-xs text-text-3 ml-1">/100</span>
        </div>
        <span
          className="text-[10px] px-2 py-1 rounded-full font-semibold"
          style={{
            background: `${recColors[metrics.recommendation]}20`,
            color: recColors[metrics.recommendation],
          }}
        >
          {metrics.recommendation}
        </span>
      </div>
    </motion.button>
  );
}
