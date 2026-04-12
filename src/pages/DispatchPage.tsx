import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { INTERN_PROFILES } from '../lib/interns';
import { proposeDesign, synthesizePilotResults } from '../lib/ai';
import { simulatePilot } from '../lib/simulation';
import { computePilotMetrics } from '../lib/metrics';
import { getParadigm } from '../data/taskBank';
import { personaBank, getPersona } from '../data/personaBank';
import type { InternRole } from '../context/types';
import { stagger, staggerItem } from '../lib/animations';

export function DispatchPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const ran = useRef(false);

  useEffect(() => {
    if (!session || ran.current) return;
    ran.current = true;

    const paradigm = getParadigm(session.paradigmId);
    if (!paradigm) return;

    const personas = session.personaIds.map(id => getPersona(id)).filter(Boolean) as typeof personaBank;
    const personaNames: Record<string, string> = {};
    personas.forEach(p => { personaNames[p.id] = p.name; });

    const roles: InternRole[] = ['scout', 'analyst', 'contrarian'];

    (async () => {
      const results = await Promise.all(roles.map(async (role) => {
        // Step 1: Propose
        dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'proposing' } } });
        const design = await proposeDesign(role, session.brief, paradigm, personas);

        // Step 2: Simulate
        dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'simulating', design } } });
        const dataset = simulatePilot(design, personas);

        // Step 3: Compute
        dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'computing', dataset } } });
        const metrics = computePilotMetrics(design, dataset, personaNames);

        // Step 4: Done
        dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'done', metrics } } });

        return { design, metrics };
      }));

      // Synthesize
      const designs = results.map(r => r.design);
      const allMetrics = results.map(r => r.metrics);
      const synthesis = await synthesizePilotResults(session.brief, designs, allMetrics);

      dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });
      dispatch({ type: 'SET_STEP', payload: 'report' });
      nav('/report');
    })();
  }, [session, dispatch, nav]);

  if (!session) return null;

  const statusLabels: Record<string, string> = {
    pending: 'waiting...', proposing: 'designing experiment...', simulating: 'running pilot...',
    computing: 'computing metrics...', done: 'done ✓', error: 'error',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-md w-full text-center">
        <motion.div variants={staggerItem} className="mb-2">
          <span className="text-sm font-mono font-light text-text-3">nightshift</span>
        </motion.div>
        <motion.h2 variants={staggerItem} className="text-xl font-heading mb-2 text-text">
          interns are designing experiments...
        </motion.h2>
        <motion.p variants={staggerItem} className="text-sm text-text-3 mb-8">
          {session.brief.slice(0, 80)}{session.brief.length > 80 ? '...' : ''}
        </motion.p>

        <div className="space-y-3">
          {session.designReports.map((report) => {
            const profile = INTERN_PROFILES[report.role];
            const done = report.status === 'done';
            return (
              <motion.div key={report.role} variants={staggerItem} className="card p-4 flex items-center gap-4"
                style={done ? { borderColor: `${profile.color}30` } : undefined}>
                <motion.div
                  animate={!done ? { rotate: 360 } : {}}
                  transition={!done ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `${profile.color}15` }}>
                  {profile.emoji}
                </motion.div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold" style={{ color: profile.color }}>{profile.name}</div>
                  <div className="text-xs text-text-3">{profile.description}</div>
                </div>
                <span className={`text-xs font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                  {statusLabels[report.status] || report.status}
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
