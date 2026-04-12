import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ExperimentDesign, SurveyParams } from '../../lib/types';
import { StroopPreview } from './StroopPreview';
import { SurveyPreview } from './SurveyPreview';
import { TowerOfLondonPreview } from './TowerOfLondonPreview';

interface Props {
  design: ExperimentDesign;
  onClose: () => void;
}

export function TaskPreview({ design, onClose }: Props) {
  const paradigmId = design.paradigmId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono text-text-3 uppercase tracking-wider">
          try it yourself — {design.name}
        </h3>
        <button onClick={onClose} className="text-xs text-text-3 hover:text-text cursor-pointer">close</button>
      </div>

      {paradigmId === 'stroop' && (
        <StroopPreview
          nTrials={Math.min(design.params.type === 'behavioral' ? design.params.nTrials : 10, 15)}
          proportionCongruent={0.5}
        />
      )}

      {paradigmId === 'tower-of-london' && <TowerOfLondonPreview />}

      {(paradigmId === 'likert-survey' || paradigmId === 'forced-choice') && design.params.type === 'survey' && (
        <SurveyPreview params={design.params as SurveyParams} />
      )}

      {/* Fallback for tasks without interactive preview */}
      {!['stroop', 'tower-of-london', 'likert-survey', 'forced-choice'].includes(paradigmId) && (
        <div className="card p-6 text-center">
          <p className="text-sm text-text-3 mb-2">
            interactive preview for <strong>{paradigmId}</strong> coming soon
          </p>
          <p className="text-xs text-text-4">
            {design.params.type === 'behavioral'
              ? `${design.params.nTrials} trials · ${design.params.nConditions} conditions · difficulty ${design.params.difficulty}`
              : `${design.params.nItems} items · ${design.params.scalePoints}-point scale`
            }
          </p>
        </div>
      )}
    </motion.div>
  );
}
