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
  const [selectedTask, setSelectedTask] = useState(taskBank[0].id);
  const [selectedPersonas, setSelectedPersonas] = useState(['college-student', 'mturk-worker', 'older-adult']);

  const togglePersona = (id: string) => {
    setSelectedPersonas(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const go = () => {
    const b = brief.trim();
    if (!b || selectedPersonas.length === 0) return;
    dispatch({ type: 'START_EXPERIMENT', payload: { brief: b, paradigmId: selectedTask, personaIds: selectedPersonas } });
    nav('/dispatch');
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <div className="max-w-2xl mx-auto px-6 pt-14 pb-16">
        <motion.div variants={stagger} initial="initial" animate="animate">
          {/* Header */}
          <motion.div variants={staggerItem} className="mb-8">
            <span className="text-sm font-mono font-light text-text-3">nightshift</span>
            <h1 className="text-3xl sm:text-4xl font-heading leading-[1.1] mt-2">
              overnight experiment<br />
              <span className="bg-gradient-to-r from-orchid via-rose to-peach bg-clip-text text-transparent">iteration engine</span>
            </h1>
            <p className="text-text-2 mt-3 max-w-lg">
              pick a paradigm, pick populations, describe what you're testing.
              interns propose designs, simulate pilots, compute metrics.
            </p>
          </motion.div>

          {/* Paper Upload */}
          <motion.div variants={staggerItem} className="mb-6">
            <PaperUpload onExtracted={(extracted) => {
              setBrief(extracted.brief);
              if (taskBank.find(t => t.id === extracted.paradigmId)) {
                setSelectedTask(extracted.paradigmId);
              }
              if (extracted.personaIds.length > 0) {
                setSelectedPersonas(extracted.personaIds);
              }
            }} />
          </motion.div>

          <motion.div variants={staggerItem} className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-orchid/10" />
            <span className="text-xs text-text-4">or configure manually</span>
            <div className="flex-1 h-px bg-orchid/10" />
          </motion.div>

          {/* Task Bank */}
          <motion.div variants={staggerItem} className="mb-5">
            <label className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2 block">paradigm</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {taskBank.map(t => (
                <button key={t.id} onClick={() => setSelectedTask(t.id)}
                  className={`card p-3 text-left cursor-pointer transition-all ${selectedTask === t.id ? 'ring-2 ring-orchid/40 bg-orchid/5' : 'hover:border-orchid/20'}`}>
                  <span className="text-lg">{t.emoji}</span>
                  <div className="text-xs font-semibold text-text mt-1">{t.name}</div>
                  <div className="text-[10px] text-text-3">{t.category}</div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Personas */}
          <motion.div variants={staggerItem} className="mb-5">
            <label className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2 block">populations</label>
            <div className="flex flex-wrap gap-2">
              {personaBank.map(p => (
                <button key={p.id} onClick={() => togglePersona(p.id)}
                  className={`px-3 py-2 rounded-xl text-xs cursor-pointer transition-all border ${
                    selectedPersonas.includes(p.id) ? 'bg-orchid/10 border-orchid/25 text-text' : 'bg-white border-orchid/8 text-text-3'}`}>
                  {p.emoji} {p.name}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-4 mt-1 italic">illustrative multipliers, not population estimates</p>
          </motion.div>

          {/* Brief */}
          <motion.div variants={staggerItem} className="mb-4">
            <label className="text-xs font-mono text-text-3 uppercase tracking-wider mb-2 block">research brief</label>
            <div className="card p-2">
              <textarea value={brief} onChange={e => setBrief(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }}}
                placeholder="what are you testing? e.g., 'does planning improve with practice under time pressure?'"
                rows={3} className="w-full bg-transparent px-4 py-3 text-[15px] text-text placeholder-text-4 resize-none focus:outline-none" autoFocus />
              <div className="flex justify-between items-center px-4 pb-2">
                <span className="text-xs text-text-4">{taskBank.find(t => t.id === selectedTask)?.name} · {selectedPersonas.length} pop.</span>
                <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={go}
                  disabled={!brief.trim() || selectedPersonas.length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30 transition-all"
                  style={{ background: brief.trim() ? 'linear-gradient(135deg, #B07CC6, #D48BB5)' : 'rgba(176,124,198,0.15)' }}>
                  dispatch interns 🌙
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Past sessions */}
          {state.sessions.length > 0 && (
            <motion.div variants={staggerItem} className="mt-8 pt-6 border-t border-orchid/10">
              <h3 className="text-xs font-mono text-text-3 mb-2">past research</h3>
              {state.sessions.slice(-3).reverse().map(s => (
                <div key={s.id} className="card p-3 mb-2">
                  <p className="text-sm text-text">{s.brief.slice(0, 60)}{s.brief.length > 60 ? '...' : ''}</p>
                  <p className="text-[10px] text-text-3 mt-0.5">round {s.round} · {new Date(s.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
      <footer className="text-center pb-6 text-xs text-text-4">
        by <a href="https://daisilin.github.io" className="underline hover:text-text-3">daisy lin</a> · compress experiment iteration into nights
      </footer>
    </div>
  );
}
