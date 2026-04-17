import { useState } from 'react';
import { motion } from 'framer-motion';
import { taskBank } from '../data/taskBank';
import { personaBank } from '../data/personaBank';
import type { ExtractedDesign, Confidence } from './PaperUpload';

interface Props {
  extracted: ExtractedDesign;
  onConfirm: (corrected: ExtractedDesign) => void;
  onCancel: () => void;
}

function confidencePill(c: Confidence) {
  const styles: Record<Confidence, string> = {
    high: 'bg-sage/15 border-sage/30 text-sage',
    medium: 'bg-amber-50 border-amber-300 text-amber-700',
    low: 'bg-red-50 border-red-300 text-red-600',
  };
  const label: Record<Confidence, string> = {
    high: 'high confidence',
    medium: 'check this',
    low: 'likely wrong',
  };
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${styles[c]}`}>
      {label[c]}
    </span>
  );
}

export function ExtractionReview({ extracted, onConfirm, onCancel }: Props) {
  const [title, setTitle] = useState(extracted.paperTitle);
  const [brief, setBrief] = useState(extracted.brief);
  const [paradigmIds, setParadigmIds] = useState<string[]>(extracted.paradigmIds);
  const [personaIds, setPersonaIds] = useState<string[]>(extracted.personaIds);

  const conf = extracted.confidence || { paperTitle: 'medium', brief: 'medium', paradigmIds: 'medium', personaIds: 'medium' };
  const evi = extracted.evidence || { paperTitle: '', brief: '', paradigmIds: '', personaIds: '' };

  const toggleTask = (id: string) =>
    setParadigmIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  const togglePersona = (id: string) =>
    setPersonaIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const anyLow = Object.values(conf).some(c => c === 'low');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-orchid/20 bg-gradient-to-br from-orchid/5 to-peach/5 p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-orchid uppercase tracking-wider">
          did i get this right?
        </span>
        <span className="text-[9px] text-text-4">fix anything that's off before we continue</span>
      </div>

      {anyLow && (
        <div className="text-[11px] px-2 py-1 rounded border-l-2 border-red-300 bg-red-50/50 text-red-700">
          ⚠ at least one field is low-confidence. please review.
        </div>
      )}

      {/* Title */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-3 uppercase">paper title</span>
          {confidencePill(conf.paperTitle)}
        </div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full px-2 py-1.5 rounded-lg text-sm border border-orchid/10 bg-white text-text focus:outline-none focus:border-orchid/30"
        />
        {evi.paperTitle && (
          <p className="text-[10px] text-text-4 italic">evidence: "{evi.paperTitle}"</p>
        )}
      </div>

      {/* Brief */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-3 uppercase">research brief</span>
          {confidencePill(conf.brief)}
        </div>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 rounded-lg text-sm border border-orchid/10 bg-white text-text resize-none focus:outline-none focus:border-orchid/30"
        />
        {evi.brief && (
          <p className="text-[10px] text-text-4 italic">evidence: "{evi.brief}"</p>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-3 uppercase">tasks detected ({paradigmIds.length})</span>
          {confidencePill(conf.paradigmIds)}
        </div>
        <div className="flex flex-wrap gap-1">
          {taskBank.map(t => {
            const on = paradigmIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleTask(t.id)}
                className={`px-2 py-0.5 rounded text-[10px] cursor-pointer border transition-colors ${
                  on
                    ? 'bg-orchid/15 border-orchid/40 text-text'
                    : 'border-orchid/10 text-text-4 hover:bg-orchid/5'
                }`}
              >
                {t.emoji} {t.name}
              </button>
            );
          })}
        </div>
        {evi.paradigmIds && (
          <p className="text-[10px] text-text-4 italic">evidence: "{evi.paradigmIds}"</p>
        )}
      </div>

      {/* Personas */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-text-3 uppercase">population ({personaIds.length})</span>
          {confidencePill(conf.personaIds)}
        </div>
        <div className="flex flex-wrap gap-1">
          {personaBank.map(p => {
            const on = personaIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePersona(p.id)}
                className={`px-2 py-0.5 rounded text-[10px] cursor-pointer border transition-colors ${
                  on
                    ? 'bg-orchid/15 border-orchid/40 text-text'
                    : 'border-orchid/10 text-text-4 hover:bg-orchid/5'
                }`}
              >
                {p.emoji} {p.name}
              </button>
            );
          })}
        </div>
        {evi.personaIds && (
          <p className="text-[10px] text-text-4 italic">evidence: "{evi.personaIds}"</p>
        )}
      </div>

      {extracted.keyDetails && (
        <div className="text-[11px] text-text-3 italic border-l-2 border-orchid/20 pl-2">
          {extracted.keyDetails}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onConfirm({
            ...extracted,
            paperTitle: title,
            brief,
            paradigmIds,
            paradigmId: paradigmIds[0] || extracted.paradigmId,
            personaIds,
          })}
          disabled={paradigmIds.length === 0}
          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          looks right → continue
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-[11px] text-text-3 cursor-pointer hover:text-text-2 border border-orchid/10"
        >
          re-upload
        </motion.button>
      </div>
    </motion.div>
  );
}
