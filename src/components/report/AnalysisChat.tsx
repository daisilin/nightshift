import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { runAnalysisPipeline, getStep, getAllSteps } from '../../lib/analysis/registry';
import { getParadigm } from '../../data/taskBank';
import { personaBank } from '../../data/personaBank';
import { ResultRenderer } from './ResultRenderer';
import type { AnalysisResult } from '../../lib/analysis/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: AnalysisResult[];
}

export function AnalysisChat() {
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!session) return null;

  // Get all datasets from the session
  const battery = session.battery ?? [];
  const isBattery = battery.length > 0;

  const datasets = isBattery
    ? battery.filter(t => t.dataset).map(t => t.dataset!)
    : (session.designReports ?? []).filter(r => r.dataset).map(r => r.dataset!);

  const designs = isBattery
    ? battery.filter(t => t.design).map(t => t.design!)
    : (session.designReports ?? []).filter(r => r.design).map(r => r.design!);

  const paradigms = (isBattery ? battery.map(t => t.paradigmId) : [session.paradigmId])
    .map(id => getParadigm(id)).filter(Boolean) as any[];

  const personas = session.personaIds
    .map(id => personaBank.find(p => p.id === id)).filter(Boolean) as any[];

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      // Ask Claude to interpret the user's request into analysis steps
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: `You help researchers analyze their simulated experiment data.
Available analysis steps: ${getAllSteps().map(s => `${s.id} (${s.name})`).join(', ')}
Available tasks in this session: ${paradigms.map((p: any) => p.name).join(', ')}
Populations: ${personas.map((p: any) => p.name).join(', ')}

When the user asks for an analysis, return JSON:
{ "steps": [{ "id": "step-id", "params": {} }], "explanation": "what you're doing" }

If they ask something that doesn't map to a step, just return:
{ "steps": [], "explanation": "your conversational response" }

Examples:
- "show correlation matrix" → { "steps": [{"id": "correlation-matrix", "params": {"permutations": 500}}], "explanation": "computing pairwise correlations across all ${paradigms.length} tasks" }
- "factor analysis with 2 factors" → { "steps": [{"id": "exploratory-fa", "params": {"nFactors": 2}}], "explanation": "running EFA with 2 factors and Varimax rotation" }
- "are there ceiling effects?" → { "steps": [{"id": "ceiling-floor"}], "explanation": "checking for ceiling and floor effects across tasks and populations" }

Return ONLY JSON.`,
          messages: [{ role: 'user', content: text }],
        }),
      });

      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      let parsed: { steps: any[]; explanation: string };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { steps: [], explanation: raw || "I couldn't parse that request. Try asking for a specific analysis like 'correlation matrix' or 'factor analysis with 3 factors'." };
      }

      // Run the analysis steps
      let results: AnalysisResult[] = [];
      if (parsed.steps?.length > 0 && datasets.length > 0) {
        results = runAnalysisPipeline({ steps: parsed.steps }, { datasets, designs, paradigms, personas });

        // Also store these in the session so they persist
        const existing = session.analysisResults ?? [];
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: [...existing, ...results] });
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: parsed.explanation || 'Analysis complete.',
        results: results.length > 0 ? results : undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'show correlation matrix',
    'factor analysis with 3 factors',
    'are there ceiling effects?',
    'compare populations',
    'condition effect sizes',
    'split-half reliability',
  ].filter(s => {
    // Only show multi-task suggestions if we have multiple tasks
    if (['show correlation matrix', 'factor analysis with 3 factors'].includes(s) && datasets.length < 2) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <h3 className="text-sm font-heading text-text mb-3">ask the analysis agent</h3>
      <p className="text-xs text-text-3 mb-3">
        chat to run additional analyses on your data. {datasets.length} task(s) × {personas.length} population(s) in memory.
      </p>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {suggestions.map(s => (
          <button key={s} onClick={() => { setInput(s); }}
            className="px-2.5 py-1 rounded-full text-[11px] text-text-3 border border-orchid/10 hover:border-orchid/25 hover:text-text-2 cursor-pointer transition-all">
            {s}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[400px] overflow-y-auto space-y-3 mb-3">
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`text-xs ${msg.role === 'user' ? 'text-orchid font-medium' : 'text-text-2'}`}>
              {msg.role === 'user' ? '→ ' : ''}{msg.content}
            </div>
            {msg.results?.map((r, ri) => (
              <div key={ri} className="mt-2">
                <ResultRenderer result={r} />
              </div>
            ))}
          </div>
        ))}
        {loading && <div className="text-xs text-text-3 italic">thinking...</div>}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="what analysis do you want to see?"
          className="flex-1 px-3 py-2 rounded-xl text-sm border border-orchid/15 bg-white text-text focus:outline-none focus:border-orchid/40"
          disabled={loading}
        />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
          run
        </motion.button>
      </div>
    </motion.div>
  );
}
