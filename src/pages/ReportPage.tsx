import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { DesignCard } from '../components/report/DesignCard';
import { DesignEditor } from '../components/report/DesignEditor';
import { TaskPreview } from '../components/preview/TaskPreview';
import { PeerReviewCard } from '../components/report/PeerReviewCard';
import { CrossTaskView } from '../components/report/CrossTaskView';
import { ResultRenderer } from '../components/report/ResultRenderer';
import { AnalysisChat } from '../components/report/AnalysisChat';
import { getParadigm } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import { stagger, staggerItem } from '../lib/animations';

export function ReportPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [iterationFeedback, setIterationFeedback] = useState('');

  if (!session) return <div className="min-h-screen flex items-center justify-center text-text-3">loading...</div>;

  const battery = session.battery ?? [];
  const selectedPersonas = session.personaIds
    .map(id => personaBank.find(p => p.id === id))
    .filter(Boolean) as typeof personaBank;

  const isBatteryMode = battery.length > 0;
  const doneBatteryTasks = battery.filter(t => t.status === 'done' && t.design && t.metrics);
  const doneReports = (session.designReports ?? []).filter(r => r.status === 'done' && r.design && r.metrics);

  // In battery mode, use battery tasks; in single mode, use design reports
  const hasResults = isBatteryMode ? doneBatteryTasks.length > 0 : doneReports.length > 0;
  if (!hasResults) return <div className="min-h-screen flex items-center justify-center text-text-3">loading reports...</div>;

  // For single mode: selected design from the 3 intern proposals
  const selected = isBatteryMode
    ? (doneBatteryTasks[selectedIdx] || doneBatteryTasks[0])
    : (doneReports[selectedIdx] || doneReports[0]);
  const paradigm = getParadigm(session.paradigmId);

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-4xl mx-auto">

        {/* Header */}
        <motion.div variants={staggerItem} className="mb-6">
          <span className="text-sm font-mono font-light text-text-3">nightshift · pilot report</span>
          <h1 className="text-xl sm:text-2xl font-heading text-text mt-1">{session.brief}</h1>
          <p className="text-xs text-text-4 mt-1">
            {isBatteryMode
            ? `${battery.length} tasks · round ${session.round} · ${session.personaIds.length} populations`
            : `${paradigm?.emoji} ${paradigm?.name} · round ${session.round} · ${session.personaIds.length} populations`
          }
          </p>
        </motion.div>

        {/* Design Comparison */}
        <motion.div variants={staggerItem} className="mb-6">
          <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-3">
            {isBatteryMode ? 'battery tasks' : 'experiment designs'}
          </h2>
          <div className={`grid grid-cols-1 ${isBatteryMode ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-3'} gap-3`}>
            {isBatteryMode
              ? doneBatteryTasks.map((t, i) => (
                  <DesignCard key={t.paradigmId} design={t.design!} metrics={t.metrics!}
                    selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
                ))
              : doneReports.map((r, i) => (
                  <DesignCard key={r.role} design={r.design!} metrics={r.metrics!}
                    selected={selectedIdx === i} onSelect={() => setSelectedIdx(i)} />
                ))
            }
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
              <TaskPreview
                design={selected.design}
                onClose={() => setPreviewing(false)}
                onDesignChange={(updated) => {
                  // Update the design in state when researcher tweaks params in preview
                  if ('role' in selected) {
                    dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role: selected.role, report: { design: updated } } });
                  } else if ('paradigmId' in selected) {
                    dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: selected.paradigmId, update: { design: updated } } });
                  }
                }}
              />
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
                  role: 'role' in selected ? selected.role : 'scout',
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

        {/* All analysis is from the pipeline — no hardcoded sections */}

        {/* Dynamic Analysis Results — live updates from pipeline + chat agent */}
        {(session.analysisResults ?? []).length > 0 && (
          <motion.div variants={staggerItem} className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-text-3 uppercase tracking-wider">
                analysis results ({(session.analysisResults ?? []).length})
              </h2>
              <span className="text-[9px] text-text-4">
                auto-updated when analysis agent runs new steps
              </span>
            </div>
            {(session.analysisResults ?? []).map((result: any, i: number) => (
              <ResultRenderer key={`${result.stepId}-${i}-${(session.analysisResults ?? []).length}`} result={result} />
            ))}
          </motion.div>
        )}

        {/* Cross-task analysis (battery mode) */}
        {session.crossTaskAnalysis && (
          <motion.div variants={staggerItem} className="mb-6">
            <CrossTaskView analysis={session.crossTaskAnalysis} />
          </motion.div>
        )}

        {/* Peer review */}
        {session.peerReview && (
          <motion.div variants={staggerItem} className="mb-6">
            <PeerReviewCard review={session.peerReview} />
          </motion.div>
        )}

        {/* Battery tasks overview */}
        {battery.length > 0 && (
          <motion.div variants={staggerItem} className="card p-5 mb-6">
            <h3 className="text-sm font-heading text-text mb-3">battery tasks ({battery.length})</h3>
            <div className="space-y-2">
              {battery.filter(t => t.metrics).map(task => {
                const paradigm = getParadigm(task.paradigmId);
                return (
                  <div key={task.paradigmId} className="flex items-center justify-between p-2 rounded-lg bg-surface/50">
                    <span className="text-sm text-text-2">{paradigm?.emoji} {paradigm?.name}</span>
                    <span className="text-xs font-mono" style={{
                      color: task.metrics!.overallScore >= 75 ? '#8FB89A' : task.metrics!.overallScore >= 50 ? '#E8A87C' : '#D47B7B'
                    }}>
                      {task.metrics!.overallScore}/100
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Analysis Chat — iterate on analyses conversationally */}
        <motion.div variants={staggerItem} className="mb-6">
          <AnalysisChat />
        </motion.div>

        {/* Iteration: feedback → next round */}
        <motion.div variants={staggerItem} className="card p-5 mb-6">
          <h3 className="text-sm font-heading text-text mb-2">iterate</h3>
          <p className="text-xs text-text-3 mb-3">what should change in the next round? your feedback shapes the next experiment.</p>
          <textarea
            value={iterationFeedback}
            onChange={e => setIterationFeedback(e.target.value)}
            placeholder="e.g., 'increase difficulty on Tower of London — too easy for college students' or 'add a survey measure' or 'try with children instead'"
            rows={2}
            className="w-full card p-3 text-sm text-text resize-none focus:outline-none mb-3"
          />
          <div className="flex gap-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => {
                const feedback = iterationFeedback.trim();
                const newBrief = feedback ? `${session.brief} [round ${session.round} feedback: ${feedback}]` : session.brief;
                // Single dispatch — ITERATE_SESSION archives current + creates new
                // Then we need to set the new session as a battery or single experiment
                // The cleanest way: complete current, then start fresh with feedback in brief
                dispatch({ type: 'COMPLETE_SESSION' });
                if (isBatteryMode) {
                  dispatch({ type: 'START_BATTERY', payload: { brief: newBrief, paradigmIds: session.paradigmIds ?? [session.paradigmId], personaIds: session.personaIds } });
                } else {
                  dispatch({ type: 'START_EXPERIMENT', payload: { brief: newBrief, paradigmId: session.paradigmId, personaIds: session.personaIds } });
                }
                nav('/dispatch');
              }}
              disabled={!iterationFeedback.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
              next round with feedback →
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={() => { dispatch({ type: 'COMPLETE_SESSION' }); nav('/'); }}
              className="px-4 py-2.5 rounded-xl text-xs text-text-3 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
              done
            </motion.button>
          </div>
        </motion.div>

        {/* Back to design studio */}
        <motion.div variants={staggerItem} className="flex justify-center pb-12">
          <button onClick={() => { dispatch({ type: 'COMPLETE_SESSION' }); nav('/'); }}
            className="text-xs text-text-3 cursor-pointer hover:text-orchid">
            ← back to design studio
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
