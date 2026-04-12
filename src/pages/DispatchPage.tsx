import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { INTERN_PROFILES } from '../lib/interns';
import { proposeDesign, synthesizePilotResults, generatePeerReview, planAnalysis } from '../lib/ai';
import { simulatePilot, simulateBattery } from '../lib/simulation';
import { computePilotMetrics } from '../lib/metrics';
import { runAnalysisPipeline, defaultBatteryPlan, defaultSingleTaskPlan } from '../lib/analysis/registry';
import { getParadigm } from '../data/taskBank';
import { personaBank, getPersona } from '../data/personaBank';
import type { ExperimentDesign } from '../lib/types';
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

    const battery = session.battery ?? [];
    const isBattery = battery.length > 0;

    (async () => {
      if (isBattery) {
        // === BATTERY MODE: INSTANT with SHARED latent profiles ===
        // Same simulated participants take all tasks (realistic cross-task correlations)
        const allDesigns: ExperimentDesign[] = [];
        const paradigms: any[] = [];

        // Create designs from task bank defaults
        for (const task of battery) {
          const paradigm = getParadigm(task.paradigmId);
          if (!paradigm) continue;
          paradigms.push(paradigm);
          allDesigns.push({
            id: `design-${task.paradigmId}-${Date.now()}`,
            name: paradigm.name,
            paradigmId: task.paradigmId,
            personaIds: session.personaIds,
            params: paradigm.defaultParams,
            nParticipantsPerPersona: 20,
            hypotheses: [`Effect of condition on ${paradigm.dependentVariables[0]?.name || 'performance'}`],
            rationale: `Standard ${paradigm.name} design from task bank`,
            internRole: 'scout',
          });
        }

        // Simulate ALL tasks with shared latent profiles (instant)
        const allDatasets = simulateBattery(allDesigns, personas, 42);
        const allMetrics: any[] = [];

        // Compute metrics per task and update UI
        for (let ti = 0; ti < battery.length; ti++) {
          const task = battery[ti];
          const design = allDesigns[ti];
          const dataset = allDatasets[ti];
          if (!design || !dataset) continue;

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'computing', design, dataset } } });
          const metrics = computePilotMetrics(design, dataset, personaNames);
          allMetrics.push(metrics);

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'done', design, dataset, metrics } } });
        }

        // Run full analysis pipeline (instant — all pure computation)
        const plan = defaultBatteryPlan(allDatasets.length);
        const analysisResults = runAnalysisPipeline(plan, {
          datasets: allDatasets, designs: allDesigns, paradigms, personas,
        });
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: analysisResults });

        // THEN use Claude for interpretation + peer review (2 API calls, not N)
        const synthesis = await synthesizePilotResults(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });

        const review = await generatePeerReview(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_PEER_REVIEW', payload: review });

      } else {
        // === SINGLE PARADIGM: 3 interns propose design variants ===
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
          return { design, dataset, metrics };
        }));

        // Analysis on best design
        const bestIdx = results.reduce((bi, r, i) => r.metrics.overallScore > results[bi].metrics.overallScore ? i : bi, 0);
        const singleResults = runAnalysisPipeline(defaultSingleTaskPlan(), {
          datasets: [results[bestIdx].dataset], designs: [results[bestIdx].design], paradigms: [paradigm], personas,
        });
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: singleResults });

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
    pending: 'waiting...', proposing: 'designing...', simulating: 'simulating...',
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
          {isBattery ? `simulating ${battery.length}-task battery...` : 'designing experiments...'}
        </motion.h2>
        <motion.p variants={staggerItem} className="text-sm text-text-3 mb-6">
          {session.brief.slice(0, 80)}{session.brief.length > 80 ? '...' : ''}
        </motion.p>

        <div className="space-y-2">
          {isBattery ? battery.map(task => {
            const paradigm = getParadigm(task.paradigmId);
            const done = task.status === 'done';
            return (
              <motion.div key={task.paradigmId} variants={staggerItem}
                className="card p-3 flex items-center gap-3"
                style={done ? { borderColor: 'rgba(143,184,154,0.3)' } : undefined}>
                <span className="text-lg">{paradigm?.emoji || '🔬'}</span>
                <span className="flex-1 text-left text-sm text-text">{paradigm?.name}</span>
                <span className={`text-[11px] font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                  {statusLabels[task.status]}
                </span>
              </motion.div>
            );
          }) : (session.designReports ?? []).map(report => {
            const profile = INTERN_PROFILES[report.role];
            const done = report.status === 'done';
            return (
              <motion.div key={report.role} variants={staggerItem} className="card p-3 flex items-center gap-3">
                <span className="text-lg">{profile.emoji}</span>
                <div className="flex-1 text-left">
                  <span className="text-sm font-semibold" style={{ color: profile.color }}>{profile.name}</span>
                </div>
                <span className={`text-[11px] font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                  {statusLabels[report.status]}
                </span>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
