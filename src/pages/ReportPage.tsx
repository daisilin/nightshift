import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { DesignCard } from '../components/report/DesignCard';
import { DesignEditor } from '../components/report/DesignEditor';
import { PersonaComparison } from '../components/report/PersonaComparison';
import { MetricCard } from '../components/report/MetricCard';
import { DistributionChart } from '../components/report/DistributionChart';
import { TaskPreview } from '../components/preview/TaskPreview';
import { getParadigm } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import { stagger, staggerItem } from '../lib/animations';

const CONDITION_COLORS = ['#8BACD4', '#B07CC6', '#E8A87C', '#8FB89A', '#D48BB5'];

export function ReportPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  if (!session) return null;

  const selectedPersonas = session.personaIds
    .map(id => personaBank.find(p => p.id === id))
    .filter(Boolean) as typeof personaBank;

  const doneReports = session.designReports.filter(r => r.status === 'done' && r.design && r.metrics);
  if (doneReports.length === 0) return <div className="min-h-screen flex items-center justify-center text-text-3">loading reports...</div>;

  const selected = doneReports[selectedIdx] || doneReports[0];
  const paradigm = getParadigm(session.paradigmId);

  // Distribution data from selected design
  const distributionGroups = (() => {
    if (!selected.dataset || !selected.design || selected.design.params.type !== 'behavioral') return [];
    const condRts: Record<string, number[]> = {};
    for (const p of selected.dataset.participants) {
      for (const t of p.trials) {
        if (t.rt !== null) {
          if (!condRts[t.condition]) condRts[t.condition] = [];
          condRts[t.condition].push(t.rt);
        }
      }
    }
    return Object.entries(condRts).map(([name, values], i) => ({
      name, values, color: CONDITION_COLORS[i % CONDITION_COLORS.length],
    }));
  })();

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-4xl mx-auto">

        {/* Header */}
        <motion.div variants={staggerItem} className="mb-6">
          <span className="text-sm font-mono font-light text-text-3">nightshift · pilot report</span>
          <h1 className="text-xl sm:text-2xl font-heading text-text mt-1">{session.brief}</h1>
          <p className="text-xs text-text-4 mt-1">
            {paradigm?.emoji} {paradigm?.name} · round {session.round} · {session.personaIds.length} populations
          </p>
        </motion.div>

        {/* Design Comparison */}
        <motion.div variants={staggerItem} className="mb-6">
          <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-3">experiment designs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {doneReports.map((r, i) => (
              <DesignCard key={r.role} design={r.design!} metrics={r.metrics!}
                selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
            ))}
          </div>
        </motion.div>

        {/* Try it + Preview */}
        {selected.design && (
          <motion.div variants={staggerItem} className="mb-4">
            {!previewing ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPreviewing(true)}
                className="w-full py-3 rounded-[14px] text-sm font-semibold text-orchid border border-orchid/20 bg-orchid/5 cursor-pointer hover:bg-orchid/10 transition-all"
              >
                🎮 try this experiment yourself
              </motion.button>
            ) : (
              <TaskPreview design={selected.design} onClose={() => setPreviewing(false)} />
            )}
          </motion.div>
        )}

        {/* Tweak button + Editor */}
        <motion.div variants={staggerItem} className="mb-6">
          {!editing ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setEditing(true)}
              className="w-full py-3 rounded-[14px] text-sm font-semibold text-text-2 border border-dashed border-orchid/20 bg-orchid/3 cursor-pointer hover:bg-orchid/8 transition-all"
            >
              tweak this design — adjust params and re-simulate instantly
            </motion.button>
          ) : selected.design && selected.metrics ? (
            <DesignEditor
              design={selected.design}
              originalMetrics={selected.metrics}
              personas={selectedPersonas}
              onApply={(newDesign, newMetrics) => {
                dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: {
                  role: selected.role,
                  report: { design: newDesign, metrics: newMetrics },
                }});
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
            />
          ) : null}
        </motion.div>

        {/* AI Synthesis */}
        {session.synthesis && (
          <motion.div variants={staggerItem} className="card p-5 mb-6">
            <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2">ai interpretation</h2>
            <p className="text-sm text-text-2 leading-relaxed">{session.synthesis}</p>
          </motion.div>
        )}

        {/* Persona Comparison */}
        {selected.metrics && (
          <motion.div variants={staggerItem} className="mb-6">
            <PersonaComparison metrics={selected.metrics} />
          </motion.div>
        )}

        {/* Key Metrics */}
        {selected.metrics && (
          <motion.div variants={staggerItem} className="mb-6">
            <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-3">key metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {selected.metrics.overall.slice(0, 8).map((m, i) => (
                <MetricCard key={i} metric={m} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Distribution Charts */}
        {distributionGroups.length > 0 && (
          <motion.div variants={staggerItem} className="mb-6">
            <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-3">distributions</h2>
            <DistributionChart label="RT by condition" groups={distributionGroups} unit="ms" />
          </motion.div>
        )}

        {/* Actions */}
        <motion.div variants={staggerItem} className="flex gap-3 justify-center pt-4 pb-12">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { dispatch({ type: 'COMPLETE_SESSION' }); nav('/'); }}
            className="px-6 py-3 rounded-[14px] text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)', boxShadow: '0 4px 14px rgba(176,124,198,0.25)' }}>
            done — new research 🌙
          </motion.button>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => {
              // Re-dispatch with same paradigm + personas but as next round
              dispatch({ type: 'ITERATE_SESSION', payload: {
                refinedBrief: session.brief,
                missions: [],
              }});
              // Restart as experiment
              dispatch({ type: 'START_EXPERIMENT', payload: {
                brief: session.brief,
                paradigmId: session.paradigmId,
                personaIds: session.personaIds,
              }});
              nav('/dispatch');
            }}
            className="px-6 py-3 rounded-[14px] text-sm font-semibold text-text-2 border border-orchid/15 bg-orchid/5 cursor-pointer">
            new round — different designs →
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
