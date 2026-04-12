import { motion } from 'framer-motion';
import type { PeerReview } from '../../context/types';
import { staggerItem } from '../../lib/animations';

const verdictColors: Record<string, { bg: string; text: string }> = {
  'accept': { bg: '#8FB89A20', text: '#8FB89A' },
  'minor-revisions': { bg: '#8BACD420', text: '#8BACD4' },
  'major-revisions': { bg: '#E8A87C20', text: '#E8A87C' },
  'reject': { bg: '#D47B7B20', text: '#D47B7B' },
};

export function PeerReviewCard({ review }: { review: PeerReview }) {
  const vc = verdictColors[review.verdict] || verdictColors['major-revisions'];

  return (
    <motion.div variants={staggerItem} className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">📝 peer review (simulated)</h3>
        <span className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: vc.bg, color: vc.text }}>
          {review.verdict}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <h4 className="text-xs font-semibold text-sage mb-2">strengths</h4>
          <ul className="space-y-1">
            {review.strengths.map((s, i) => (
              <li key={i} className="text-xs text-text-2 pl-2 border-l-2 border-sage/30">{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-peach mb-2">weaknesses</h4>
          <ul className="space-y-1">
            {review.weaknesses.map((w, i) => (
              <li key={i} className="text-xs text-text-2 pl-2 border-l-2 border-peach/30">{w}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-orchid mb-2">suggestions</h4>
          <ul className="space-y-1">
            {review.suggestions.map((s, i) => (
              <li key={i} className="text-xs text-text-2 pl-2 border-l-2 border-orchid/30">{s}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-text-4">
        <span>reviewer confidence: {Math.round(review.confidence * 100)}%</span>
        <span>·</span>
        <span className="italic">simulated review — not a real peer evaluation</span>
      </div>
    </motion.div>
  );
}
