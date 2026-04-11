import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { runAllInterns, synthesizeReports } from '../lib/ai';
import { INTERN_PROFILES } from '../lib/interns';
import type { InternRole } from '../context/types';
import { stagger, staggerItem } from '../lib/animations';

export function DispatchPage() {
  const nav = useNavigate();
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const [statuses, setStatuses] = useState<Record<InternRole, string>>({ scout: 'preparing...', analyst: 'preparing...', contrarian: 'preparing...' });
  const [phase, setPhase] = useState<'working' | 'synthesizing' | 'done'>('working');
  const ran = useRef(false);

  useEffect(() => {
    if (!session || ran.current) return;
    ran.current = true;

    (async () => {
      const results = await runAllInterns(session.missions, (role, status) => {
        setStatuses(prev => ({ ...prev, [role]: status === 'working' ? 'researching...' : 'done ✓' }));
        if (status === 'done') {
          dispatch({ type: 'UPDATE_REPORT', payload: { role, report: { status: 'working' } } });
        }
      });

      // Update reports with findings
      for (const r of results) {
        dispatch({ type: 'UPDATE_REPORT', payload: {
          role: r.role,
          report: { summary: r.summary, findings: r.findings, status: 'done' },
        }});
      }

      setPhase('synthesizing');
      const synthesis = await synthesizeReports(session.brief, results);
      dispatch({ type: 'SET_SYNTHESIS', payload: synthesis });

      setPhase('done');
      setTimeout(() => {
        dispatch({ type: 'SET_STEP', payload: 'report' });
        nav('/report');
      }, 800);
    })();
  }, [session, dispatch, nav]);

  if (!session) return null;

  const roles: InternRole[] = ['scout', 'analyst', 'contrarian'];

  return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #FFFAF7 0%, #FFEEE6 30%, #F5E6F0 60%, #E8EEF5 100%)' }}>
      <motion.div variants={stagger} initial="initial" animate="animate" className="max-w-md w-full text-center">
        <motion.div variants={staggerItem} className="mb-2">
          <span className="text-sm font-mono font-light text-text-3">nightshift</span>
        </motion.div>

        <motion.h2 variants={staggerItem} className="text-2xl font-heading mb-2 text-text">
          {phase === 'working' ? 'interns are working...' : phase === 'synthesizing' ? 'writing your briefing...' : 'ready ✨'}
        </motion.h2>

        <motion.p variants={staggerItem} className="text-sm text-text-3 mb-8">
          {session.brief.slice(0, 80)}{session.brief.length > 80 ? '...' : ''}
        </motion.p>

        {/* Intern status cards */}
        <div className="space-y-3">
          {roles.map((role, i) => {
            const profile = INTERN_PROFILES[role];
            const done = statuses[role].includes('done');
            return (
              <motion.div
                key={role}
                variants={staggerItem}
                className="card p-4 flex items-center gap-4"
                style={done ? { borderColor: `${profile.color}30` } : undefined}
              >
                <motion.div
                  animate={!done ? { rotate: 360 } : {}}
                  transition={!done ? { duration: 3, repeat: Infinity, ease: 'linear' } : {}}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ background: `${profile.color}15` }}
                >
                  {profile.emoji}
                </motion.div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-semibold" style={{ color: profile.color }}>{profile.name}</div>
                  <div className="text-xs text-text-3">{profile.description}</div>
                </div>
                <span className={`text-xs font-mono ${done ? 'text-sage' : 'text-text-4'}`}>
                  {statuses[role]}
                </span>
              </motion.div>
            );
          })}
        </div>

        {phase === 'synthesizing' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-text-3 mt-6 italic"
          >
            cross-referencing findings and writing your morning briefing...
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
