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
  // Only show steps that can actually run with this data
  const singleSteps = ['descriptive-stats', 'split-half-reliability', 'ceiling-floor', 'outlier-detection', 'condition-effects', 'persona-differences'];
  const mazeSteps = ['construal-effect', 'construal-by-maze'];
  const multiSteps = ['correlation-matrix', 'exploratory-fa'];
  const hasMaze = taskNames.some(n => n.toLowerCase().includes('maze'));
  const available = [
    ...singleSteps,
    ...(hasMaze ? mazeSteps : []),
    ...(nDatasets >= 2 ? multiSteps : []),
  ];

  return `You are an expert analysis agent powered by Claude Opus. You EXECUTE analyses by returning step IDs in JSON, AND you can write Python code for advanced analyses.

DATA IN MEMORY: ${nDatasets} task(s): ${taskNames.join(', ')}. Populations: ${personaNames.join(', ')}.

${paperContext ? `ORIGINAL PAPER (full text available):\n${paperContext}` : ''}

REAL HUMAN DATA FROM THE PAPER (for comparison):
- N=161 participants, 13342 attention trials
- High construal obstacles: mean awareness = 0.787
- Low construal obstacles: mean awareness = 0.173
- Construal effect (difference): 0.614
- Paper's HGLM result: β=0.133, SE=0.003, χ²(1)=2297.21, p<10⁻¹⁶
- Chi-squared independence test: χ²(1,N=84)=23.03, p=1.6×10⁻⁶, w=0.52

${existingResultsSummary ? `ALREADY COMPUTED FROM SIMULATED DATA:\n${existingResultsSummary}` : ''}

AVAILABLE ANALYSES (only these work with your current data):
${available.map(id => `- "${id}"`).join('\n')}
${nDatasets < 2 ? '\nNOTE: correlation-matrix and exploratory-fa require 2+ tasks. You only have ' + nDatasets + ' task. Do NOT include them.' : '\nParams: correlation-matrix takes {"permutations":N}, exploratory-fa takes {"nFactors":N}'}

RESPONSE FORMAT — you MUST return this exact JSON structure:
{"steps":[{"id":"step-id","params":{}}],"explanation":"brief interpretation of results"}

RULES:
- ALWAYS include steps to run. Do not return empty steps unless ONLY interpreting existing results.
- Do NOT promise analyses you cannot run (e.g., correlation-matrix with 1 task).
- Reference ACTUAL numbers from the "already computed" section when interpreting.
- If the user asks for Python code or custom analysis, include it in the explanation as a code block.
- If asked to compare to the paper, reference specific numbers from both the paper and computed results.
- Be concise but specific. Reference actual numbers.`;
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
          model: 'claude-opus-4-6-20250514',
          max_tokens: 2000,
          system: buildSystemPrompt(taskNames, personaNames, datasets.length,
            // Include ACTUAL data from results, not just type summaries
            existingResults.map((r: any) => {
              if (r.type === 'text') return `${r.title}: ${r.data}`;
              if (r.type === 'table' && r.data?.rows) {
                // Include all rows (Opus can handle the context)
                const allRows = r.data.rows.map((row: any[]) => row.join(' | ')).join('\n');
                return `${r.title} (${r.data.rows.length} rows):\n${r.data.headers?.join(' | ') || ''}\n${allRows}`;
              }
              if (r.type === 'matrix' && r.data?.values) {
                const labels = r.data.labels || [];
                const rows = r.data.values.map((row: number[], i: number) =>
                  `${labels[i] || i}: ${row.map((v: number) => v.toFixed(2)).join(', ')}`
                ).join('\n');
                return `${r.title}:\n${rows}`;
              }
              if (r.type === 'factor-loadings' && r.data?.loadings) {
                const rows = r.data.tasks.map((t: string, i: number) =>
                  `${t}: ${r.data.loadings[i].map((v: number) => v.toFixed(2)).join(', ')}`
                ).join('\n');
                return `${r.title}:\n${rows}\nVariance: ${r.data.varianceExplained?.join('%, ')}%`;
              }
              return `${r.title}: ${JSON.stringify(r.data).slice(0, 200)}`;
            }).join('\n\n'),
            session.paperContext || ''
          ),
          messages: [
            // Include conversation history so Claude has context
            ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: query },
          ],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API returned ${res.status}`);
      }
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      if (!raw) {
        throw new Error('Empty response from analysis agent');
      }

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

      const resultsSummary = results.length > 0
        ? `\n\n📊 ${results.length} analysis result(s) generated below ↓`
        : '';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: (parsed.explanation || 'Analysis complete.') + resultsSummary,
        results: results.length > 0 ? results : undefined,
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Analysis agent error: ${err?.message || 'unknown'}. Check your connection and try again.`,
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
