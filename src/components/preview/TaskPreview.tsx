import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ExperimentDesign, BehavioralParams, SurveyParams } from '../../lib/types';
import { StroopPreview } from './StroopPreview';
import { SurveyPreview } from './SurveyPreview';
import { TowerOfLondonPreview } from './TowerOfLondonPreview';
import { FourInARowPreview } from './FourInARowPreview';
import { ChessPreview } from './ChessPreview';
import { MazePreview } from './MazePreview';
import { NBackPreview } from './NBackPreview';
import { CorsiPreview } from './CorsiPreview';
import { TwoStepPreview } from './TwoStepPreview';

interface Props {
  design: ExperimentDesign;
  onClose: () => void;
  onDesignChange?: (updated: ExperimentDesign) => void;
}

export function TaskPreview({ design, onClose, onDesignChange }: Props) {
  const id = design.paradigmId;
  const params = design.params;
  const isBehavioral = params.type === 'behavioral';
  const bp = isBehavioral ? params as BehavioralParams : null;
  const sp = !isBehavioral ? params as SurveyParams : null;

  const [localParams, setLocalParams] = useState(params);
  const localBp = localParams.type === 'behavioral' ? localParams as BehavioralParams : null;

  const updateParam = (key: string, value: number | boolean | string[]) => {
    const updated = { ...localParams, [key]: value };
    setLocalParams(updated);
    if (onDesignChange) {
      onDesignChange({ ...design, params: updated });
    }
  };

  // Extract n-level from condition labels for n-back
  const nLevel = bp?.conditionLabels?.[Math.floor((bp?.nConditions ?? 1) / 2)]?.match(/(\d)/)?.[1];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-text-3 uppercase tracking-wider">
          try it yourself — {design.name}
        </h3>
        <button onClick={onClose} className="text-xs text-text-3 hover:text-text cursor-pointer">close</button>
      </div>

      {/* Live param controls — always visible */}
      {isBehavioral && localBp && (
        <div className="card p-3 space-y-2">
          <div className="text-[10px] font-mono text-text-3 uppercase tracking-wider">task parameters</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-text-3 block mb-0.5">
                difficulty: <span className="font-mono text-text-2">{localBp.difficulty.toFixed(2)}</span>
              </label>
              <input type="range" min="0.1" max="0.9" step="0.05"
                value={localBp.difficulty}
                onChange={e => updateParam('difficulty', parseFloat(e.target.value))}
                className="w-full accent-orchid h-1" />
            </div>
            <div>
              <label className="text-[10px] text-text-3 block mb-0.5">
                trials: <span className="font-mono text-text-2">{localBp.nTrials}</span>
              </label>
              <input type="range" min="5" max="100" step="5"
                value={localBp.nTrials}
                onChange={e => updateParam('nTrials', parseInt(e.target.value))}
                className="w-full accent-orchid h-1" />
            </div>
            <div>
              <label className="text-[10px] text-text-3 block mb-0.5">
                conditions: <span className="font-mono text-text-2">{localBp.nConditions}</span>
              </label>
              <input type="range" min="2" max="6" step="1"
                value={localBp.nConditions}
                onChange={e => updateParam('nConditions', parseInt(e.target.value))}
                className="w-full accent-orchid h-1" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={() => updateParam('withinSubject', !localBp.withinSubject)}
                className={`px-2 py-1 rounded text-[10px] cursor-pointer border ${
                  localBp.withinSubject ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/10 text-text-3'}`}>
                {localBp.withinSubject ? 'within' : 'between'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The actual playable task */}
      {id === 'stroop' && (
        <StroopPreview nTrials={Math.min(localBp?.nTrials ?? 10, 15)} />
      )}
      {id === 'tower-of-london' && <TowerOfLondonPreview />}
      {id === 'four-in-a-row' && <FourInARowPreview />}
      {id === 'chess' && <ChessPreview />}
      {id === 'n-back' && <NBackPreview nLevel={nLevel ? parseInt(nLevel) : 2} />}
      {id === 'corsi-block' && <CorsiPreview />}
      {id === 'two-step' && <TwoStepPreview />}
      {id === 'maze-construal' && <MazePreview />}
      {(id === 'likert-survey' || id === 'forced-choice') && sp && (
        <SurveyPreview params={sp} />
      )}

      {!['stroop', 'tower-of-london', 'four-in-a-row', 'chess', 'n-back', 'corsi-block', 'two-step', 'maze-construal', 'likert-survey', 'forced-choice'].includes(id) && (
        <div className="card p-6 text-center">
          <p className="text-sm text-text-3 mb-2">interactive preview for <strong>{id}</strong> coming soon</p>
        </div>
      )}

      {/* Feedback section */}
      <div className="text-[9px] text-text-4 border-t border-orchid/5 pt-2">
        adjust parameters above → the task preview and simulation will use these settings.
        changes are live — tweak, play, observe, iterate.
      </div>
    </motion.div>
  );
}
