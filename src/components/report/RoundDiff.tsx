import { motion } from 'framer-motion';
import type { ResearchSession } from '../../context/types';
import { staggerItem } from '../../lib/animations';

interface Props {
  currentSession: ResearchSession;
  previousSession: ResearchSession;
}

export function RoundDiff({ currentSession, previousSession }: Props) {
  const prevFindings = previousSession.reports.flatMap(r => r.findings);
  const usefulFeedback = prevFindings.filter(f => f.feedback === 'useful');
  const deeperFeedback = prevFindings.filter(f => f.feedback === 'deeper');
  const wrongFeedback = prevFindings.filter(f => f.feedback === 'wrong');
  const hasFeedback = usefulFeedback.length > 0 || deeperFeedback.length > 0 || wrongFeedback.length > 0;

  if (!hasFeedback) return null;

  return (
    <motion.div variants={staggerItem} className="card p-5 mb-6 border-l-4 border-l-orchid">
      <h3 className="text-sm font-mono font-light text-text-3 uppercase tracking-wider mb-3">
        round {previousSession.round} → round {currentSession.round} · what changed
      </h3>

      <div className="space-y-3 text-sm">
        {usefulFeedback.length > 0 && (
          <div>
            <span className="text-sage font-semibold">kept</span>
            <span className="text-text-3"> — you said these were useful:</span>
            <ul className="mt-1 space-y-1">
              {usefulFeedback.slice(0, 3).map(f => (
                <li key={f.id} className="text-text-2 pl-3 border-l-2 border-sage/30">{f.text.slice(0, 80)}{f.text.length > 80 ? '...' : ''}</li>
              ))}
            </ul>
          </div>
        )}

        {deeperFeedback.length > 0 && (
          <div>
            <span className="text-orchid font-semibold">going deeper</span>
            <span className="text-text-3"> — investigating further:</span>
            <ul className="mt-1 space-y-1">
              {deeperFeedback.slice(0, 3).map(f => (
                <li key={f.id} className="text-text-2 pl-3 border-l-2 border-orchid/30">{f.text.slice(0, 80)}{f.text.length > 80 ? '...' : ''}</li>
              ))}
            </ul>
          </div>
        )}

        {wrongFeedback.length > 0 && (
          <div>
            <span className="text-peach font-semibold">dropped</span>
            <span className="text-text-3"> — avoiding these directions:</span>
            <ul className="mt-1 space-y-1">
              {wrongFeedback.slice(0, 3).map(f => (
                <li key={f.id} className="text-text-3 pl-3 border-l-2 border-peach/30 line-through">{f.text.slice(0, 80)}{f.text.length > 80 ? '...' : ''}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}
