import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { runAnalysisPipeline, getAllSteps } from '../../lib/analysis/registry';
import { getParadigm } from '../../data/taskBank';
import { personaBank } from '../../data/personaBank';
import { ResultRenderer } from './ResultRenderer';
import type { AnalysisResult, AnalysisPlanStep } from '../../lib/analysis/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: AnalysisResult[];
}

// Direct keyword → analysis step mapping (works without Claude)
function parseRequest(text: string): { steps: AnalysisPlanStep[]; explanation: string } | null {
  const lower = text.toLowerCase();

  if (lower.includes('correlation') || lower.includes('corr matrix')) {
    const perms = lower.match(/(\d+)\s*perm/)?.[1];
    return { steps: [{ id: 'correlation-matrix', params: { permutations: perms ? parseInt(perms) : 500 } }], explanation: 'computing pairwise correlation matrix' };
  }
  if (lower.includes('factor') || lower.includes('efa') || lower.includes('pca')) {
    const nf = lower.match(/(\d+)\s*factor/)?.[1];
    return { steps: [{ id: 'exploratory-fa', params: { nFactors: nf ? parseInt(nf) : 3 } }], explanation: `running exploratory factor analysis with ${nf || 3} factors` };
  }
  if (lower.includes('ceiling') || lower.includes('floor')) {
    return { steps: [{ id: 'ceiling-floor' }], explanation: 'checking for ceiling and floor effects' };
  }
  if (lower.includes('reliab') || lower.includes('split-half') || lower.includes('split half')) {
    return { steps: [{ id: 'split-half-reliability' }], explanation: 'computing split-half reliability for each task' };
  }
  if (lower.includes('effect size') || lower.includes('cohen') || lower.includes('condition')) {
    return { steps: [{ id: 'condition-effects' }], explanation: 'computing condition effect sizes (Cohen\'s d)' };
  }
  if (lower.includes('population') || lower.includes('persona') || lower.includes('compare')) {
    return { steps: [{ id: 'persona-differences' }], explanation: 'comparing performance across populations' };
  }
  if (lower.includes('descriptive') || lower.includes('summary') || lower.includes('mean')) {
    return { steps: [{ id: 'descriptive-stats' }], explanation: 'computing descriptive statistics' };
  }
  if (lower.includes('outlier')) {
    return { steps: [{ id: 'outlier-detection' }], explanation: 'running outlier detection' };
  }
  if (lower.includes('all') || lower.includes('everything') || lower.includes('full')) {
    const steps: AnalysisPlanStep[] = [
      { id: 'descriptive-stats' }, { id: 'split-half-reliability' },
      { id: 'ceiling-floor' }, { id: 'condition-effects' },
      { id: 'persona-differences' }, { id: 'correlation-matrix', params: { permutations: 500 } },
      { id: 'exploratory-fa', params: { nFactors: 3 } },
    ];
    return { steps, explanation: 'running the full analysis suite' };
  }
  return null;
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

  const handleSend = async (text?: string) => {
    const query = (text || input).trim();
    if (!query || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setLoading(true);

    // First try direct keyword matching (instant, no API call)
    const direct = parseRequest(query);
    if (direct && direct.steps.length > 0 && datasets.length > 0) {
      const results = runAnalysisPipeline({ steps: direct.steps }, { datasets, designs, paradigms, personas });
      const existing = session.analysisResults ?? [];
      dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: [...existing, ...results] });
      setMessages(prev => [...prev, { role: 'assistant', content: direct.explanation, results }]);
      setLoading(false);
      return;
    }

    // Fallback: ask Claude
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          system: `You help researchers analyze simulated experiment data. Available analyses: ${getAllSteps().map(s => s.id).join(', ')}. Tasks in session: ${paradigms.map((p: any) => p.name).join(', ')}. Return JSON: { "steps": [{"id": "step-id", "params": {}}], "explanation": "..." } or just { "steps": [], "explanation": "your response" }. Return ONLY JSON.`,
          messages: [{ role: 'user', content: query }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.steps?.length > 0 && datasets.length > 0) {
        const results = runAnalysisPipeline({ steps: parsed.steps }, { datasets, designs, paradigms, personas });
        const existing = session.analysisResults ?? [];
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: [...existing, ...results] });
        setMessages(prev => [...prev, { role: 'assistant', content: parsed.explanation || 'done', results }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: parsed.explanation || raw }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Couldn't reach the API. Try a keyword like 'correlation matrix' or 'factor analysis 3'." }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'correlation matrix',
    'factor analysis with 3 factors',
    'ceiling & floor effects',
    'compare populations',
    'effect sizes',
    'reliability',
    'run everything',
  ].filter(s => {
    if (['correlation matrix', 'factor analysis with 3 factors'].includes(s) && datasets.length < 2) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <h3 className="text-sm font-heading text-text mb-2">analysis agent</h3>
      <p className="text-xs text-text-3 mb-3">
        {datasets.length} task(s) × {personas.length} population(s) in memory. ask for any analysis.
      </p>

      {/* Suggestions */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {suggestions.map(s => (
          <button key={s} onClick={() => handleSend(s)}
            className="px-2.5 py-1 rounded-full text-[11px] text-text-3 border border-orchid/10 hover:border-orchid/25 hover:text-text-2 cursor-pointer transition-all">
            {s}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[500px] overflow-y-auto space-y-3 mb-3">
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`text-xs ${msg.role === 'user' ? 'text-orchid font-medium' : 'text-text-2'}`}>
              {msg.role === 'user' ? '→ ' : ''}{msg.content}
            </div>
            {msg.results?.map((r, ri) => (
              <div key={ri} className="mt-2"><ResultRenderer result={r} /></div>
            ))}
          </div>
        ))}
        {loading && <div className="text-xs text-text-3 italic">running analysis...</div>}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="correlation matrix, factor analysis 3, compare populations..."
          className="flex-1 px-3 py-2 rounded-xl text-sm border border-orchid/15 bg-white text-text focus:outline-none focus:border-orchid/40"
          disabled={loading} />
        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => handleSend()} disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
          run
        </motion.button>
      </div>
    </motion.div>
  );
}
