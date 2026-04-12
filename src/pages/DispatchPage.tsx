import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { INTERN_PROFILES } from '../lib/interns';
import { proposeDesign, synthesizePilotResults, generatePeerReview } from '../lib/ai';
import { simulatePilot } from '../lib/simulation';
import { computePilotMetrics } from '../lib/metrics';
import { computeCrossTaskAnalysis } from '../lib/crossTaskAnalysis';
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

    const personas = session.personaIds.map(id => getPersona(id)).filter(Boolean) as typeof personaBank;
    const personaNames: Record<string, string> = {};
    personas.forEach(p => { personaNames[p.id] = p.name; });

    const isBattery = (session.battery ?? []).length > 0;

    (async () => {
      if (isBattery) {
        const allDesigns: any[] = [];
        const allMetrics: any[] = [];
        const allDatasets: any[] = [];
        const isBehavioralFlags: boolean[] = [];

        for (const task of (session.battery ?? [])) {
          const paradigm = getParadigm(task.paradigmId);
          if (!paradigm) continue;

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'proposing' } } });
          const design = await proposeDesign('scout', session.brief, paradigm, personas);

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'simulating', design } } });
          const dataset = simulatePilot(design, personas);

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'computing', dataset } } });
          const metrics = computePilotMetrics(design, dataset, personaNames);

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'done', design, dataset, metrics } } });

          allDesigns.push(design);
          allMetrics.push(metrics);
          allDatasets.push(dataset);
          isBehavioralFlags.push(paradigm.paradigmType === 'behavioral');
        }

        if (allDatasets.length >= 2) {
          const taskLabels = battery.map(t => getParadigm(t.paradigmId)?.name || t.paradigmId);
          const crossTask = computeCrossTaskAnalysis(taskLabels, allDatasets, isBehavioralFlags);
          dispatch({ type: 'SET_CROSS_TASK_ANALYSIS', payload: crossTask });
        }

        const synthesis = await synthesizePilotResults(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });

        const review = await generatePeerReview(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_PEER_REVIEW', payload: review });

      } else {
        const paradigm = getParadigm(session.paradigmId);
        if (!paradigm) return;

        const roles: InternRole[] = ['scout', 'analyst', 'reviewer'];
        const results = await Promise.all(roles.map(async (role) => {
          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'proposing' } } });
          const design = await proposeDesign(role, session.brief, paradigm, personas);

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'simulating', design } } });
          const dataset = simulatePilot(design, personas);

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'computing', dataset } } });
          const metrics = computePilotMetrics(design, dataset, personaNames);

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'done', metrics } } });
          return { design, metrics };
        }));

        const designs = results.map(r => r.design);
        const allMetrics = results.map(r => r.metrics);
        const synthesis = await synthesizePilotResults(session.brief, designs, allMetrics);
        dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });

        const review = await generatePeerReview(session.brief, designs, allMetrics);
        dispatch({ type: 'SET_PEER_REVIEW', payload: review });
      }

      dispatch({ type: 'SET_STEP', payload: 'report' });
      nav('/report');
    })();
  }, [session, dispatch, nav]);

  if (!session) return null;

  const battery = session.battery ?? [];
  const isBattery = battery.length > 0;
  const statusLabels: Record<string, string> = {
    pending: 'waiting...', proposing: 'designing...', simulating: 'simulating pilot...',
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
          {isBattery ? `running ${battery.length}-task battery...` : 'designing experiments...'}
        </motion.h2>
        <motion.p variants={staggerItem} className="text-sm text-text-3 mb-6">
          {session.brief.slice(0, 80)}{session.brief.length > 80 ? '...' : ''}
        </motion.p>

        <div className="space-y-2">
          {isBattery ? (
            battery.map(task => {
              const paradigm = getParadigm(task.paradigmId);
              const done = task.status === 'done';
              return (
                <motion.div key={task.paradigmId} variants={staggerItem}
                  className="card p-3 flex items-center gap-3"
                  style={done ? { borderColor: 'rgba(143,184,154,0.3)' } : undefined}>
                  <motion.div
                    animate={!done ? { rotate: 360 } : {}}
                    transition={!done ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0 bg-orchid/5">
                    {paradigm?.emoji || '🔬'}
                  </motion.div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold text-text">{paradigm?.name || task.paradigmId}</div>
                  </div>
                  <span className={`text-[11px] font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                    {statusLabels[task.status] || task.status}
                  </span>
                </motion.div>
              );
            })
          ) : (
            session.designReports.map(report => {
              const profile = INTERN_PROFILES[report.role];
              const done = report.status === 'done';
              return (
                <motion.div key={report.role} variants={staggerItem}
                  className="card p-3 flex items-center gap-3"
                  style={done ? { borderColor: `${profile.color}30` } : undefined}>
                  <motion.div
                    animate={!done ? { rotate: 360 } : {}}
                    transition={!done ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                    style={{ background: `${profile.color}15` }}>
                    {profile.emoji}
                  </motion.div>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold" style={{ color: profile.color }}>{profile.name}</div>
                    <div className="text-[10px] text-text-3">{profile.description}</div>
                  </div>
                  <span className={`text-[11px] font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                    {statusLabels[report.status] || report.status}
                  </span>
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
