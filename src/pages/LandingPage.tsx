import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { taskBank } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import { PaperUpload } from '../components/PaperUpload';
import { TaskPreview } from '../components/preview/TaskPreview';
import { stagger, staggerItem } from '../lib/animations';
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
  const [designChat, setDesignChat] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [exploringTask, setExploringTask] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [simMode, setSimMode] = useState<'parametric' | 'llm'>('parametric');

  const toggleTask = (id: string) => setSelectedTasks(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  const togglePersona = (id: string) => setSelectedPersonas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const dispatchExperiment = () => {
    const b = brief.trim();
    if (!b || selectedTasks.length === 0 || selectedPersonas.length === 0) return;
    if (selectedTasks.length === 1) {
      dispatch({ type: 'START_EXPERIMENT', payload: { brief: b, paradigmId: selectedTasks[0], personaIds: selectedPersonas } });
    } else {
      dispatch({ type: 'START_BATTERY', payload: { brief: b, paradigmIds: selectedTasks, personaIds: selectedPersonas } });
    }
    nav(simMode === 'llm' ? '/dispatch?mode=llm' : '/dispatch');
  };

  const sendToDesignAgent = async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setDesignChat(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: `You are a task design agent for nightshift, a behavioral research platform.

Currently selected: ${selectedTasks.map(id => taskBank.find(t => t.id === id)?.name || id).join(', ') || 'none'}
Populations: ${selectedPersonas.map(id => personaBank.find(p => p.id === id)?.name || id).join(', ')}
Brief: "${brief || 'not set'}"

Available tasks: ${taskBank.map(t => `${t.id}: ${t.name} (${t.category})`).join(', ')}
Available populations: ${personaBank.map(p => `${p.id}: ${p.name}`).join(', ')}

Help design the experiment. When recommending changes, include:
\`\`\`json
{ "brief": "...", "addTasks": [...], "removeTasks": [...], "addPersonas": [...], "removePersonas": [...] }
\`\`\`
Be conversational. Explain WHY. Suggest variants and point out design gaps.`,
          messages: [
            ...designChat.slice(-8).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg },
          ],
        }),
      });

      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const u = JSON.parse(jsonMatch[1]);
          if (u.brief) setBrief(u.brief);
          if (u.addTasks) setSelectedTasks(prev => [...new Set([...prev, ...u.addTasks.filter((id: string) => taskBank.find(t => t.id === id))])]);
          if (u.removeTasks) setSelectedTasks(prev => prev.filter(id => !u.removeTasks.includes(id)));
          if (u.addPersonas) setSelectedPersonas(prev => [...new Set([...prev, ...u.addPersonas.filter((id: string) => personaBank.find(p => p.id === id))])]);
          if (u.removePersonas) setSelectedPersonas(prev => prev.filter(id => !u.removePersonas.includes(id)));
        } catch { /* ignore */ }
      }
      setDesignChat(prev => [...prev, { role: 'assistant', content: raw.replace(/```json[\s\S]*?```/g, '').trim() }]);
    } catch {
      setDesignChat(prev => [...prev, { role: 'assistant', content: 'Could not reach the design agent.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 pt-12 pb-16">
        <motion.div variants={stagger} initial="initial" animate="animate">

          <motion.div variants={staggerItem} className="mb-6">
            <span className="text-sm font-mono font-light text-text-3">nightshift</span>
            <h1 className="text-2xl sm:text-3xl font-heading leading-[1.1] mt-1">
              <span className="bg-gradient-to-r from-orchid via-rose to-peach bg-clip-text text-transparent">experiment design studio</span>
            </h1>
          </motion.div>

          {/* ===== START: paper drop + research question (ONE input) ===== */}
          {mode === 'start' && (
            <motion.div variants={staggerItem} className="space-y-4">
              <PaperUpload onExtracted={(extracted) => {
                const valid = (extracted.paradigmIds ?? [extracted.paradigmId]).filter((id: string) => taskBank.find(t => t.id === id));
                if (valid.length > 0) setSelectedTasks(valid);
                if (extracted.personaIds?.length > 0) setSelectedPersonas(extracted.personaIds);
                setBrief(extracted.brief || '');
                setDesignChat([{ role: 'assistant', content: `from "${extracted.paperTitle}": ${valid.length} task(s) detected. ${extracted.keyDetails || ''}\n\nadjust below or ask me to modify.` }]);
                setMode('design');
              }} />

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
                  <div className="max-h-[300px] overflow-y-auto space-y-2 mb-2">
                    {designChat.length === 0 && <p className="text-xs text-text-4 italic">ask me about task design, variants, parameters, or populations...</p>}
                    {designChat.map((msg, i) => (
                      <div key={i} className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-orchid' : 'text-text-2'}`}>
                        {msg.role === 'user' ? '→ ' : ''}{msg.content}
                      </div>
                    ))}
                    {chatLoading && <div className="text-xs text-text-3 italic">thinking...</div>}
                  </div>
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

              {/* Simulation mode toggle */}
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

              {/* Dispatch */}
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={dispatchExperiment}
                disabled={selectedTasks.length === 0 || selectedPersonas.length === 0}
                className="w-full py-3 rounded-[14px] text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
                style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
                dispatch {selectedTasks.length} task(s) × {selectedPersonas.length} pop. 🌙
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
