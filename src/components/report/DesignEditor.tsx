import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { ExperimentDesign, BehavioralParams, SurveyParams, PilotMetrics, PersonaDefinition } from '../../lib/types';
import { simulatePilot } from '../../lib/simulation';
import { computePilotMetrics } from '../../lib/metrics';
import { runLLMTrial } from '../../lib/llmParticipant';
import { generatePool } from '../../lib/participantPool';
import { buildTaskPrompt } from '../../lib/personaPrompts';
import type { SimulatedDataset, SimulatedParticipant, SimulatedTrial } from '../../lib/types';
import { MetricCard } from './MetricCard';
import { PersonaComparison } from './PersonaComparison';

interface Props {
  design: ExperimentDesign;
  originalMetrics: PilotMetrics;
  personas: PersonaDefinition[];
  onApply: (newDesign: ExperimentDesign, newMetrics: PilotMetrics) => void;
  onClose: () => void;
}

export function DesignEditor({ design, originalMetrics, personas, onApply, onClose }: Props) {
  const [params, setParams] = useState(design.params);
  const [nPerPersona, setNPerPersona] = useState(design.nParticipantsPerPersona);
  const [tweakedMetrics, setTweakedMetrics] = useState<PilotMetrics | null>(null);
  const [computing, setComputing] = useState(false);
  const [simMode, setSimMode] = useState<'parametric' | 'llm'>('parametric');
  const [progress, setProgress] = useState('');

  const personaNames: Record<string, string> = {};
  personas.forEach(p => { personaNames[p.id] = p.name; });

  const reSimulate = useCallback(async () => {
    setComputing(true);
    setProgress('');
    const tweakedDesign: ExperimentDesign = { ...design, params, nParticipantsPerPersona: nPerPersona };

    if (simMode === 'parametric') {
      // Instant parametric simulation
      setProgress('simulating...');
      setTimeout(() => {
        const dataset = simulatePilot(tweakedDesign, personas, Date.now());
        const metrics = computePilotMetrics(tweakedDesign, dataset, personaNames);
        setTweakedMetrics(metrics);
        setComputing(false);
        setProgress('');
      }, 10);
    } else {
      // LLM simulation
      const n = Math.min(nPerPersona, 5); // cap LLM at 5
      const pool = generatePool(personas[0]?.id || 'college-student', n);
      const taskPrompt = buildTaskPrompt(tweakedDesign.paradigmId, '');
      const participants: SimulatedParticipant[] = [];

      for (let pi = 0; pi < n; pi++) {
        setProgress(`LLM: participant ${pi + 1}/${n}`);
        const person = pool[pi];
        const trials: SimulatedTrial[] = [];

        for (let ti = 0; ti < 3; ti++) {
          if (ti > 0 || pi > 0) await new Promise(r => setTimeout(r, 200));
          const result = await runLLMTrial({
            taskDescription: taskPrompt,
            stimulus: `Trial ${ti + 1}. Respond as if doing this task.`,
            personaPrompt: person.llmPrompt,
            responseFormat: '{ "response": 0 or 1, "confidence": 0-1, "reaction_time_estimate": "fast/medium/slow" }',
          });

          const rtEst = result.response?.reaction_time_estimate === 'fast' ? 500 : result.response?.reaction_time_estimate === 'slow' ? 2000 : 1000;
          trials.push({
            trialIndex: ti,
            condition: params.type === 'behavioral' ? (params as BehavioralParams).conditionLabels?.[ti % 2] || 'default' : 'survey',
            rt: rtEst + result.latencyMs * 0.1,
            response: typeof result.response?.response === 'number' ? result.response.response : Math.round(Math.random()),
            correct: result.response?.response === 1 ? true : result.response?.response === 0 ? false : null,
          });
        }

        participants.push({ id: person.id, personaId: personas[0]?.id || 'unknown', condition: null, trials, seed: 0 });
      }

      const dataset: SimulatedDataset = { designId: tweakedDesign.id, participants, masterSeed: 0, generatedAt: Date.now() };
      const metrics = computePilotMetrics(tweakedDesign, dataset, personaNames);
      setTweakedMetrics(metrics);
      setComputing(false);
      setProgress('');
    }
  }, [design, params, nPerPersona, personas, personaNames, simMode]);

  const handleApply = () => {
    if (!tweakedMetrics) return;
    const tweakedDesign: ExperimentDesign = { ...design, params, nParticipantsPerPersona: nPerPersona };
    onApply(tweakedDesign, tweakedMetrics);
  };

  const isBehavioral = params.type === 'behavioral';
  const bParams = isBehavioral ? params as BehavioralParams : null;
  const sParams = !isBehavioral ? params as SurveyParams : null;

  const scoreDiff = tweakedMetrics ? tweakedMetrics.overallScore - originalMetrics.overallScore : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6 border-2 border-orchid/20"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">tweak design parameters</h3>
        <button onClick={onClose} className="text-xs text-text-3 hover:text-text cursor-pointer">close</button>
      </div>

      {/* Parameter controls */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {bParams && (
          <>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">
                difficulty: <span className="font-mono text-text-2">{bParams.difficulty.toFixed(2)}</span>
              </label>
              <input type="range" min="0.1" max="0.9" step="0.05" value={bParams.difficulty}
                onChange={e => setParams({ ...bParams, difficulty: parseFloat(e.target.value) })}
                className="w-full accent-orchid" />
            </div>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">
                trials: <span className="font-mono text-text-2">{bParams.nTrials}</span>
              </label>
              <input type="range" min="10" max="120" step="5" value={bParams.nTrials}
                onChange={e => setParams({ ...bParams, nTrials: parseInt(e.target.value) })}
                className="w-full accent-orchid" />
            </div>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">
                conditions: <span className="font-mono text-text-2">{bParams.nConditions}</span>
              </label>
              <input type="range" min="2" max="5" step="1" value={bParams.nConditions}
                onChange={e => {
                  const n = parseInt(e.target.value);
                  const labels = Array.from({ length: n }, (_, i) => bParams.conditionLabels[i] || `cond-${i + 1}`);
                  setParams({ ...bParams, nConditions: n, conditionLabels: labels });
                }}
                className="w-full accent-orchid" />
            </div>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">design</label>
              <div className="flex gap-2">
                <button onClick={() => setParams({ ...bParams, withinSubject: true })}
                  className={`px-3 py-1 rounded-lg text-xs cursor-pointer border ${bParams.withinSubject ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                  within
                </button>
                <button onClick={() => setParams({ ...bParams, withinSubject: false })}
                  className={`px-3 py-1 rounded-lg text-xs cursor-pointer border ${!bParams.withinSubject ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                  between
                </button>
              </div>
            </div>
          </>
        )}
        {sParams && (
          <>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">
                items: <span className="font-mono text-text-2">{sParams.nItems}</span>
              </label>
              <input type="range" min="5" max="50" step="1" value={sParams.nItems}
                onChange={e => setParams({ ...sParams, nItems: parseInt(e.target.value) })}
                className="w-full accent-orchid" />
            </div>
            <div>
              <label className="text-[11px] text-text-3 block mb-1">
                scale: <span className="font-mono text-text-2">{sParams.scalePoints}-point</span>
              </label>
              <div className="flex gap-2">
                {[2, 5, 7].map(n => (
                  <button key={n} onClick={() => setParams({ ...sParams, scalePoints: n })}
                    className={`px-3 py-1 rounded-lg text-xs cursor-pointer border ${sParams.scalePoints === n ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div>
          <label className="text-[11px] text-text-3 block mb-1">
            n per persona: <span className="font-mono text-text-2">{nPerPersona}</span>
          </label>
          <input type="range" min="5" max="100" step="5" value={nPerPersona}
            onChange={e => setNPerPersona(parseInt(e.target.value))}
            className="w-full accent-orchid" />
        </div>
      </div>

      {/* Simulation mode + re-simulate */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setSimMode('parametric')}
          className={`px-2 py-1 rounded text-[10px] cursor-pointer border ${simMode === 'parametric' ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
          parametric
        </button>
        <button onClick={() => setSimMode('llm')}
          className={`px-2 py-1 rounded text-[10px] cursor-pointer border ${simMode === 'llm' ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
          LLM agents
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={reSimulate}
          disabled={computing}
          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          {computing ? (progress || 'computing...') : `re-simulate (${simMode})`}
        </motion.button>
      </div>

      {/* Tweaked results comparison */}
      {tweakedMetrics && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/50">
            <div>
              <span className="text-xs text-text-3">original</span>
              <div className="text-xl font-heading text-text-2">{originalMetrics.overallScore}</div>
            </div>
            <div className="text-2xl text-text-3">→</div>
            <div>
              <span className="text-xs text-text-3">tweaked</span>
              <div className="text-xl font-heading" style={{ color: scoreDiff >= 0 ? '#8FB89A' : '#D47B7B' }}>
                {tweakedMetrics.overallScore}
                <span className="text-sm ml-1">({scoreDiff >= 0 ? '+' : ''}{scoreDiff})</span>
              </div>
            </div>
          </div>

          <PersonaComparison metrics={tweakedMetrics} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tweakedMetrics.overall.slice(0, 4).map((m, i) => (
              <MetricCard key={i} metric={m} />
            ))}
          </div>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleApply}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-orchid/20 bg-orchid/5 text-text cursor-pointer">
            keep this version ✓
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
