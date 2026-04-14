import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getStoredApiKey, setStoredApiKey, clearStoredApiKey } from '../lib/apiKey';

interface Props {
  onClose: () => void;
}

export function ApiKeyModal({ onClose }: Props) {
  const existing = getStoredApiKey();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key must start with sk-ant-');
      return;
    }
    setStoredApiKey(trimmed);
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const handleClear = () => {
    clearStoredApiKey();
    onClose();
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
              your Anthropic key — stored in this browser only
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
            <p className="text-[11px] text-text-3">
              AI features are using your key. Remove it if you want to use a server-configured key instead.
            </p>
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
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-text-3 leading-relaxed">
              Get a key at{' '}
              <span className="font-mono text-orchid">console.anthropic.com</span>.
              It's stored only in this browser's localStorage — never sent anywhere except to Anthropic through this app's proxy.
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
              disabled={!key.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
            >
              save key
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
