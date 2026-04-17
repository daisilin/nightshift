import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getStoredApiKey, setStoredApiKey, clearStoredApiKey, detectAvailableModels, getAvailableModels } from '../lib/apiKey';

interface Props {
  onClose: () => void;
}

export function ApiKeyModal({ onClose }: Props) {
  const existing = getStoredApiKey();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [models, setModels] = useState<string[]>(getAvailableModels());

  // Detect models when modal opens with existing key
  useEffect(() => {
    if (existing && models.length === 0) {
      setDetecting(true);
      detectAvailableModels().then(m => { setModels(m); setDetecting(false); });
    }
  }, [existing]);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-');
      return;
    }
    setStoredApiKey(trimmed);
    setSaved(true);
    // Detect available models for the new key
    setDetecting(true);
    const detected = await detectAvailableModels();
    setModels(detected);
    setDetecting(false);
    if (detected.length === 0) {
      setError('Key saved but no models accessible. Check your Anthropic plan.');
      setSaved(false);
      return;
    }
    setTimeout(onClose, 1200);
  };

  const handleClear = () => {
    clearStoredApiKey();
    setModels([]);
    onClose();
  };

  const modelLabel = (id: string) => {
    if (id.includes('sonnet-4-6')) return 'Sonnet 4.6';
    if (id.includes('sonnet-4-5')) return 'Sonnet 4.5';
    if (id.includes('sonnet-4-2')) return 'Sonnet 4';
    if (id.includes('3-7-sonnet')) return 'Sonnet 3.7';
    if (id.includes('3-5-sonnet')) return 'Sonnet 3.5';
    if (id.includes('3-5-haiku')) return 'Haiku 3.5';
    return id.split('-').slice(1, 4).join(' ');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 border border-orchid/10"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-heading text-text">API key</h2>
            <p className="text-[11px] text-text-3 mt-0.5">
              your Anthropic key — calls API directly from your browser
            </p>
          </div>
          <button onClick={onClose} className="text-text-4 hover:text-text cursor-pointer text-lg leading-none">×</button>
        </div>

        {existing && !saved ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-sage/10 border border-sage/20 px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs font-mono text-text-2">
                sk-ant-···{existing.slice(-8)}
              </span>
              <span className="text-[10px] text-sage">active</span>
            </div>

            {/* Available models */}
            <div>
              <p className="text-[10px] text-text-3 mb-1">available models:</p>
              {detecting ? (
                <p className="text-[10px] text-text-4 italic">detecting...</p>
              ) : models.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {models.map((m, i) => (
                    <span key={m} className={`px-2 py-0.5 rounded text-[9px] ${i === 0 ? 'bg-sage/15 text-sage border border-sage/20' : 'bg-surface-2/50 text-text-3'}`}>
                      {modelLabel(m)}{i === 0 ? ' (primary)' : ''}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-red-400">
                  no models detected —{' '}
                  <button onClick={() => { setDetecting(true); detectAvailableModels().then(m => { setModels(m); setDetecting(false); }); }}
                    className="underline cursor-pointer">retry</button>
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClear}
                className="flex-1 py-2 rounded-xl text-xs text-text-3 border border-orchid/15 hover:bg-red-50 hover:text-red-500 hover:border-red-200 cursor-pointer transition-colors"
              >
                remove key
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
              >
                done
              </button>
            </div>
          </div>
        ) : saved ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">✓</div>
            <p className="text-sm text-sage">key saved</p>
            {detecting ? (
              <p className="text-[10px] text-text-3 mt-1">detecting available models...</p>
            ) : models.length > 0 ? (
              <div className="mt-2">
                <p className="text-[10px] text-text-3">using: <strong>{modelLabel(models[0])}</strong></p>
                {models.length > 1 && (
                  <p className="text-[9px] text-text-4">+{models.length - 1} more available</p>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-text-3 leading-relaxed">
              Get a key at{' '}
              <span className="font-mono text-orchid">console.anthropic.com</span>.
              It's stored only in this browser — calls go directly to Anthropic, never through our server.
            </p>
            <input
              type="password"
              value={key}
              onChange={e => { setKey(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="sk-ant-..."
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl text-sm font-mono border border-orchid/15 bg-white text-text focus:outline-none focus:border-orchid/40"
            />
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <button
              onClick={handleSave}
              disabled={!key.trim() || detecting}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
            >
              {detecting ? 'detecting models...' : 'save key'}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
