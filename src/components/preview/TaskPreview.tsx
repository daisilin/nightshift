import { useState } from 'react';
import { motion } from 'framer-motion';
import type { ExperimentDesign, BehavioralParams, SurveyParams } from '../../lib/types';
import { getParadigm } from '../../data/taskBank';
import { callClaudeApi } from '../../lib/apiKey';
import { StroopPreview } from './StroopPreview';
import { SurveyPreview } from './SurveyPreview';
import { TowerOfLondonPreview } from './TowerOfLondonPreview';
import { FourInARowPreview } from './FourInARowPreview';
import { ChessPreview } from './ChessPreview';
import { MazePreview } from './MazePreview';
import { NBackPreview } from './NBackPreview';
import { CorsiPreview } from './CorsiPreview';
import { TwoStepPreview } from './TwoStepPreview';
import { WCSTPreview } from './WCSTPreview';

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

  // Design agent chat
  const [designInput, setDesignInput] = useState('');
  const [designChat, setDesignChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [designLoading, setDesignLoading] = useState(false);

  const sendToDesignAgent = async () => {
    const msg = designInput.trim();
    if (!msg || designLoading) return;
    setDesignInput('');
    setDesignChat(prev => [...prev, { role: 'user', content: msg }]);
    setDesignLoading(true);

    const paradigm = getParadigm(id);
    try {
      const res = await callClaudeApi({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 500,
          system: `You are a task design agent helping a researcher iterate on an experiment.

Current task: ${paradigm?.name || id} — ${paradigm?.description || ''}
Current params: ${JSON.stringify(localParams, null, 1)}

The researcher wants to modify this task. You can suggest parameter changes by including JSON:
\`\`\`json
{ "difficulty": 0.7, "nTrials": 60, "nConditions": 3 }
\`\`\`

You can also discuss design ideas that go beyond parameter changes — task variants, new conditions, timing modifications, different probe types, etc. Be specific and grounded in behavioral science.

If the request is about something you can change via params, include the JSON. If it's a broader design discussion, just explain your thinking.`,
          messages: [
            ...designChat.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg },
          ],
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';

      // Apply param changes if Claude included JSON
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const updates = JSON.parse(jsonMatch[1]);
          const newParams = { ...localParams };
          for (const [key, val] of Object.entries(updates)) {
            if (key in newParams) (newParams as any)[key] = val;
          }
          setLocalParams(newParams);
          if (onDesignChange) onDesignChange({ ...design, params: newParams });
        } catch { /* ignore parse error */ }
      }

      setDesignChat(prev => [...prev, { role: 'assistant', content: raw.replace(/```json[\s\S]*?```/g, '').trim() }]);
    } catch {
      setDesignChat(prev => [...prev, { role: 'assistant', content: 'Could not reach the design agent.' }]);
    } finally {
      setDesignLoading(false);
    }
  };

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

      {/* Design agent — iterate on task design conversationally */}
      <div className="card p-3">
        {designChat.length > 0 && (
          <div className="max-h-[150px] overflow-y-auto space-y-1 mb-2">
            {designChat.map((msg, i) => (
              <div key={i} className={`text-[11px] ${msg.role === 'user' ? 'text-orchid' : 'text-text-2'}`}>
                {msg.role === 'user' ? '→ ' : ''}{msg.content}
              </div>
            ))}
            {designLoading && <div className="text-[10px] text-text-3 italic">thinking...</div>}
          </div>
        )}
        <div className="flex gap-2">
          <input value={designInput} onChange={e => setDesignInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendToDesignAgent(); }}
            placeholder="tell the design agent what to change..."
            className="flex-1 px-2 py-1.5 rounded-lg text-[11px] border border-orchid/15 bg-white text-text focus:outline-none"
            disabled={designLoading} />
          <button onClick={sendToDesignAgent} disabled={!designInput.trim() || designLoading}
            className="px-2 py-1.5 rounded-lg text-[10px] font-medium text-text-2 border border-orchid/15 cursor-pointer disabled:opacity-30 hover:bg-orchid/5">
            send
          </button>
        </div>
      </div>

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
      {id === 'wcst' && <WCSTPreview />}
      {id === 'maze-construal' && <MazePreview />}
      {(id === 'likert-survey' || id === 'forced-choice') && sp && (
        <SurveyPreview params={sp} />
      )}

      {!['stroop', 'tower-of-london', 'four-in-a-row', 'chess', 'n-back', 'corsi-block', 'two-step', 'wcst', 'maze-construal', 'likert-survey', 'forced-choice'].includes(id) && (
        <div className="card p-6 text-center">
          <p className="text-sm text-text-3 mb-2">interactive preview for <strong>{id}</strong> coming soon</p>
        </div>
      )}

      <div className="text-[9px] text-text-4 border-t border-orchid/5 pt-2">
        sliders for quick tweaks · design agent for complex changes · play to feel the task
      </div>
    </motion.div>
  );
}
