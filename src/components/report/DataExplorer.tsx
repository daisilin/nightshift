import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SimulatedDataset, SimulatedParticipant, ExperimentDesign } from '../../lib/types';
import { mean, standardDeviation, cohensD, confidenceInterval } from '../../lib/metrics';
import { personaBank } from '../../data/personaBank';

interface Props {
  dataset: SimulatedDataset;
  design: ExperimentDesign;
}

type View = 'summary' | 'by-condition' | 'by-persona' | 'learning' | 'raw';

export function DataExplorer({ dataset, design }: Props) {
  const [view, setView] = useState<View>('summary');
  const [personaFilter, setPersonaFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');

  const isBehavioral = design.params.type === 'behavioral';
  const participants = dataset.participants;

  // Get unique personas and conditions
  const personaIds = [...new Set(participants.map(p => p.personaId))];
  const conditions = isBehavioral
    ? [...new Set(participants.flatMap(p => p.trials.map(t => t.condition)))]
    : ['survey'];

  // Filtered participants
  const filtered = useMemo(() => {
    let ps = participants;
    if (personaFilter !== 'all') ps = ps.filter(p => p.personaId === personaFilter);
    return ps;
  }, [participants, personaFilter]);

  // Filtered trials
  const filteredTrials = useMemo(() => {
    let trials = filtered.flatMap(p => p.trials.map(t => ({ ...t, personaId: p.personaId, participantId: p.id })));
    if (conditionFilter !== 'all') trials = trials.filter(t => t.condition === conditionFilter);
    return trials;
  }, [filtered, conditionFilter]);

  // Compute summaries
  const rtValues = filteredTrials.filter(t => t.rt !== null).map(t => t.rt!);
  const accValues = filteredTrials.filter(t => t.correct !== null).map(t => t.correct ? 1 : 0);
  const responseValues = filteredTrials.map(t => t.response);

  // By-condition breakdown
  const byCondition = useMemo(() => {
    const groups: Record<string, { rts: number[]; accs: number[]; responses: number[] }> = {};
    for (const t of filteredTrials) {
      if (!groups[t.condition]) groups[t.condition] = { rts: [], accs: [], responses: [] };
      if (t.rt !== null) groups[t.condition].rts.push(t.rt);
      if (t.correct !== null) groups[t.condition].accs.push(t.correct ? 1 : 0);
      groups[t.condition].responses.push(t.response);
    }
    return groups;
  }, [filteredTrials]);

  // By-persona breakdown
  const byPersona = useMemo(() => {
    const groups: Record<string, { rts: number[]; accs: number[]; responses: number[]; name: string }> = {};
    for (const p of filtered) {
      const persona = personaBank.find(pb => pb.id === p.personaId);
      if (!groups[p.personaId]) groups[p.personaId] = { rts: [], accs: [], responses: [], name: persona?.name || p.personaId };
      for (const t of p.trials) {
        if (t.rt !== null) groups[p.personaId].rts.push(t.rt);
        if (t.correct !== null) groups[p.personaId].accs.push(t.correct ? 1 : 0);
        groups[p.personaId].responses.push(t.response);
      }
    }
    return groups;
  }, [filtered]);

  // Learning curve: mean RT/accuracy in bins of 5 trials
  const learningCurve = useMemo(() => {
    const maxTrialIdx = Math.max(...filteredTrials.map(t => t.trialIndex), 0);
    const binSize = 5;
    const bins: { bin: string; meanRt: number; meanAcc: number }[] = [];
    for (let start = 0; start <= maxTrialIdx; start += binSize) {
      const binTrials = filteredTrials.filter(t => t.trialIndex >= start && t.trialIndex < start + binSize);
      const rts = binTrials.filter(t => t.rt !== null).map(t => t.rt!);
      const accs = binTrials.filter(t => t.correct !== null).map(t => t.correct ? 1 : 0);
      if (rts.length > 0 || accs.length > 0) {
        bins.push({
          bin: `${start + 1}-${start + binSize}`,
          meanRt: rts.length > 0 ? Math.round(mean(rts)) : 0,
          meanAcc: accs.length > 0 ? Math.round(mean(accs) * 100) : 0,
        });
      }
    }
    return bins;
  }, [filteredTrials]);

  const views: { id: View; label: string }[] = [
    { id: 'summary', label: 'summary' },
    { id: 'by-condition', label: 'by condition' },
    { id: 'by-persona', label: 'by persona' },
    { id: 'learning', label: 'learning curve' },
    { id: 'raw', label: 'raw data' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">simulated data explorer</h3>
        <span className="text-[10px] font-mono text-text-4">
          {filtered.length} participants · {filteredTrials.length} trials
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={personaFilter} onChange={e => setPersonaFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded-lg border border-orchid/15 bg-white text-text-2 cursor-pointer">
          <option value="all">all personas</option>
          {personaIds.map(id => {
            const p = personaBank.find(pb => pb.id === id);
            return <option key={id} value={id}>{p?.emoji} {p?.name || id}</option>;
          })}
        </select>
        {isBehavioral && (
          <select value={conditionFilter} onChange={e => setConditionFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded-lg border border-orchid/15 bg-white text-text-2 cursor-pointer">
            <option value="all">all conditions</option>
            {conditions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-all ${
              view === v.id ? 'bg-orchid/10 text-orchid border border-orchid/20' : 'text-text-3 hover:text-text-2'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Summary View */}
      {view === 'summary' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isBehavioral && rtValues.length > 0 && (
            <>
              <div className="p-3 rounded-xl bg-surface/50 border border-orchid/5">
                <div className="text-[10px] text-text-3">mean RT</div>
                <div className="text-lg font-heading text-text">{Math.round(mean(rtValues))} <span className="text-xs text-text-3">ms</span></div>
                <div className="text-[9px] text-text-4">SD: {Math.round(standardDeviation(rtValues))}</div>
              </div>
              <div className="p-3 rounded-xl bg-surface/50 border border-orchid/5">
                <div className="text-[10px] text-text-3">95% CI</div>
                <div className="text-sm font-mono text-text-2">[{confidenceInterval(rtValues).join(', ')}]</div>
              </div>
            </>
          )}
          {accValues.length > 0 && (
            <div className="p-3 rounded-xl bg-surface/50 border border-orchid/5">
              <div className="text-[10px] text-text-3">accuracy</div>
              <div className="text-lg font-heading text-text">{(mean(accValues) * 100).toFixed(1)}%</div>
              <div className="text-[9px] text-text-4">n={accValues.length}</div>
            </div>
          )}
          {!isBehavioral && responseValues.length > 0 && (
            <div className="p-3 rounded-xl bg-surface/50 border border-orchid/5">
              <div className="text-[10px] text-text-3">mean response</div>
              <div className="text-lg font-heading text-text">{mean(responseValues).toFixed(2)}</div>
              <div className="text-[9px] text-text-4">SD: {standardDeviation(responseValues).toFixed(2)}</div>
            </div>
          )}
          <div className="p-3 rounded-xl bg-surface/50 border border-orchid/5">
            <div className="text-[10px] text-text-3">sample</div>
            <div className="text-lg font-heading text-text">{filtered.length}</div>
            <div className="text-[9px] text-text-4">{personaIds.length} persona(s)</div>
          </div>
        </div>
      )}

      {/* By Condition */}
      {view === 'by-condition' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-orchid/10 text-xs text-text-3">
              <th className="text-left py-2">condition</th>
              <th className="text-right py-2">n trials</th>
              {isBehavioral && <th className="text-right py-2">mean RT</th>}
              {isBehavioral && <th className="text-right py-2">SD</th>}
              <th className="text-right py-2">{isBehavioral ? 'accuracy' : 'mean resp'}</th>
            </tr></thead>
            <tbody>
              {Object.entries(byCondition).map(([cond, data]) => (
                <tr key={cond} className="border-b border-orchid/5">
                  <td className="py-2 text-text-2">{cond}</td>
                  <td className="py-2 text-right text-text-3 font-mono">{data.rts.length || data.responses.length}</td>
                  {isBehavioral && <td className="py-2 text-right font-mono text-text">{Math.round(mean(data.rts))}</td>}
                  {isBehavioral && <td className="py-2 text-right font-mono text-text-3">{Math.round(standardDeviation(data.rts))}</td>}
                  <td className="py-2 text-right font-mono text-text">
                    {isBehavioral ? `${(mean(data.accs) * 100).toFixed(1)}%` : mean(data.responses).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Effect size between first and last condition */}
          {isBehavioral && conditions.length >= 2 && byCondition[conditions[0]] && byCondition[conditions[conditions.length - 1]] && (
            <div className="mt-3 p-2 rounded-lg bg-orchid/5 text-xs text-text-2">
              Cohen's d ({conditions[0]} vs {conditions[conditions.length - 1]}): <strong className="text-orchid">
                {cohensD(byCondition[conditions[0]].rts, byCondition[conditions[conditions.length - 1]].rts).value}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* By Persona */}
      {view === 'by-persona' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-orchid/10 text-xs text-text-3">
              <th className="text-left py-2">persona</th>
              <th className="text-right py-2">n</th>
              {isBehavioral && <th className="text-right py-2">mean RT</th>}
              <th className="text-right py-2">{isBehavioral ? 'accuracy' : 'mean resp'}</th>
            </tr></thead>
            <tbody>
              {Object.entries(byPersona).map(([id, data]) => (
                <tr key={id} className="border-b border-orchid/5">
                  <td className="py-2 text-text-2">{personaBank.find(p => p.id === id)?.emoji} {data.name}</td>
                  <td className="py-2 text-right text-text-3 font-mono">{filtered.filter(p => p.personaId === id).length}</td>
                  {isBehavioral && <td className="py-2 text-right font-mono text-text">{Math.round(mean(data.rts))}</td>}
                  <td className="py-2 text-right font-mono text-text">
                    {isBehavioral ? `${(mean(data.accs) * 100).toFixed(1)}%` : mean(data.responses).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Learning Curve */}
      {view === 'learning' && learningCurve.length > 0 && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-orchid/10 text-xs text-text-3">
                <th className="text-left py-2">trials</th>
                {isBehavioral && <th className="text-right py-2">mean RT (ms)</th>}
                <th className="text-right py-2">{isBehavioral ? 'accuracy %' : 'mean resp'}</th>
              </tr></thead>
              <tbody>
                {learningCurve.map(bin => (
                  <tr key={bin.bin} className="border-b border-orchid/5">
                    <td className="py-1.5 text-text-2 font-mono text-xs">{bin.bin}</td>
                    {isBehavioral && <td className="py-1.5 text-right font-mono text-text">{bin.meanRt}</td>}
                    <td className="py-1.5 text-right font-mono text-text">{bin.meanAcc}{isBehavioral ? '%' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Simple ASCII-style bar chart */}
          <div className="mt-3 space-y-1">
            {learningCurve.map(bin => (
              <div key={bin.bin} className="flex items-center gap-2 text-[10px]">
                <span className="w-12 text-text-4 text-right">{bin.bin}</span>
                <div className="flex-1 h-3 bg-orchid/5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-orchid/30"
                    style={{ width: `${isBehavioral ? bin.meanAcc : (bin.meanAcc / 5) * 100}%` }} />
                </div>
                <span className="w-10 text-text-3">{isBehavioral ? `${bin.meanAcc}%` : bin.meanRt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Data */}
      {view === 'raw' && (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white"><tr className="border-b border-orchid/10 text-text-3">
              <th className="text-left py-1 px-1">participant</th>
              <th className="text-left py-1 px-1">persona</th>
              <th className="text-left py-1 px-1">trial</th>
              <th className="text-left py-1 px-1">condition</th>
              {isBehavioral && <th className="text-right py-1 px-1">RT</th>}
              <th className="text-right py-1 px-1">{isBehavioral ? 'correct' : 'response'}</th>
            </tr></thead>
            <tbody>
              {filteredTrials.slice(0, 200).map((t, i) => (
                <tr key={i} className="border-b border-orchid/3 hover:bg-orchid/3">
                  <td className="py-0.5 px-1 font-mono text-text-3">{(t as any).participantId?.slice(-6)}</td>
                  <td className="py-0.5 px-1 text-text-3">{personaBank.find(p => p.id === (t as any).personaId)?.emoji}</td>
                  <td className="py-0.5 px-1 font-mono text-text-3">{t.trialIndex}</td>
                  <td className="py-0.5 px-1 text-text-2">{t.condition}</td>
                  {isBehavioral && <td className="py-0.5 px-1 text-right font-mono text-text">{t.rt}</td>}
                  <td className="py-0.5 px-1 text-right font-mono text-text">
                    {isBehavioral ? (t.correct ? '✓' : '✗') : t.response}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTrials.length > 200 && (
            <p className="text-[10px] text-text-4 mt-2 text-center">showing first 200 of {filteredTrials.length} trials</p>
          )}
        </div>
      )}

      <p className="text-[9px] text-text-4 mt-3 italic">
        synthetic data from seeded simulation — deterministic and reproducible
      </p>
    </motion.div>
  );
}
