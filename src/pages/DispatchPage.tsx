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
import { runMazeLLMTrial, computeConstrualProbabilities, type PaperMaze } from '../lib/mazeSimulation';
import { runWCST, scoreWCST } from '../lib/tasks/wcst';
import { runTwoStep, scoreTwoStep } from '../lib/tasks/twoStep';
import { runTOL, scoreTOL } from '../lib/tasks/tol';
import { runNBack, scoreNBack } from '../lib/tasks/nback';
import { runCorsi, scoreCorsi } from '../lib/tasks/corsi';
import { runFIAR, scoreFIAR } from '../lib/tasks/fiar';
import { generatePool, type SimulatedPerson } from '../lib/participantPool';
import { buildTaskPrompt } from '../lib/personaPrompts';
import { getParadigm } from '../data/taskBank';
import { callClaudeApi } from '../lib/apiKey';
import paperMazesRaw from '../data/paperMazes.json';
// JSON imports infer number[] instead of [number, number] tuples
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

  // Check URL param for LLM mode
  const searchParams = new URLSearchParams(window.location.search);
  const isLLMFromUrl = searchParams.get('mode') === 'llm';
  const nFromUrl = parseInt(searchParams.get('n') || '20', 10);

  useEffect(() => {
    if (!session || ran.current) return;
    ran.current = true;

    const personas = session.personaIds.map(id => getPersona(id)).filter(Boolean) as typeof personaBank;
    const personaNames: Record<string, string> = {};
    personas.forEach(p => { personaNames[p.id] = p.name; });

    const battery = session.battery ?? [];
    const isBattery = battery.length > 0;
    const isLLM = isLLMFromUrl || (session as any).simulationMode === 'llm';

    (async () => { try {
      // === LLM SIMULATION MODE (works for both battery and single task) ===
      if (isLLM) {
        // For single task, wrap it as a 1-task battery
        const llmBattery = isBattery ? battery : [{
          paradigmId: session.paradigmId,
          design: null, dataset: null, metrics: null, status: 'pending' as const,
        }];
        const nParticipants = isLLM ? Math.min(nFromUrl, 10) : nFromUrl; // cap LLM at 10
        const paradigmIds = llmBattery.map(t => t.paradigmId);
        // Estimate total API calls per task type
        const totalCalls = llmBattery.reduce((sum, t) => {
          if (t.paradigmId === 'maze-construal') return sum + nParticipants * 6 * 2;
          if (t.paradigmId === 'wcst') return sum + nParticipants * 64;
          if (t.paradigmId === 'two-step') return sum + nParticipants * 80 * 2;
          if (t.paradigmId === 'tower-of-london') return sum + nParticipants * 25 * 6; // ~6 moves per puzzle avg
          if (t.paradigmId === 'n-back') return sum + nParticipants * 100; // 4 blocks × 25 letters
          if (t.paradigmId === 'corsi-block') return sum + nParticipants * 50; // ~14 spans × ~3 messages each
          if (t.paradigmId === 'four-in-a-row') return sum + nParticipants * 100; // 10 games × ~10 moves
          return sum + nParticipants * 3;
        }, 0);
        let callsDone = 0;

        setLlmProgress({ current: 0, total: totalCalls, status: 'generating participant pool...' });

        // Generate diverse pool
        const popType = session.personaIds[0] || 'college-student';
        const pool = generatePool(popType, nParticipants);

        const allDatasets: SimulatedDataset[] = [];
        const allDesigns: ExperimentDesign[] = [];
        const allMetrics: any[] = [];
        const paradigms: any[] = [];

        for (const task of llmBattery) {
          const paradigm = getParadigm(task.paradigmId);
          if (!paradigm) continue;
          paradigms.push(paradigm);

          if (isBattery) {
            dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'simulating' } } });
          }

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
          const isMaze = task.paradigmId === 'maze-construal';
          const paperMazes = isMaze ? (paperMazesRaw as unknown as PaperMaze[]) : [];
          const mazeConstrualData = isMaze
            ? paperMazes.map(m => ({ maze: m, obstacles: computeConstrualProbabilities(m) }))
            : [];
          const trialsPerParticipant = isMaze ? Math.min(6, paperMazes.length) : 3;

          for (let pi = 0; pi < nParticipants; pi++) {
            const person = pool[pi];
            setLlmProgress({ current: callsDone, total: totalCalls, status: `${paradigm.name}: participant ${pi + 1}/${nParticipants} (${person.demographics.gender}, ${person.demographics.age})` });

            const trials: SimulatedTrial[] = [];

            const isWCST = task.paradigmId === 'wcst';
            const isTwoStep = task.paradigmId === 'two-step';

            if (isMaze) {
              // === MAZE-CONSTRUAL: Two-phase trials (navigate + awareness probe) ===
              for (let ti = 0; ti < trialsPerParticipant; ti++) {
                if (ti > 0 || pi > 0) await new Promise(r => setTimeout(r, 200));
                const mazeIdx = (pi * 7 + ti) % mazeConstrualData.length;
                const { maze, obstacles } = mazeConstrualData[mazeIdx];
                const trial = await runMazeLLMTrial(person.llmPrompt, maze, obstacles, ti);
                trials.push(trial);
                callsDone += 2; // navigation + probe = 2 API calls
                setLlmProgress({ current: callsDone, total: totalCalls, status: `${paradigm.name}: P${pi + 1}, maze ${ti + 1}/${trialsPerParticipant}` });
              }
            } else if (isWCST) {
              // === WCST: 64 multi-turn trials with feedback + rule switches ===
              const wcstResult = await runWCST(person.llmPrompt, 64, pi * 100, (t, total) => {
                callsDone++;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `WCST: P${pi + 1}, trial ${t + 1}/${total}` });
              });
              const wcstScore = scoreWCST(wcstResult);
              // Convert to SimulatedTrial format
              for (const td of wcstResult.trialDetails) {
                trials.push({
                  trialIndex: td.trial,
                  condition: td.rule,
                  rt: wcstResult.outcomes[td.trial]?.latencyMs ?? 1000,
                  response: td.participantChoice,
                  correct: td.correct,
                  metadata: { perseverative: td.perseverative, rule: td.rule, ...wcstScore },
                });
              }
            } else if (isTwoStep) {
              // === TWO-STEP: 80 multi-turn trials with drifting rewards ===
              const tsResult = await runTwoStep(person.llmPrompt, 80, pi * 100, (t, total) => {
                callsDone += 2;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `Two-Step: P${pi + 1}, trial ${t + 1}/${total}` });
              });
              const tsScore = scoreTwoStep(tsResult);
              for (const td of tsResult.trialDetails) {
                trials.push({
                  trialIndex: td.trial, condition: td.transition,
                  rt: tsResult.outcomes[td.trial * 2]?.latencyMs ?? 1000,
                  response: td.stage1Choice === 'A' ? 0 : 1, correct: td.rewarded,
                  metadata: { transition: td.transition, planet: td.planet, rewarded: td.rewarded, ...tsScore },
                });
              }
            } else if (task.paradigmId === 'tower-of-london') {
              // === TOL: 25 multi-turn puzzles with move validation ===
              const tolResult = await runTOL(person.llmPrompt, 25, pi * 100, (p, total) => {
                callsDone++;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `TOL: P${pi + 1}, puzzle ${p + 1}/${total}` });
              });
              const tolScore = scoreTOL(tolResult);
              for (const pd of tolResult.puzzleDetails) {
                trials.push({
                  trialIndex: pd.puzzleId, condition: `${pd.minMoves}-move`,
                  rt: tolResult.outcomes[pd.puzzleId]?.latencyMs ?? 5000,
                  response: pd.actualMoves, correct: pd.optimal,
                  metadata: { minMoves: pd.minMoves, solved: pd.solved, optimal: pd.optimal, ...tolScore },
                });
              }
            } else if (task.paradigmId === 'n-back') {
              // === N-BACK: Sequential, one letter at a time ===
              const nbResult = await runNBack(person.llmPrompt, undefined, pi * 100, (t, total) => {
                callsDone++;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `N-back: P${pi + 1}, trial ${t}/${total}` });
              });
              const nbScore = scoreNBack(nbResult);
              for (let bi = 0; bi < nbResult.blocks.length; bi++) {
                const b = nbResult.blocks[bi];
                trials.push({
                  trialIndex: bi, condition: `${b.nBack}-back`,
                  rt: 0, response: b.dPrime, correct: b.accuracy > 0.6,
                  metadata: { nBack: b.nBack, blockHitRate: b.hitRate, blockFalseAlarmRate: b.falseAlarmRate, blockDPrime: b.dPrime, overallDPrime: nbScore.dPrime, overallHitRate: nbScore.hitRate },
                });
              }
            } else if (task.paradigmId === 'corsi-block') {
              // === CORSI: Sequential spatial, adaptive staircase ===
              const corsiResult = await runCorsi(person.llmPrompt, 3, 9, 2, pi * 100, (t, total) => {
                callsDone++;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `Corsi: P${pi + 1}, trial ${t}/${total}` });
              });
              const corsiScore = scoreCorsi(corsiResult);
              for (const td of corsiResult.trialDetails) {
                trials.push({
                  trialIndex: td.trialAtSpan, condition: `span-${td.span}`,
                  rt: 0, response: td.correct ? 1 : 0, correct: td.correct,
                  metadata: { span: td.span, sequence: td.sequence, recalled: td.recalled, ...corsiScore },
                });
              }
            } else if (task.paradigmId === 'four-in-a-row') {
              // === FIAR: Full games against AI ===
              const fiarResult = await runFIAR(person.llmPrompt, 10, pi * 100, (g, total) => {
                callsDone += 10; // ~10 moves per game
                setLlmProgress({ current: callsDone, total: totalCalls, status: `FIAR: P${pi + 1}, game ${g + 1}/${total}` });
              });
              const fiarScore = scoreFIAR(fiarResult);
              for (const gd of fiarResult.gameDetails) {
                trials.push({
                  trialIndex: gd.gameId, condition: `skill-${gd.opponentSkill.toFixed(1)}`,
                  rt: 0, response: gd.result === 'win' ? 1 : gd.result === 'draw' ? 0.5 : 0,
                  correct: gd.result === 'win',
                  metadata: { result: gd.result, opponentSkill: gd.opponentSkill, ...fiarScore },
                });
              }
            } else {
              // === GENERIC TASK: standard trial format ===
              for (let ti = 0; ti < trialsPerParticipant; ti++) {
                if (ti > 0 || pi > 0) await new Promise(r => setTimeout(r, 200));
                const result = await runLLMTrial({
                  taskDescription: taskPrompt,
                  stimulus: `Trial ${ti + 1}: ${paradigm.description}. Respond as if you are actually doing this task.`,
                  personaPrompt: person.llmPrompt,
                  responseFormat: '{ "response": number (0 or 1 for accuracy, 1-5 for survey), "confidence": number (0-1), "reaction_time_estimate": "fast/medium/slow" }',
                });

                const rtEstimate = result.response?.reaction_time_estimate === 'fast' ? 500 : result.response?.reaction_time_estimate === 'slow' ? 2000 : 1000;
                const resp = typeof result.response?.response === 'number' ? result.response.response : Math.round(Math.random());
                trials.push({
                  trialIndex: ti,
                  condition: paradigm.defaultParams.type === 'behavioral' ? (paradigm.defaultParams as any).conditionLabels?.[ti % 2] || 'default' : 'survey',
                  rt: rtEstimate + result.latencyMs * 0.1,
                  response: resp,
                  correct: resp === 1 ? true : resp === 0 ? false : null,
                  metadata: {
                    cot: result.rawText,
                    confidence: result.response?.confidence,
                  },
                });
                callsDone++;
                setLlmProgress({ current: callsDone, total: totalCalls, status: `${paradigm.name}: P${pi + 1}, trial ${ti + 1}/${trialsPerParticipant}` });
              }
            }

            participants.push({
              id: person.id, personaId: popType,
              condition: null, trials, seed: 0,
            });
          }

          const dataset: SimulatedDataset = { designId: design.id, participants, masterSeed: 0, generatedAt: Date.now() };
          allDatasets.push(dataset);

          const metrics = computePilotMetrics(design, dataset, personaNames);
          allMetrics.push(metrics);
          if (isBattery) {
            dispatch({ type: 'UPDATE_BATTERY_TASK', payload: { paradigmId: task.paradigmId, update: { status: 'done', design, dataset, metrics } } });
          } else {
            dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role: 'scout', report: { status: 'done', design, dataset, metrics } } });
          }
        }

        // Run analysis (pass paradigmIds so task-specific steps auto-include)
        const plan = allDatasets.length > 1 ? defaultBatteryPlan(allDatasets.length, paradigmIds) : defaultSingleTaskPlan(paradigmIds[0]);
        const analysisResults = runAnalysisPipeline(plan, { datasets: allDatasets, designs: allDesigns, paradigms, personas });
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: analysisResults });

        const synthesis = await synthesizePilotResults(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_SYNTHESIS', payload: { synthesis, agreements: [], disagreements: [], openQuestions: [], nextMissions: [] } });

        const review = await generatePeerReview(session.brief, allDesigns, allMetrics);
        dispatch({ type: 'SET_PEER_REVIEW', payload: review });

        dispatch({ type: 'SET_STEP', payload: 'report' });
        nav('/report');
        return;
      }

      if (isBattery) {
        // === PARAMETRIC BATTERY MODE ===
        // Same simulated participants take all tasks (realistic cross-task correlations)
        const allDesigns: ExperimentDesign[] = [];
        const paradigms: any[] = [];

        // Extract the LATEST iteration feedback (last match, not first)
        const allFeedback = [...session.brief.matchAll(/\[round \d+ feedback: (.+?)\]/g)];
        const feedback = allFeedback.length > 0 ? allFeedback[allFeedback.length - 1][1] : '';

        // If there's feedback, ask Claude to adjust params; otherwise use defaults
        let paramOverrides: Record<string, any> | null = null;
        if (feedback) {
          try {
            const res = await callClaudeApi({
                model: 'claude-sonnet-4-6-20250514',
                max_tokens: 400,
                system: `You adjust experiment parameters based on researcher feedback.
Current default params for behavioral tasks: difficulty 0.5, nTrials 30, nConditions 2-3, nParticipantsPerPersona 20.
Return ONLY JSON with fields to override: { "nTrials": 60, "difficulty": 0.7, "nParticipantsPerPersona": 30 }
Only include fields that the feedback asks to change. Return {} if no param changes needed.`,
                messages: [{ role: 'user', content: `Feedback: "${feedback}"` }],
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
            nParticipantsPerPersona: paramOverrides?.nParticipantsPerPersona ?? nFromUrl,
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
        const batteryParadigmIds = battery.map(t => t.paradigmId);
        const plan = defaultBatteryPlan(allDatasets.length, batteryParadigmIds);
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

        // Extract the LATEST iteration feedback (last match, not first)
        const allFeedback = [...session.brief.matchAll(/\[round \d+ feedback: (.+?)\]/g)];
        const feedback = allFeedback.length > 0 ? allFeedback[allFeedback.length - 1][1] : '';

        // Parse param overrides from feedback via Claude
        let paramOverrides: Record<string, any> | null = null;
        if (feedback) {
          try {
            const res = await callClaudeApi({
                model: 'claude-sonnet-4-6-20250514',
                max_tokens: 400,
                system: `You adjust experiment parameters based on researcher feedback.
Current defaults: difficulty 0.5, nTrials 30, nConditions 2, nParticipantsPerPersona 20.
Return ONLY JSON with fields to override. Examples:
- "increase sample size to 100" → { "nParticipantsPerPersona": 100 }
- "make it harder, 60 trials" → { "difficulty": 0.75, "nTrials": 60 }
- "add a third condition" → { "nConditions": 3 }
Only include fields the feedback asks to change. Return {} if no param changes needed.`,
                messages: [{ role: 'user', content: `Feedback: "${feedback}"` }],
            });
            const data = await res.json();
            const raw = data.content?.[0]?.text ?? '';
            const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const first = cleaned.indexOf('{');
            const last = cleaned.lastIndexOf('}');
            if (first >= 0 && last > first) {
              paramOverrides = JSON.parse(cleaned.slice(first, last + 1));
            }
          } catch { /* use design agent's proposal */ }
        }

        const roles: InternRole[] = ['scout', 'analyst', 'reviewer'];
        const results = await Promise.all(roles.map(async (role) => {
          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'proposing' } } });
          const design = await proposeDesign(role, session.brief, paradigm, personas);

          // Apply explicit param overrides on top of what the design agent proposed
          if (paramOverrides) {
            if (paramOverrides.nParticipantsPerPersona) design.nParticipantsPerPersona = paramOverrides.nParticipantsPerPersona;
            if (design.params.type === 'behavioral') {
              if (paramOverrides.nTrials) (design.params as any).nTrials = paramOverrides.nTrials;
              if (paramOverrides.difficulty !== undefined) (design.params as any).difficulty = paramOverrides.difficulty;
              if (paramOverrides.nConditions) (design.params as any).nConditions = paramOverrides.nConditions;
            }
          }

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'simulating', design } } });
          const dataset = simulatePilot(design, personas);

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'computing', dataset } } });
          const metrics = computePilotMetrics(design, dataset, personaNames);

          dispatch({ type: 'UPDATE_DESIGN_REPORT', payload: { role, report: { status: 'done', metrics } } });
          return { design, dataset, metrics };
        }));

        // Analysis on best design
        const bestIdx = results.reduce((bi, r, i) => r.metrics.overallScore > results[bi].metrics.overallScore ? i : bi, 0);
        const singleResults = runAnalysisPipeline(defaultSingleTaskPlan(session.paradigmId), {
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
    } catch (err) {
      console.error('Dispatch error:', err);
      // Still navigate to report even on partial failure
      dispatch({ type: 'SET_STEP', payload: 'report' });
      nav('/report');
    } })();
  }, [session, dispatch, nav]);

  if (!session) return <div className="min-h-screen flex items-center justify-center text-text-3">loading...</div>;

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
