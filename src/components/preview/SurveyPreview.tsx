import { useState } from 'react';
import { motion } from 'framer-motion';
import type { SurveyParams } from '../../lib/types';

const SAMPLE_ITEMS = [
  'I enjoy trying new things',
  'I often feel anxious in social situations',
  'I prefer to plan ahead rather than be spontaneous',
  'I find it easy to concentrate for long periods',
  'I tend to procrastinate on important tasks',
  'I feel comfortable making decisions under uncertainty',
  'I prefer working alone over working in groups',
  'I am easily distracted by my environment',
  'I enjoy solving complex problems',
  'I often second-guess my decisions',
  'I feel energized after social interactions',
  'I like to have a clear routine',
  'I am comfortable with ambiguity',
  'I tend to think before I act',
  'I prefer concrete facts over abstract ideas',
  'I enjoy creative activities',
  'I feel stressed when things are unorganized',
  'I am good at reading other people\'s emotions',
  'I prefer to take risks rather than play it safe',
  'I find it hard to relax',
];

export function SurveyPreview({ params }: { params: SurveyParams }) {
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const items = SAMPLE_ITEMS.slice(0, params.nItems);
  const isReverseCoded = (idx: number) => params.reverseCodedIndices.includes(idx);
  const answered = Object.keys(responses).length;

  const handleResponse = (itemIdx: number, value: number) => {
    setResponses(prev => ({ ...prev, [itemIdx]: value }));
  };

  if (submitted) {
    const values = Object.values(responses);
    const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '—';
    return (
      <div className="card p-6">
        <h3 className="text-sm font-heading text-text mb-3">📋 your responses</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-3 text-center">
            <div className="text-xs text-text-3">items answered</div>
            <div className="text-lg font-heading text-text">{answered}/{items.length}</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xs text-text-3">mean response</div>
            <div className="text-lg font-heading text-orchid">{avg}</div>
          </div>
        </div>
        <button onClick={() => { setResponses({}); setSubmitted(false); }}
          className="text-xs text-orchid cursor-pointer hover:underline">take again</button>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">📋 survey preview</h3>
        <span className="text-xs font-mono text-text-3">{answered}/{items.length}</span>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
        {items.map((item, idx) => (
          <div key={idx} className={`p-3 rounded-xl border transition-all ${
            responses[idx] !== undefined ? 'border-orchid/15 bg-orchid/3' : 'border-orchid/8'
          }`}>
            <div className="flex items-start gap-2 mb-2">
              <span className="text-[10px] font-mono text-text-4 mt-0.5">{idx + 1}</span>
              <span className="text-sm text-text-2">
                {item}
                {isReverseCoded(idx) && <span className="text-[9px] text-peach ml-1">(R)</span>}
              </span>
            </div>
            <div className="flex gap-1 ml-5">
              {Array.from({ length: params.scalePoints }, (_, i) => i + 1).map(val => (
                <button key={val} onClick={() => handleResponse(idx, val)}
                  className={`w-8 h-8 rounded-lg text-xs font-mono cursor-pointer transition-all border ${
                    responses[idx] === val
                      ? 'bg-orchid/20 border-orchid/30 text-orchid font-semibold'
                      : 'border-orchid/8 text-text-3 hover:border-orchid/20'
                  }`}>
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {answered === items.length && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileHover={{ scale: 1.02 }}
          onClick={() => setSubmitted(true)}
          className="w-full mt-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
          see results
        </motion.button>
      )}
    </div>
  );
}
