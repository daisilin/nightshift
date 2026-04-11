import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { INTERN_PROFILES, buildRefinedBrief, createMissions } from '../lib/interns';
import type { InternRole, FindingFeedback } from '../context/types';
import { stagger, staggerItem } from '../lib/animations';
import { RoundDiff } from '../components/report/RoundDiff';

const feedbackOptions: { value: FindingFeedback; label: string; emoji: string }[] = [
  { value: 'useful', label: 'useful', emoji: '👍' },
  { value: 'deeper', label: 'go deeper', emoji: '🔍' },
  { value: 'shallow', label: 'shallow', emoji: '😐' },
  { value: 'wrong', label: 'wrong direction', emoji: '↩️' },
];

export function ReportPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;

  if (!session) return null;

  const allFindings = session.reports.flatMap(r => r.findings);
  const avgConfidence = allFindings.length > 0
    ? allFindings.reduce((sum, f) => sum + f.confidence, 0) / allFindings.length
    : 0;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-3xl mx-auto">

        {/* Header */}
        <motion.div variants={staggerItem} className="flex items-center justify-between mb-8">
          <div>
            <span className="text-sm font-mono font-light text-text-3">nightshift · morning briefing</span>
            <h1 className="text-2xl sm:text-3xl font-heading text-text mt-1">{session.brief}</h1>
            <p className="text-xs text-text-4 mt-1">round {session.round} · {new Date(session.createdAt).toLocaleString()}</p>
          </div>
        </motion.div>

        {/* Round diff — shows what changed from previous round */}
        {session.round > 1 && session.previousSessionId && (() => {
          const prev = state.sessions.find(s => s.id === session.previousSessionId);
          return prev ? <RoundDiff currentSession={session} previousSession={prev} /> : null;
        })()}

        {/* Synthesis card — the hero */}
        {session.synthesis && (
          <motion.div variants={staggerItem} className="card p-6 mb-6">
            <h2 className="text-sm font-mono font-light text-text-3 uppercase tracking-wider mb-3">executive summary</h2>
            <p className="text-text-2 leading-relaxed">{session.synthesis}</p>
            <div className="mt-4 flex items-center gap-4 text-xs text-text-3">
              <span>confidence: <strong className="text-text-2">{Math.round(avgConfidence * 100)}%</strong></span>
              <span>findings: <strong className="text-text-2">{allFindings.length}</strong></span>
              <span>interns: <strong className="text-text-2">3</strong></span>
            </div>
          </motion.div>
        )}

        {/* Agreements & Disagreements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {session.agreements.length > 0 && (
            <motion.div variants={staggerItem} className="card p-5">
              <h3 className="text-sm font-semibold text-sage mb-3">✅ where they agree</h3>
              <ul className="space-y-2">
                {session.agreements.map((a, i) => (
                  <li key={i} className="text-sm text-text-2 leading-relaxed">{a}</li>
                ))}
              </ul>
            </motion.div>
          )}
          {session.disagreements.length > 0 && (
            <motion.div variants={staggerItem} className="card p-5">
              <h3 className="text-sm font-semibold text-peach mb-3">⚡ where they disagree</h3>
              <ul className="space-y-2">
                {session.disagreements.map((d, i) => (
                  <li key={i} className="text-sm text-text-2 leading-relaxed">{d}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>

        {/* Intern reports */}
        {(['scout', 'analyst', 'contrarian'] as InternRole[]).map(role => {
          const report = session.reports.find(r => r.role === role);
          const profile = INTERN_PROFILES[role];
          if (!report || report.findings.length === 0) return null;

          return (
            <motion.div key={role} variants={staggerItem} className="card p-6 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl">{profile.emoji}</span>
                <div>
                  <span className="text-sm font-semibold" style={{ color: profile.color }}>{profile.name}</span>
                  <p className="text-xs text-text-3">{report.summary.slice(0, 100)}</p>
                </div>
              </div>

              <div className="space-y-3">
                {report.findings.map(finding => (
                  <div key={finding.id} className="rounded-xl bg-surface/50 p-4 border border-orchid/5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-text-2 leading-relaxed flex-1">{finding.text}</p>
                      {/* Confidence dot */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full" style={{
                          background: finding.confidence >= 0.8 ? '#8FB89A' : finding.confidence >= 0.5 ? '#E8A87C' : '#D48BB5',
                        }} />
                        <span className="text-[10px] font-mono text-text-4">{Math.round(finding.confidence * 100)}%</span>
                      </div>
                    </div>

                    {/* Feedback buttons */}
                    <div className="flex gap-1.5 mt-3">
                      {feedbackOptions.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => dispatch({ type: 'SET_FEEDBACK', payload: { findingId: finding.id, feedback: opt.value } })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all ${
                            finding.feedback === opt.value
                              ? 'bg-orchid/15 text-orchid border border-orchid/25'
                              : 'bg-white text-text-3 border border-orchid/8 hover:border-orchid/20 hover:text-text-2'
                          }`}
                        >
                          {opt.emoji} {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}

        {/* Open questions */}
        {session.openQuestions.length > 0 && (
          <motion.div variants={staggerItem} className="card p-5 mb-4">
            <h3 className="text-sm font-semibold text-orchid mb-3">❓ open questions</h3>
            <ul className="space-y-2">
              {session.openQuestions.map((q, i) => (
                <li key={i} className="text-sm text-text-2">{q}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Next missions */}
        {session.nextMissions.length > 0 && (
          <motion.div variants={staggerItem} className="card p-5 mb-6">
            <h3 className="text-sm font-semibold text-blue mb-3">🔮 suggested next missions</h3>
            <ul className="space-y-2">
              {session.nextMissions.map((m, i) => (
                <li key={i} className="text-sm text-text-2">{m}</li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div variants={staggerItem} className="flex gap-3 justify-center pt-4 pb-12">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => { dispatch({ type: 'COMPLETE_SESSION' }); nav('/'); }}
            className="px-6 py-3 rounded-[14px] text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)', boxShadow: '0 4px 14px rgba(176,124,198,0.25)' }}
          >
            done — new research 🌙
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              const refined = buildRefinedBrief(session);
              const missions = createMissions(refined);
              dispatch({ type: 'ITERATE_SESSION', payload: { refinedBrief: refined, missions } });
              nav('/dispatch');
            }}
            className="px-6 py-3 rounded-[14px] text-sm font-semibold text-text-2 border border-orchid/15 bg-orchid/5 cursor-pointer hover:bg-orchid/10 transition-all"
          >
            iterate with feedback →
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
