import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { INTERN_PROFILES } from '../lib/interns';
import { proposeDesign, synthesizePilotResults, generatePeerReview, planAnalysis } from '../lib/ai';
import { simulatePilot, simulateBattery } from '../lib/simulation';
import { computePilotMetrics } from '../lib/metrics';
import { runAnalysisPipeline, defaultBatteryPlan, defaultSingleTaskPlan } from '../lib/analysis/registry';
import { runLLMTrial } from '../lib/llmParticipant';
import { generatePool, type SimulatedPerson } from '../lib/participantPool';
import { buildTaskPrompt } from '../lib/personaPrompts';
import { getParadigm } from '../data/taskBank';
import { personaBank, getPersona } from '../data/personaBank';
import type { ExperimentDesign, SimulatedDataset, SimulatedParticipant, SimulatedTrial } from '../lib/types';
import type { InternRole } from '../context/types';
import { stagger, staggerItem } from '../lib/animations';

export function DispatchPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const ran = useRef(false);
  const [llmProgress, setLlmProgress] = useState({ current: 0, total: 0, status: '' });

  useEffect(() => {
    if (!session || ran.current || state.step !== 'dispatch') return;
    ran.current = true;

    const personas = session.personaIds.map(id => getPersona(id)).filter(Boolean) as typeof personaBank;
    const personaNames: Record<string, string> = {};
    personas.forEach(p => { personaNames[p.id] = p.name; });

    const battery = session.battery ?? [];
    const isBattery = battery.length > 0;
    const isLLM = (session as any).simulationMode === 'llm';

    (async () => {
      // === LLM SIMULATION MODE ===
      if (isLLM && isBattery) {
        const nParticipants = 5; // small N for LLM (each is an API call)
        const paradigmIds = battery.map(t => t.paradigmId);
        const totalCalls = paradigmIds.length * nParticipants * 3; // 3 trials per task per participant
        let callsDone = 0;

        setLlmProgress({ current: 0, total: totalCalls, status: 'generating participant pool...' });

        // Generate diverse pool
        const popType = session.personaIds[0] || 'college-student';
        const pool = generatePool(popType, nParticipants);

        const allDatasets: SimulatedDataset[] = [];
        const allDesigns: ExperimentDesign[] = [];
        const paradigms: any[] = [];

        for (const task of battery) {
          const paradigm = getParadigm(task.paradigmId);
          if (!paradigm) continue;
          paradigms.push(paradigm);

          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'simulating' } } });

          const design: ExperimentDesign = {
            id: `llm-${task.paradigmId}-${Date.now()}`, name: paradigm.name,
            paradigmId: task.paradigmId, personaIds: session.personaIds,
            params: paradigm.defaultParams, nParticipantsPerPersona: nParticipants,
            hypotheses: [], rationale: 'LLM-based simulation', internRole: 'scout',
          };
          allDesigns.push(design);

          // Run LLM trials for each participant
          const participants: SimulatedParticipant[] = [];
          const taskPrompt = buildTaskPrompt(task.paradigmId, paradigm.description);

          for (let pi = 0; pi < nParticipants; pi++) {
            const person = pool[pi];
            setLlmProgress({ current: callsDone, total: totalCalls, status: `${paradigm.name}: participant ${pi + 1}/${nParticipants} (${person.demographics.gender}, ${person.demographics.age})` });

            const trials: SimulatedTrial[] = [];
            // Run 3 trials per task (enough for LLM, each is an API call)
            for (let ti = 0; ti < 3; ti++) {
              const result = await runLLMTrial({
                taskDescription: taskPrompt,
                stimulus: `Trial ${ti + 1}: ${paradigm.description}. Respond as if you are actually doing this task.`,
                personaPrompt: person.llmPrompt,
                responseFormat: '{ "response": number (1-5 for survey, 0 or 1 for accuracy), "confidence": number (0-1), "reaction_time_estimate": "fast/medium/slow" }',
              });

              const rtEstimate = result.response?.reaction_time_estimate === 'fast' ? 500 : result.response?.reaction_time_estimate === 'slow' ? 2000 : 1000;
              trials.push({
                trialIndex: ti,
                condition: paradigm.defaultParams.type === 'behavioral' ? (paradigm.defaultParams as any).conditionLabels?.[ti % 2] || 'default' : 'survey',
                rt: rtEstimate + result.latencyMs * 0.1, // API latency as proxy
                response: result.response?.response ?? Math.round(Math.random()),
                correct: result.response?.response === 1 ? true : result.response?.response === 0 ? false : null,
              });
              callsDone++;
              setLlmProgress({ current: callsDone, total: totalCalls, status: `${paradigm.name}: participant ${pi + 1}, trial ${ti + 1}/3` });
            }

            participants.push({
              id: person.id, personaId: popType,
              condition: null, trials, seed: 0,
            });
          }

          const dataset: SimulatedDataset = { designId: design.id, participants, masterSeed: 0, generatedAt: Date.now() };
          allDatasets.push(dataset);

          const metrics = computePilotMetrics(design, dataset, personaNames);
          dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'done', design, dataset, metrics } } });
        }

        // Run analysis
        const plan = defaultBatteryPlan(allDatasets.length);
        const analysisResults = runAnalysisPipeline(plan, { datasets: allDatasets, designs: allDesigns, paradigms, personas });
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: analysisResults });

        const synthesis = await synthesizePilotResults(session.brief, allDesigns, []);
        dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });

        dispatch({ type: 'SET_STEP', payload: 'report' });
        nav('/report');
        return;
      }

      if (isBattery) {
        // === PARAMETRIC BATTERY MODE ===
        // Same simulated participants take all tasks (realistic cross-task correlations)
        const allDesigns: ExperimentDesign[] = [];
        const paradigms: any[] = [];

        // Check if brief contains iteration feedback
        const feedbackMatch = session.brief.match(/\[round \d+ feedback: (.+?)\]/);
        const feedback = feedbackMatch?.[1] || '';

        // If there's feedback, ask Claude to adjust params; otherwise use defaults
        let paramOverrides: Record<string, any> | null = null;
        if (feedback) {
          try {
            const res = await fetch('/api/claude', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 400,
                system: `You adjust experiment parameters based on researcher feedback.
Current default params for behavioral tasks: difficulty 0.5, nTrials 30, nConditions 2-3, nParticipantsPerPersona 20.
Return ONLY JSON with fields to override: { "nTrials": 60, "difficulty": 0.7, "nParticipantsPerPersona": 30 }
Only include fields that the feedback asks to change. Return {} if no param changes needed.`,
                messages: [{ role: 'user', content: `Feedback: "${feedback}"` }],
              }),
            });
            const data = await res.json();
            const raw = data.content?.[0]?.text ?? '';
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const first = cleaned.indexOf('{');
            const last = cleaned.lastIndexOf('}');
            if (first >= 0 && last > first) {
              paramOverrides = JSON.parse(cleaned.slice(first, last + 1));
            }
          } catch { /* use defaults */ }
        }

        // Create designs — apply feedback-driven param overrides if any
        for (const task of battery) {
          const paradigm = getParadigm(task.paradigmId);
          if (!paradigm) continue;
          paradigms.push(paradigm);
          const params = { ...paradigm.defaultParams };
          if (paramOverrides && params.type === 'behavioral') {
            if (paramOverrides.nTrials) (params as any).nTrials = paramOverrides.nTrials;
            if (paramOverrides.difficulty !== undefined) (params as any).difficulty = paramOverrides.difficulty;
            if (paramOverrides.nConditions) (params as any).nConditions = paramOverrides.nConditions;
          }
          allDesigns.push({
            id: `design-${task.paradigmId}-${Date.now()}`,
            name: paradigm.name,
            paradigmId: task.paradigmId,
            personaIds: session.personaIds,
            params,
            nParticipantsPerPersona: paramOverrides?.nParticipantsPerPersona ?? 20,
            hypotheses: [`Effect of condition on ${paradigm.dependentVariables[0]?.name || 'performance'}`],
            rationale: feedback ? `Adjusted based on feedback: ${feedback}` : `Standard ${paradigm.name} design`,
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

  // No session = shouldn't be here, go back to landing
  if (!session) {
    nav('/');
    return null;
  }

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
          {(session as any).simulationMode === 'llm'
            ? `LLM agents running ${battery.length || 1} task(s)...`
            : isBattery ? `simulating ${battery.length}-task battery...` : 'designing experiments...'}
        </motion.h2>

        {/* LLM progress bar */}
        {llmProgress.total > 0 && (
          <motion.div variants={staggerItem} className="mb-4">
            <div className="h-2 bg-orchid/10 rounded-full overflow-hidden mb-1">
              <motion.div className="h-full rounded-full bg-orchid"
                animate={{ width: `${(llmProgress.current / llmProgress.total) * 100}%` }}
                transition={{ duration: 0.3 }} />
            </div>
            <p className="text-[10px] text-text-3">{llmProgress.status} ({llmProgress.current}/{llmProgress.total} calls)</p>
          </motion.div>
        )}
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
