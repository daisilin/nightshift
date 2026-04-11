import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { createMissions } from '../lib/interns';
import { stagger, staggerItem } from '../lib/animations';

const examples = [
  'what are the best tools for building a portfolio site in 2026?',
  'how are top startups thinking about AI-native onboarding?',
  'what does the competitive landscape look like for AI coding tools?',
  'what are the most promising approaches to AI-assisted learning?',
  'how do successful indie hackers find their first 100 users?',
];

export function LandingPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const [brief, setBrief] = useState('');

  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const missions = createMissions(t);
    dispatch({ type: 'START_SESSION', payload: { brief: t, missions } });
    nav('/dispatch');
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      {/* Decorative blobs */}
      <div className="pointer-events-none fixed top-[-10%] right-[-5%] w-[400px] h-[400px] opacity-[0.06]"
        style={{ background: 'radial-gradient(circle, #D9B8E8, transparent 70%)', animation: 'morph 12s ease-in-out infinite', borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }} />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] w-[350px] h-[350px] opacity-[0.05]"
        style={{ background: 'radial-gradient(circle, #F3CDB2, transparent 70%)', animation: 'morph 15s ease-in-out infinite reverse', borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-20 pb-16">
        <motion.div variants={stagger} initial="initial" animate="animate">
          {/* Header */}
          <motion.div variants={staggerItem} className="mb-12">
            <span className="text-sm font-mono font-light text-text-3 tracking-wider">nightshift</span>
          </motion.div>

          {/* Hero */}
          <motion.h1 variants={staggerItem} className="text-4xl sm:text-5xl md:text-6xl font-heading leading-[1.1] mb-4">
            agent interns that
            <br />
            <span className="bg-gradient-to-r from-orchid via-rose to-peach bg-clip-text text-transparent">
              work while you sleep
            </span>
          </motion.h1>

          <motion.p variants={staggerItem} className="text-lg text-text-2 leading-relaxed mb-10 max-w-lg">
            give a messy research brief. three interns explore it from different angles overnight.
            wake up to a clean visual report. steer and iterate daily.
          </motion.p>

          {/* Brief input */}
          <motion.div variants={staggerItem}>
            <div className="card p-2 mb-3">
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(brief); }}}
                placeholder="what do you want to figure out?"
                rows={3}
                className="w-full bg-transparent px-4 py-3 text-[17px] text-text placeholder-text-4 resize-none focus:outline-none font-body"
                autoFocus
              />
              <div className="flex justify-between items-center px-4 pb-2">
                <span className="text-xs text-text-4">enter to dispatch</span>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => submit(brief)}
                  disabled={!brief.trim()}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30 transition-all"
                  style={{ background: brief.trim() ? 'linear-gradient(135deg, #B07CC6, #D48BB5)' : 'rgba(176,124,198,0.15)' }}
                >
                  dispatch interns 🌙
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Example briefs */}
          <motion.div variants={staggerItem} className="flex flex-wrap gap-2 mt-4">
            {examples.map(ex => (
              <button
                key={ex}
                onClick={() => submit(ex)}
                className="px-3 py-1.5 rounded-full text-xs text-text-3 border border-orchid/10 bg-white/60 hover:bg-orchid/8 hover:text-text-2 transition-all cursor-pointer"
              >
                {ex.slice(0, 45)}...
              </button>
            ))}
          </motion.div>

          {/* Past sessions */}
          {state.sessions.length > 0 && (
            <motion.div variants={staggerItem} className="mt-12 pt-8 border-t border-orchid/10">
              <h3 className="text-sm font-mono font-light text-text-3 mb-3">past research</h3>
              {state.sessions.slice(-3).reverse().map(s => (
                <div key={s.id} className="card p-4 mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text font-medium">{s.brief.slice(0, 60)}{s.brief.length > 60 ? '...' : ''}</p>
                    <p className="text-xs text-text-3 mt-0.5">round {s.round} · {new Date(s.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs text-sage font-mono">done</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Intern intro */}
          <motion.div variants={staggerItem} className="mt-12 grid grid-cols-3 gap-3">
            {[
              { emoji: '🔭', name: 'Scout', desc: 'maps the landscape', color: '#8BACD4' },
              { emoji: '🔬', name: 'Analyst', desc: 'goes deep', color: '#B07CC6' },
              { emoji: '🪞', name: 'Contrarian', desc: 'challenges assumptions', color: '#E8A87C' },
            ].map(i => (
              <div key={i.name} className="card p-4 text-center">
                <div className="text-2xl mb-2">{i.emoji}</div>
                <div className="text-sm font-semibold" style={{ color: i.color }}>{i.name}</div>
                <div className="text-xs text-text-3 mt-0.5">{i.desc}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      <footer className="relative z-10 text-center pb-6 text-xs text-text-4">
        a prototype by <a href="https://daisilin.github.io" className="underline hover:text-text-3">daisy lin</a> · exploring agent interfaces for human capability
      </footer>
    </div>
  );
}
