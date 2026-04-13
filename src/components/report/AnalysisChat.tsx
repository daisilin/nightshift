import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { runAnalysisPipeline, getAllSteps } from '../../lib/analysis/registry';
import { getParadigm } from '../../data/taskBank';
import { personaBank } from '../../data/personaBank';
import { ResultRenderer } from './ResultRenderer';
import type { AnalysisResult } from '../../lib/analysis/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  results?: AnalysisResult[];
}

function buildSystemPrompt(taskNames: string[], personaNames: string[], nDatasets: number, existingResultsSummary: string, paperContext: string) {
  const steps = getAllSteps();
  return `You are an analysis agent. You EXECUTE analyses, you don't just talk about them.

Data: ${nDatasets} task(s): ${taskNames.join(', ')}. Populations: ${personaNames.join(', ')}.
${paperContext ? `Paper: ${paperContext}` : ''}
${existingResultsSummary ? `Already computed:\n${existingResultsSummary}` : ''}

Available steps: ${steps.map(s => `"${s.id}"`).join(', ')}
Params: correlation-matrix takes {permutations:N}, exploratory-fa takes {nFactors:N}

RULES:
1. ALWAYS include "steps" array with analysis IDs to execute. NEVER return empty steps unless purely answering a question about existing results.
2. When user asks to "compare to paper" or "test hypotheses" — run descriptive-stats AND condition-effects AND correlation-matrix. Then explain in "explanation".
3. When user asks "what analysis" — run ALL relevant steps, don't ask.
4. Put your interpretation in "explanation" — reference computed numbers from existing results.

Response format (STRICT):
{"steps":[{"id":"step-id","params":{}}],"explanation":"your interpretation"}

Examples:
- "compare to paper" → {"steps":[{"id":"descriptive-stats"},{"id":"condition-effects"},{"id":"correlation-matrix","params":{"permutations":500}}],"explanation":"running key analyses to compare..."}
- "what do you see" → {"steps":[],"explanation":"based on the computed results, the effect sizes suggest..."}
- "run everything" → {"steps":[{"id":"descriptive-stats"},{"id":"split-half-reliability"},{"id":"ceiling-floor"},{"id":"condition-effects"},{"id":"persona-differences"}${nDatasets >= 2 ? ',{"id":"correlation-matrix"},{"id":"exploratory-fa","params":{"nFactors":3}}' : ''}],"explanation":"running full analysis suite"}`;
}

export function AnalysisChat() {
  const { state, dispatch } = useApp();
  const session = state.currentSession;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoRan = useRef(false);

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

  const taskNames = paradigms.map((p: any) => p.name);
  const personaNames = personas.map((p: any) => p.name);
  const existingResults = session.analysisResults ?? [];

  // Auto-run full analysis on first load if no results exist
  useEffect(() => {
    if (autoRan.current || datasets.length === 0 || existingResults.length > 0) return;
    autoRan.current = true;

    import('../../lib/analysis/registry').then(({ runAnalysisPipeline, defaultBatteryPlan, defaultSingleTaskPlan }) => {
      const plan = datasets.length > 1 ? defaultBatteryPlan(datasets.length) : defaultSingleTaskPlan();
      const results = runAnalysisPipeline(plan, { datasets, designs, paradigms, personas });

      if (results.length > 0) {
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: results });
        setMessages([{
          role: 'assistant',
          content: `auto-ran ${results.length} analyses on ${datasets.length} task(s) × ${personas.length} population(s). results are above. ask me to dig deeper, run specific analyses, or explain what you see.`,
          results,
        }]);
      }
    });
  }, [datasets.length]);

  const handleSend = async (text?: string) => {
    const query = (text || input).trim();
    if (!query || loading || datasets.length === 0) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setLoading(true);

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: buildSystemPrompt(taskNames, personaNames, datasets.length,
            existingResults.map((r: any) => `${r.title}: ${r.type === 'text' ? r.data : `${r.type} with ${JSON.stringify(r.data).length} chars of data`}`).join('\n'),
            session.paperContext || ''
          ),
          messages: [
            // Include conversation history so Claude has context
            ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: query },
          ],
        }),
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';

      // Parse Claude's JSON response — try multiple extraction methods
      let parsed: { steps: any[]; explanation: string };
      try {
        // Method 1: direct parse
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        try {
          // Method 2: find first { and last }
          const first = raw.indexOf('{');
          const last = raw.lastIndexOf('}');
          if (first >= 0 && last > first) {
            parsed = JSON.parse(raw.slice(first, last + 1));
          } else {
            throw new Error('no JSON');
          }
        } catch {
          // Method 3: Claude returned plain text — treat as explanation
          parsed = { steps: [], explanation: raw || 'No response.' };
        }
      }

      // Execute any analysis steps
      let results: AnalysisResult[] = [];
      if (parsed.steps?.length > 0) {
        results = runAnalysisPipeline({ steps: parsed.steps }, { datasets, designs, paradigms, personas });
        const existing = session.analysisResults ?? [];
        dispatch({ type: 'SET_ANALYSIS_RESULTS', payload: [...existing, ...results] });
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: parsed.explanation || 'Analysis complete.',
        results: results.length > 0 ? results : undefined,
      }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Could not reach the analysis agent. Check your connection and try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
      <h3 className="text-sm font-heading text-text mb-2">analysis agent</h3>
      <p className="text-xs text-text-3 mb-3">
        {datasets.length} task(s) × {personas.length} population(s) in memory. ask for any analysis or say "analyze this."
      </p>

      {/* Messages */}
      <div ref={scrollRef} className="max-h-[600px] overflow-y-auto space-y-4 mb-3">
        {messages.length === 0 && (
          <p className="text-xs text-text-4 italic">
            try: "run all analyses" · "correlation matrix with 1000 permutations" · "what do these results mean?" · "try factor analysis with 2 factors"
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`text-xs mb-1 ${msg.role === 'user' ? 'text-orchid font-medium' : 'text-text-2'}`}>
              {msg.role === 'user' ? '→ ' : '← '}{msg.content}
            </div>
            {msg.results?.map((r, ri) => (
              <div key={ri} className="mt-2"><ResultRenderer result={r} /></div>
            ))}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-text-3">
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="inline-block w-3 h-3 border border-orchid/30 border-t-orchid rounded-full" />
            analyzing...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="what analysis do you want? or just say 'analyze this'"
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
