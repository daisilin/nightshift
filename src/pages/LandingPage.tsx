import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { taskBank } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import { PaperUpload, type ExtractedDesign } from '../components/PaperUpload';
import { ExtractionReview } from '../components/ExtractionReview';
import { TaskPreview } from '../components/preview/TaskPreview';
import { ApiKeyModal } from '../components/ApiKeyModal';
import { stagger, staggerItem } from '../lib/animations';
import { callClaudeApi, getStoredApiKey } from '../lib/apiKey';
import { buildDesignAgentSystemPrompt } from '../lib/designAgentPrompt';
import { PlanConfirmation, type AgentPlan } from '../components/PlanConfirmation';
import { TWEAK_LIBRARY, getRelevantTweaks, getBaselineTweakIds, type MechanismTweak } from '../lib/mechanismTweaks';
import { ProbeCard, type AgentProbe } from '../components/ProbeCard';
import { validatePlan, validateProbe, extractJson } from '../lib/agentSchema';
import type { ExperimentDesign } from '../lib/types';

type Mode = 'start' | 'design' | 'configure' | 'explore';

export function LandingPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();

  // No useEffect on mount — was causing race condition that reset step to 'landing'
  // right after START_BATTERY set it to 'dispatch', blocking the dispatch page.

  const [mode, setMode] = useState<Mode>('start');
  const [brief, setBrief] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState(['college-student', 'mturk-worker', 'older-adult']);
  const [designChat, setDesignChat] = useState<{ role: 'user' | 'assistant'; content: string; plan?: AgentPlan; probe?: AgentProbe }[]>([]);
  const [pendingProbe, setPendingProbe] = useState<AgentProbe | null>(null);
  const [probesAnswered, setProbesAnswered] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<ExtractedDesign | null>(null);
  const noJsonStreak = useRef(0);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [exploringTask, setExploringTask] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [simMode, setSimMode] = useState<'parametric' | 'llm'>('parametric');
  const [nParticipants, setNParticipants] = useState(20);
  const [modelPool, setModelPool] = useState<'sonnet' | 'diverse' | 'capability-spread'>('sonnet');
  const [calibrationEnabled, setCalibrationEnabled] = useState(true);
  const [paperContext, setPaperContext] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(null);
  const [selectedTweaks, setSelectedTweaks] = useState<string[]>(getBaselineTweakIds());
  const [customTweak, setCustomTweak] = useState('');

  // Auto-scroll chat on new messages
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [designChat, pendingPlan, pendingProbe]);

  const submitProbeAnswers = (answers: Record<string, string>) => {
    if (!pendingProbe) return;
    const lines = pendingProbe.probes.map(p => {
      const a = answers[p.id] || '(skipped)';
      return `- ${p.question}\n  → ${a}`;
    }).join('\n');
    setPendingProbe(null);
    setProbesAnswered(true);
    sendToDesignAgent(`Here are my answers:\n${lines}\n\nNow propose a concrete plan.`);
  };

  const toggleTask = (id: string) => {
    setSelectedTasks(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
    // Task set changed — invalidate prior probes so the agent re-evaluates caveats
    if (probesAnswered) {
      setProbesAnswered(false);
      setPendingProbe(null);
      noJsonStreak.current = 0;
    }
  };
  const togglePersona = (id: string) => setSelectedPersonas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const dispatchExperiment = () => {
    const b = brief.trim();
    if (!b || selectedTasks.length === 0 || selectedPersonas.length === 0) return;
    if (selectedTasks.length === 1) {
      dispatch({ type: 'START_EXPERIMENT', payload: { brief: b, paradigmId: selectedTasks[0], personaIds: selectedPersonas, nParticipants } });
    } else {
      dispatch({ type: 'START_BATTERY', payload: { brief: b, paradigmIds: selectedTasks, personaIds: selectedPersonas, nParticipants } });
    }
    // Set paper context on the newly created session
    if (paperContext) {
      dispatch({ type: 'SET_PAPER_CONTEXT', payload: paperContext });
    }
    const params = new URLSearchParams();
    if (simMode === 'llm') params.set('mode', 'llm');
    params.set('n', String(nParticipants));
    if (simMode === 'llm') {
      params.set('pool', modelPool);
      params.set('calibrated', calibrationEnabled ? '1' : '0');
      if (selectedTweaks.length > 0) params.set('tweaks', selectedTweaks.join(','));
      if (customTweak.trim()) params.set('customTweak', customTweak.trim());
    }
    nav(`/dispatch?${params.toString()}`);
  };

  const sendToDesignAgent = async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setDesignChat(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      const res = await callClaudeApi({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1200,
          system: buildDesignAgentSystemPrompt(selectedTasks, selectedPersonas, brief, paperContext, probesAnswered),
          messages: [
            ...designChat.slice(-8).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg },
          ],
      });

      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const parsed = extractJson(raw);
      let plan: AgentPlan | null = null;
      let probe: AgentProbe | null = null;

      if (parsed) {
        noJsonStreak.current = 0;
        probe = validateProbe(parsed);
        if (probe) {
          setPendingProbe(probe);
        } else {
          plan = validatePlan(parsed);
          if (plan) setPendingPlan(plan);
        }
      } else {
        // Model returned prose only. If this is the 2nd consecutive miss,
        // unlock plan mode so the user doesn't get stuck in a probe loop.
        noJsonStreak.current += 1;
        if (noJsonStreak.current >= 2 && !probesAnswered) {
          setProbesAnswered(true);
        }
      }

      const chatText = raw.replace(/```json[\s\S]*?```/g, '').trim();
      setDesignChat(prev => [...prev, {
        role: 'assistant',
        content: chatText || '(agent returned empty response — try rephrasing)',
        ...(plan ? { plan } : {}),
        ...(probe ? { probe } : {}),
      }]);
    } catch {
      setDesignChat(prev => [...prev, { role: 'assistant', content: 'Could not reach the design agent.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <AnimatePresence>
        {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto px-6 pt-12 pb-16">
        <motion.div variants={stagger} initial="initial" animate="animate">

          <motion.div variants={staggerItem} className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-mono font-light text-text-3">nightshift</span>
                <h1 className="text-2xl sm:text-3xl font-heading leading-[1.1] mt-1">
                  <span className="bg-gradient-to-r from-orchid via-rose to-peach bg-clip-text text-transparent">experiment design studio</span>
                </h1>
              </div>
              <button
                onClick={() => setShowKeyModal(true)}
                title="API key settings"
                className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-text-3 border border-orchid/15 hover:bg-orchid/5 cursor-pointer transition-colors"
              >
                <span>{getStoredApiKey() ? '🔑' : '⚙'}</span>
                <span>{getStoredApiKey() ? 'key set' : 'api key'}</span>
              </button>
            </div>
          </motion.div>

          {/* ===== START: paper drop + research question (ONE input) ===== */}
          {mode === 'start' && (
            <motion.div variants={staggerItem} className="space-y-4">
              <PaperUpload onExtracted={(extracted) => {
                setPendingExtraction(extracted);
              }} />

              {pendingExtraction && (
                <ExtractionReview
                  extracted={pendingExtraction}
                  onCancel={() => setPendingExtraction(null)}
                  onConfirm={(confirmed) => {
                    const valid = confirmed.paradigmIds.filter((id: string) => taskBank.find(t => t.id === id));
                    if (valid.length > 0) setSelectedTasks(valid);
                    if (confirmed.personaIds.length > 0) setSelectedPersonas(confirmed.personaIds);
                    setBrief(confirmed.brief || '');
                    setProbesAnswered(false);
                    setPendingProbe(null);
                    setPendingPlan(null);
                    // Cap rawText at 6000 chars to stay under localStorage budget.
                    // Methods section fits easily; analysis agent gets title/brief/details
                    // as structured summary anyway.
                    const rawExcerpt = confirmed.rawText ? confirmed.rawText.slice(0, 6000) : '';
                    const fullContext = [
                      `Paper: "${confirmed.paperTitle}"`,
                      `Brief: ${confirmed.brief}`,
                      `Key details: ${confirmed.keyDetails}`,
                      `Tasks detected: ${valid.join(', ')}`,
                      rawExcerpt ? `\nPaper excerpt:\n${rawExcerpt}` : '',
                    ].filter(Boolean).join('\n');
                    setPaperContext(fullContext);
                    setDesignChat([{
                      role: 'assistant',
                      content: `confirmed "${confirmed.paperTitle}" — ${valid.length} task(s): ${valid.join(', ')}. ${confirmed.keyDetails || ''}\n\nlet me think about what's worth deciding before we run this.`,
                    }]);
                    setMode('design');
                    setPendingExtraction(null);
                    setTimeout(() => {
                      sendToDesignAgent(`I just confirmed this paper's design. What are the 2-4 most important decisions I need to make before dispatching a simulation of ${valid.join(', ')}?`);
                    }, 300);
                  }}
                />
              )}

              <div className="card p-3">
                <textarea value={brief} onChange={e => setBrief(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setMode('design'); if (brief.trim()) sendToDesignAgent(brief); }}}
                  placeholder="or describe what you want to study..."
                  rows={2} className="w-full bg-transparent px-2 py-1 text-[15px] text-text placeholder-text-4 resize-none focus:outline-none" autoFocus />
                <div className="flex justify-end pt-1 px-2">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={!brief.trim()}
                    onClick={() => { setMode('design'); if (brief.trim()) sendToDesignAgent(brief); }}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
                    style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
                    design →
                  </motion.button>
                </div>
              </div>

              <div className="text-[10px] text-text-4 text-center">or explore tasks — click to try:</div>
              <div className="grid grid-cols-5 gap-1.5">
                {taskBank.slice(0, 10).map(t => (
                  <button key={t.id} onClick={() => setExploringTask(exploringTask === t.id ? null : t.id)}
                    className={`card p-2 text-center cursor-pointer transition-all ${exploringTask === t.id ? 'ring-1 ring-orchid/40 bg-orchid/5' : 'hover:border-orchid/20'}`}>
                    <span className="text-lg">{t.emoji}</span>
                    <div className="text-[8px] text-text-3 mt-0.5 leading-tight">{t.name}</div>
                  </button>
                ))}
              </div>

              {/* Inline task preview */}
              {exploringTask && (() => {
                const t = taskBank.find(tb => tb.id === exploringTask);
                if (!t) return null;
                const dummyDesign: ExperimentDesign = {
                  id: `explore-${t.id}`, name: t.name, paradigmId: t.id,
                  personaIds: [], params: t.defaultParams,
                  nParticipantsPerPersona: 20, hypotheses: [], rationale: '', internRole: 'scout',
                };
                return (
                  <div className="mt-3">
                    <TaskPreview design={dummyDesign} onClose={() => setExploringTask(null)} />
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { toggleTask(t.id); setExploringTask(null); setMode('design'); setBrief(brief || `${t.name} experiment`); }}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
                        add to experiment
                      </button>
                      <button onClick={() => setExploringTask(null)}
                        className="text-[11px] text-text-3 cursor-pointer hover:text-text">
                        explore others ←
                      </button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* ===== DESIGN: Task Design Agent chat ===== */}
          {(mode === 'design' || mode === 'configure') && (
            <motion.div variants={staggerItem} className="space-y-3">

              {/* Selected tasks + personas */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-text-3 uppercase">experiment</span>
                  <button onClick={() => setMode(mode === 'configure' ? 'design' : 'configure')}
                    className="text-[10px] text-orchid cursor-pointer hover:underline">
                    {mode === 'configure' ? '← chat' : 'edit tasks'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedTasks.map(id => {
                    const t = taskBank.find(tb => tb.id === id);
                    return t ? <span key={id} onClick={() => toggleTask(id)}
                      className="px-2 py-0.5 rounded text-[10px] bg-orchid/10 text-text border border-orchid/15 cursor-pointer hover:line-through">{t.emoji} {t.name}</span> : null;
                  })}
                  {selectedTasks.length === 0 && <span className="text-[10px] text-text-4 italic">none</span>}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedPersonas.map(id => {
                    const p = personaBank.find(pb => pb.id === id);
                    return p ? <span key={id} className="px-1.5 py-0.5 rounded text-[9px] bg-surface-2/50 text-text-3">{p.emoji} {p.name}</span> : null;
                  })}
                </div>
              </div>

              {/* Task/persona picker OR design chat */}
              {mode === 'configure' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {taskBank.map(t => (
                      <button key={t.id} onClick={() => toggleTask(t.id)}
                        className={`card p-2 text-left cursor-pointer ${selectedTasks.includes(t.id) ? 'ring-1 ring-orchid/40 bg-orchid/5' : ''}`}>
                        <span>{t.emoji}</span> <span className="text-[10px] text-text">{t.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {personaBank.map(p => (
                      <button key={p.id} onClick={() => togglePersona(p.id)}
                        className={`px-2 py-1 rounded text-[10px] cursor-pointer border ${selectedPersonas.includes(p.id) ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                        {p.emoji} {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card p-3">
                  <div ref={chatScrollRef} className="max-h-[400px] overflow-y-auto space-y-3 mb-2">
                    {designChat.length === 0 && <p className="text-xs text-text-4 italic">ask me about task design, variants, parameters, or populations...</p>}
                    {designChat.map((msg, i) => (
                      <div key={i}>
                        <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-orchid' : 'text-text-2'}`}>
                          {msg.role === 'user' ? '→ ' : ''}{msg.content}
                        </div>
                        {/* Show probe card after agent message with probes (probe phase) */}
                        {msg.probe && pendingProbe && i === designChat.length - 1 && (
                          <div className="mt-2">
                            <ProbeCard
                              probe={pendingProbe}
                              onAnswer={submitProbeAnswers}
                              onSkip={() => {
                                setPendingProbe(null);
                                setProbesAnswered(true);
                                sendToDesignAgent('Skip the probes — just propose a plan with reasonable defaults.');
                              }}
                            />
                          </div>
                        )}
                        {/* Show plan confirmation card after agent message with plan */}
                        {msg.plan && pendingPlan && i === designChat.length - 1 && (
                          <div className="mt-2">
                            <PlanConfirmation
                              plan={pendingPlan}
                              currentTasks={selectedTasks}
                              currentPersonas={selectedPersonas}
                              currentBrief={brief}
                              onApprove={(approvedPlan) => {
                                // Apply the plan to local state
                                const nextBrief = approvedPlan.brief || brief;
                                let nextTasks = [...selectedTasks];
                                if (approvedPlan.addTasks) nextTasks = [...new Set([...nextTasks, ...approvedPlan.addTasks.filter(id => taskBank.find(t => t.id === id))])];
                                if (approvedPlan.removeTasks) nextTasks = nextTasks.filter(id => !approvedPlan.removeTasks!.includes(id));
                                let nextPersonas = [...selectedPersonas];
                                if (approvedPlan.addPersonas) nextPersonas = [...new Set([...nextPersonas, ...approvedPlan.addPersonas.filter(id => personaBank.find(p => p.id === id))])];
                                if (approvedPlan.removePersonas) nextPersonas = nextPersonas.filter(id => !approvedPlan.removePersonas!.includes(id));
                                const nextN = approvedPlan.nParticipants || nParticipants;
                                if (approvedPlan.modelPool) setModelPool(approvedPlan.modelPool);
                                setPendingPlan(null);

                                // Actually dispatch — don't just update state and leave the user stranded
                                if (!nextBrief.trim() || nextTasks.length === 0 || nextPersonas.length === 0) return;
                                if (nextTasks.length === 1) {
                                  dispatch({ type: 'START_EXPERIMENT', payload: { brief: nextBrief, paradigmId: nextTasks[0], personaIds: nextPersonas, nParticipants: nextN } });
                                } else {
                                  dispatch({ type: 'START_BATTERY', payload: { brief: nextBrief, paradigmIds: nextTasks, personaIds: nextPersonas, nParticipants: nextN } });
                                }
                                if (paperContext) dispatch({ type: 'SET_PAPER_CONTEXT', payload: paperContext });
                                const params = new URLSearchParams();
                                if (simMode === 'llm') params.set('mode', 'llm');
                                params.set('n', String(nextN));
                                if (simMode === 'llm') {
                                  params.set('pool', approvedPlan.modelPool || modelPool);
                                  params.set('calibrated', calibrationEnabled ? '1' : '0');
                                  if (selectedTweaks.length > 0) params.set('tweaks', selectedTweaks.join(','));
                                  if (customTweak.trim()) params.set('customTweak', customTweak.trim());
                                }
                                nav(`/dispatch?${params.toString()}`);
                              }}
                              onEdit={() => {
                                // Apply changes to state so user can manually tweak
                                const p = pendingPlan;
                                if (p.brief) setBrief(p.brief);
                                if (p.addTasks) setSelectedTasks(prev => [...new Set([...prev, ...p.addTasks!.filter(id => taskBank.find(t => t.id === id))])]);
                                if (p.removeTasks) setSelectedTasks(prev => prev.filter(id => !p.removeTasks!.includes(id)));
                                setPendingPlan(null);
                                // Editing means tasks may change — re-probe for new caveats
                                setProbesAnswered(false);
                                setPendingProbe(null);
                                noJsonStreak.current = 0;
                                setMode('configure');
                              }}
                              onReject={() => {
                                setPendingPlan(null);
                                sendToDesignAgent('I\'d like to revise this plan. What changes would you suggest?');
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex items-center gap-2 text-xs text-text-3">
                        <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="inline-block w-3 h-3 border border-orchid/30 border-t-orchid rounded-full" />
                        thinking...
                      </div>
                    )}
                  </div>
                  {/* Quick-action suggestion chips */}
                  {designChat.length > 0 && !chatLoading && !pendingPlan && !pendingProbe && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        selectedTasks.length === 0 ? 'what tasks should I use?' : null,
                        'what are the known limitations?',
                        'propose a plan',
                        selectedTasks.length > 0 ? 'add a control condition' : null,
                        'what sample size do you recommend?',
                      ].filter(Boolean).slice(0, 3).map(q => (
                        <button key={q} onClick={() => sendToDesignAgent(q!)}
                          className="px-2 py-1 rounded-lg text-[9px] text-text-3 border border-orchid/10 cursor-pointer hover:bg-orchid/5 hover:text-text-2 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendToDesignAgent(); }}
                      placeholder="adjust design, ask about variants..."
                      className="flex-1 px-3 py-2 rounded-xl text-sm border border-orchid/15 bg-white text-text focus:outline-none" disabled={chatLoading} />
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => sendToDesignAgent()} disabled={!chatInput.trim() || chatLoading}
                      className="px-3 py-2 rounded-xl text-xs text-text-2 border border-orchid/15 cursor-pointer disabled:opacity-30 hover:bg-orchid/5">
                      send
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Simulation settings */}
              <div className="card p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-3">simulation:</span>
                  <button onClick={() => setSimMode('parametric')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] cursor-pointer border ${simMode === 'parametric' ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                    parametric (instant)
                  </button>
                  <button onClick={() => setSimMode('llm')}
                    className={`px-2.5 py-1 rounded-lg text-[10px] cursor-pointer border ${simMode === 'llm' ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                    LLM agents (slower, richer)
                  </button>
                </div>
                {simMode === 'llm' && (<>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-3">model pool:</span>
                  {([['sonnet', 'Sonnet (standard)'], ['diverse', 'Multi-model diverse'], ['capability-spread', 'Capability spread']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setModelPool(key)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] cursor-pointer border ${modelPool === key ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-3">calibration:</span>
                  <button onClick={() => setCalibrationEnabled(!calibrationEnabled)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] cursor-pointer border ${calibrationEnabled ? 'bg-sage/15 border-sage/30 text-text' : 'border-orchid/8 text-text-3'}`}>
                    {calibrationEnabled ? 'cognitive calibration ON' : 'calibration OFF'}
                  </button>
                  <span className="text-[9px] text-text-4">
                    {calibrationEnabled ? 'ctx+temp mapped from persona traits (research-validated)' : 'all participants use same defaults'}
                  </span>
                </div>
                </>)}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-3">participants:</span>
                  {(simMode === 'llm' ? [3, 5, 10, 20, 30] : [20, 50, 100, 500]).map(n => (
                    <button key={n} onClick={() => setNParticipants(n)}
                      className={`px-2 py-0.5 rounded text-[10px] cursor-pointer border ${nParticipants === n ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8 text-text-3'}`}>
                      {n}
                    </button>
                  ))}
                  <span className="text-[10px] text-text-4">
                    {simMode === 'llm' ? `~${Math.round(nParticipants * selectedTasks.length * 2)}min` : 'instant'}
                  </span>
                </div>
              </div>

              {/* Mechanism Tweaks */}
              {simMode === 'llm' && (
              <div className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-text-3 uppercase">mechanism tweaks</span>
                  <span className="text-[9px] text-text-4">hypothesis-driven processing changes</span>
                </div>

                {/* General tweaks (humanized baseline) */}
                <div>
                  <span className="text-[9px] text-text-4">baseline (always-on cognitive constraints):</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {TWEAK_LIBRARY.filter(t => t.category === 'general').map(t => (
                      <button key={t.id}
                        onClick={() => setSelectedTweaks(prev =>
                          prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                        )}
                        title={`${t.description} (${t.citation})`}
                        className={`px-2 py-0.5 rounded text-[9px] cursor-pointer border transition-colors ${
                          selectedTweaks.includes(t.id)
                            ? 'bg-sage/15 border-sage/30 text-text'
                            : 'border-orchid/8 text-text-4 hover:text-text-3'
                        }`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hypothesis tweaks (task-specific) */}
                {selectedTasks.length > 0 && (() => {
                  const relevant = TWEAK_LIBRARY.filter(t =>
                    t.category === 'hypothesis' &&
                    selectedTasks.some(taskId => !t.relevantTasks || t.relevantTasks.includes(taskId))
                  );
                  if (relevant.length === 0) return null;
                  return (
                    <div>
                      <span className="text-[9px] text-text-4">hypothesis (test a specific mechanism):</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {relevant.map(t => (
                          <button key={t.id}
                            onClick={() => setSelectedTweaks(prev =>
                              prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                            )}
                            title={`${t.description} (${t.citation})`}
                            className={`px-2 py-0.5 rounded text-[9px] cursor-pointer border transition-colors ${
                              selectedTweaks.includes(t.id)
                                ? 'bg-orchid/15 border-orchid/30 text-text'
                                : 'border-orchid/8 text-text-4 hover:text-text-3'
                            }`}>
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Custom mechanism */}
                <div>
                  <span className="text-[9px] text-text-4">custom mechanism (describe your hypothesis):</span>
                  <textarea
                    value={customTweak}
                    onChange={e => setCustomTweak(e.target.value)}
                    placeholder="e.g. 'Participants selectively attend to features near their planned path and ignore distant ones.'"
                    rows={2}
                    className="w-full mt-1 px-2 py-1 rounded-lg text-[10px] border border-orchid/15 bg-white text-text placeholder-text-4 resize-none focus:outline-none focus:border-orchid/30"
                  />
                </div>

                {selectedTweaks.length > 0 && (
                  <div className="text-[9px] text-text-4 italic">
                    active: {selectedTweaks.map(id => TWEAK_LIBRARY.find(t => t.id === id)?.name || id).join(', ')}
                    {customTweak.trim() ? ' + custom mechanism' : ''}
                  </div>
                )}
              </div>
              )}

              {/* Dispatch */}
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={dispatchExperiment}
                disabled={selectedTasks.length === 0 || selectedPersonas.length === 0}
                className="w-full py-3 rounded-[14px] text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
                dispatch {selectedTasks.length} task(s) × {selectedPersonas.length} pop. × {simMode === 'llm' ? Math.min(nParticipants, 10) : nParticipants}n 🌙
              </motion.button>
            </motion.div>
          )}

          {/* Past sessions */}
          {state.sessions.length > 0 && (
            <motion.div variants={staggerItem} className="mt-6 pt-4 border-t border-orchid/10">
              <span className="text-[10px] font-mono text-text-3">past research</span>
              {state.sessions.slice(-3).reverse().map(s => (
                <div key={s.id} className="card p-2.5 mt-1">
                  <p className="text-xs text-text">{s.brief.slice(0, 60)}{s.brief.length > 60 ? '...' : ''}</p>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
      <footer className="text-center pb-4 text-[10px] text-text-4">by <a href="https://daisilin.github.io" className="underline hover:text-text-3">daisy lin</a></footer>
    </div>
  );
}
