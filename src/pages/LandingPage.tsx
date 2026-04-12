import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { taskBank } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import { PaperUpload } from '../components/PaperUpload';
import { stagger, staggerItem } from '../lib/animations';

export function LandingPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const [brief, setBrief] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([taskBank[0].id]);
  const [selectedPersonas, setSelectedPersonas] = useState(['college-student', 'mturk-worker', 'older-adult']);
  const [customPersona, setCustomPersona] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const toggleTask = (id: string) => {
    setSelectedTasks(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };
  const togglePersona = (id: string) => {
    setSelectedPersonas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const go = () => {
    const b = brief.trim();
    if (!b || selectedPersonas.length === 0 || selectedTasks.length === 0) return;
    if (selectedTasks.length === 1) {
      dispatch({ type: 'START_EXPERIMENT', payload: { brief: b, paradigmId: selectedTasks[0], personaIds: selectedPersonas } });
    } else {
      dispatch({ type: 'START_BATTERY', payload: { brief: b, paradigmIds: selectedTasks, personaIds: selectedPersonas } });
    }
    nav('/dispatch');
  };

  // Chat with the experiment designer
  const handleChat = async (text?: string) => {
    const msg = (text || brief).trim();
    if (!msg || chatLoading) return;
    setBrief('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: `You are an experiment design assistant for a behavioral research platform called nightshift.

Available tasks: ${taskBank.map(t => `${t.id} (${t.name} — ${t.description})`).join('\n')}

Available populations: ${personaBank.map(p => `${p.id} (${p.name} — ${p.description})`).join('\n')}

When the researcher describes what they want to study, respond with:
1. A brief explanation of your recommendation (2-3 sentences)
2. A JSON block with the experiment setup:

\`\`\`json
{
  "brief": "one-sentence research question",
  "paradigmIds": ["task-id", ...],
  "personaIds": ["persona-id", ...],
  "ready": true
}
\`\`\`

If the researcher's request is unclear, ask a clarifying question (set "ready": false, no paradigmIds needed).
Match tasks to their research question. For individual differences studies, suggest multiple tasks.
For developmental questions, include "child" and "older-adult" personas.
Always be helpful and explain WHY you chose each task.`,
          messages: [
            ...chatMessages.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg },
          ],
        }),
      });

      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';

      // Extract JSON setup if present
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const setup = JSON.parse(jsonMatch[1]);
          if (setup.ready && setup.paradigmIds?.length > 0) {
            // Auto-configure
            const validTasks = setup.paradigmIds.filter((id: string) => taskBank.find(t => t.id === id));
            if (validTasks.length > 0) setSelectedTasks(validTasks);
            if (setup.personaIds?.length > 0) {
              const validPersonas = setup.personaIds.filter((id: string) => personaBank.find(p => p.id === id));
              if (validPersonas.length > 0) setSelectedPersonas(validPersonas);
            }
            if (setup.brief) setBrief(setup.brief);
          }
        } catch { /* ignore parse error */ }
      }

      // Show Claude's explanation (strip the JSON block for readability)
      const explanation = raw.replace(/```json[\s\S]*?```/g, '').trim();
      setChatMessages(prev => [...prev, { role: 'assistant', content: explanation }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Could not reach the assistant. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 pt-14 pb-16">
        <motion.div variants={stagger} initial="initial" animate="animate">
          {/* Header */}
          <motion.div variants={staggerItem} className="mb-6">
            <span className="text-sm font-mono font-light text-text-3">nightshift</span>
            <h1 className="text-3xl sm:text-4xl font-heading leading-[1.1] mt-2">
              overnight experiment<br />
              <span className="bg-gradient-to-r from-orchid via-rose to-peach bg-clip-text text-transparent">iteration engine</span>
            </h1>
          </motion.div>

          {/* MAIN INPUT: conversational */}
          <motion.div variants={staggerItem} className="mb-6">
            <div className="card p-3">
              {/* Chat messages */}
              {chatMessages.length > 0 && (
                <div className="max-h-[250px] overflow-y-auto mb-3 space-y-2 px-1">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-orchid' : 'text-text-2'}`}>
                      {msg.role === 'user' ? '→ ' : ''}{msg.content}
                    </div>
                  ))}
                  {chatLoading && <div className="text-xs text-text-3 italic">thinking...</div>}
                </div>
              )}

              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); }}}
                placeholder="describe what you want to study... e.g., 'I want to compare planning ability across age groups using Tower of London and Four-in-a-Row'"
                rows={2}
                className="w-full bg-transparent px-3 py-2 text-[15px] text-text placeholder-text-4 resize-none focus:outline-none"
                autoFocus
              />
              <div className="flex justify-between items-center px-3 pb-1">
                <span className="text-[10px] text-text-4">
                  {selectedTasks.length} task(s) · {selectedPersonas.length} population(s) selected
                </span>
                <div className="flex gap-2">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => handleChat()}
                    disabled={!brief.trim() || chatLoading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-2 border border-orchid/15 cursor-pointer disabled:opacity-30 hover:bg-orchid/5">
                    ask
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={go}
                    disabled={selectedTasks.length === 0 || selectedPersonas.length === 0 || chatLoading}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
                    style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
                    dispatch 🌙
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Paper upload */}
          <motion.div variants={staggerItem} className="mb-4">
            <PaperUpload onExtracted={(extracted) => {
              const validIds = (extracted.paradigmIds ?? [extracted.paradigmId]).filter(id => taskBank.find(t => t.id === id));
              if (validIds.length > 0) setSelectedTasks(validIds);
              if (extracted.personaIds?.length > 0) setSelectedPersonas(extracted.personaIds);
              setBrief(extracted.brief);
              setChatMessages(prev => [...prev,
                { role: 'assistant', content: `extracted from "${extracted.paperTitle}": ${extracted.keyDetails || extracted.brief}\n\n${validIds.length} task(s) auto-selected. click dispatch to run, or ask me to adjust.` }
              ]);
            }} />
          </motion.div>

          {/* Selected tasks + personas (compact, always visible) */}
          <motion.div variants={staggerItem} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-mono text-text-3 uppercase">tasks</span>
              <button onClick={() => setShowManual(!showManual)} className="text-[10px] text-orchid cursor-pointer hover:underline">
                {showManual ? 'hide' : 'edit'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedTasks.map(id => {
                const t = taskBank.find(tb => tb.id === id);
                return t ? (
                  <span key={id} className="px-2 py-1 rounded-lg text-[11px] bg-orchid/10 text-text border border-orchid/15">
                    {t.emoji} {t.name}
                  </span>
                ) : null;
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selectedPersonas.map(id => {
                const p = personaBank.find(pb => pb.id === id);
                return p ? (
                  <span key={id} className="px-2 py-1 rounded-lg text-[11px] bg-surface-2/50 text-text-2 border border-orchid/8">
                    {p.emoji} {p.name}
                  </span>
                ) : null;
              })}
            </div>
          </motion.div>

          {/* Manual task/persona picker (collapsible) */}
          {showManual && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-4 space-y-3">
              <div>
                <label className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1.5 block">paradigms</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {taskBank.map(t => (
                    <button key={t.id} onClick={() => toggleTask(t.id)}
                      className={`card p-2 text-left cursor-pointer transition-all text-[11px] ${selectedTasks.includes(t.id) ? 'ring-1 ring-orchid/40 bg-orchid/5' : 'hover:border-orchid/20'}`}>
                      <span>{t.emoji}</span> <span className="font-medium text-text">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-mono text-text-3 uppercase tracking-wider mb-1.5 block">populations</label>
                <div className="flex flex-wrap gap-1.5">
                  {personaBank.map(p => (
                    <button key={p.id} onClick={() => togglePersona(p.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer border ${
                        selectedPersonas.includes(p.id) ? 'bg-orchid/10 border-orchid/25 text-text' : 'bg-white border-orchid/8 text-text-3'}`}>
                      {p.emoji} {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Past sessions */}
          {state.sessions.length > 0 && (
            <motion.div variants={staggerItem} className="mt-6 pt-4 border-t border-orchid/10">
              <h3 className="text-[10px] font-mono text-text-3 mb-2">past research</h3>
              {state.sessions.slice(-3).reverse().map(s => (
                <div key={s.id} className="card p-3 mb-1.5">
                  <p className="text-xs text-text">{s.brief.slice(0, 60)}{s.brief.length > 60 ? '...' : ''}</p>
                  <p className="text-[10px] text-text-3">round {s.round} · {new Date(s.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
      <footer className="text-center pb-4 text-[10px] text-text-4">
        by <a href="https://daisilin.github.io" className="underline hover:text-text-3">daisy lin</a> · compress experiment iteration into nights
      </footer>
    </div>
  );
}
