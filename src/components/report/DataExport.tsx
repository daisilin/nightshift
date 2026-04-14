import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { getParadigm } from '../../data/taskBank';

export function DataExport() {
  const { state } = useApp();
  const session = state.currentSession;
  if (!session) return null;

  const battery = session.battery ?? [];
  const isBattery = battery.length > 0;
  const datasets = isBattery
    ? battery.filter(t => t.dataset).map(t => ({ paradigmId: t.paradigmId, dataset: t.dataset! }))
    : (session.designReports ?? []).filter(r => r.dataset).map(r => ({ paradigmId: session.paradigmId, dataset: r.dataset! }));

  const hasMazeData = datasets.some(d => d.paradigmId === 'maze-construal');

  // ============================================================
  // CSV EXPORT — clean quantitative data
  // ============================================================
  const exportCSV = () => {
    const hasMaze = datasets.some(d => d.paradigmId === 'maze-construal');

    if (hasMaze) {
      // MAZE-SPECIFIC CSV: matches Ho et al. paper data format
      // One row per participant × obstacle (the paper's unit of analysis)
      const rows = ['participant_id,persona,maze_id,trial,obstacle_label,construal_prob,awareness,is_high_construal,navigation_rt,construal_effect,n_obstacles_noticed'];
      for (const { paradigmId, dataset } of datasets) {
        if (paradigmId !== 'maze-construal') continue;
        for (const p of dataset.participants) {
          for (const t of p.trials) {
            const meta = t.metadata;
            if (!meta?.awarenessScores) continue;
            const nNoticed = meta.obstaclesNoticed?.length ?? 0;
            for (const [label, awareness] of Object.entries(meta.awarenessScores)) {
              const cp = meta.construalProb?.[label] ?? '';
              const isHigh = typeof cp === 'number' ? (cp > 0.45 ? 1 : 0) : '';
              rows.push(`${p.id},${p.personaId},${meta.mazeId ?? ''},${t.trialIndex},${label},${cp},${awareness},${isHigh},${t.rt ?? ''},${meta.construalEffect ?? ''},${nNoticed}`);
            }
          }
        }
      }
      downloadFile(rows.join('\n'), `nightshift-maze-data-${session.id}.csv`, 'text/csv');
    }

    // GENERIC CSV: one row per trial (for all tasks)
    const rows = ['participant_id,persona,task,trial,condition,rt,response,correct'];
    for (const { paradigmId, dataset } of datasets) {
      const taskName = getParadigm(paradigmId)?.name || paradigmId;
      for (const p of dataset.participants) {
        for (const t of p.trials) {
          // Ensure response is always numeric
          const resp = typeof t.response === 'number' ? t.response : '';
          rows.push(`${p.id},${p.personaId},${taskName},${t.trialIndex},${t.condition},${t.rt ?? ''},${resp},${t.correct ?? ''}`);
        }
      }
    }
    downloadFile(rows.join('\n'), `nightshift-data-${session.id}.csv`, 'text/csv');
  };

  // ============================================================
  // JSONL EXPORT — rich data with CoT and metadata
  // ============================================================
  const exportJSONL = () => {
    const lines: string[] = [];
    for (const { paradigmId, dataset } of datasets) {
      const taskName = getParadigm(paradigmId)?.name || paradigmId;
      for (const p of dataset.participants) {
        for (const t of p.trials) {
          lines.push(JSON.stringify({
            participant_id: p.id,
            persona: p.personaId,
            task: taskName,
            paradigm_id: paradigmId,
            trial: t.trialIndex,
            condition: t.condition,
            rt: t.rt,
            response: t.response,
            correct: t.correct,
            // Rich metadata
            ...(t.metadata ? {
              cot: t.metadata.cot || undefined,
              maze_id: t.metadata.mazeId || undefined,
              awareness_scores: t.metadata.awarenessScores || undefined,
              construal_prob: t.metadata.construalProb || undefined,
              obstacles_noticed: t.metadata.obstaclesNoticed || undefined,
              construal_effect: t.metadata.construalEffect || undefined,
              navigation_path: t.metadata.navigationPath || undefined,
              confidence: t.metadata.confidence || undefined,
              strategy: t.metadata.strategy || undefined,
              mean_high_awareness: t.metadata.meanHighAwareness || undefined,
              mean_low_awareness: t.metadata.meanLowAwareness || undefined,
            } : {}),
          }));
        }
      }
    }
    downloadFile(lines.join('\n'), `nightshift-rich-${session.id}.jsonl`, 'application/jsonl');
  };

  // ============================================================
  // JSON EXPORT — full session with metadata
  // ============================================================
  const exportJSON = () => {
    const data = {
      session: {
        id: session.id,
        brief: session.brief,
        paradigmIds: session.paradigmIds,
        personaIds: session.personaIds,
        simulationMode: session.simulationMode,
        round: session.round,
        createdAt: session.createdAt,
      },
      datasets: datasets.map(({ paradigmId, dataset }) => ({
        task: getParadigm(paradigmId)?.name || paradigmId,
        paradigmId,
        nParticipants: dataset.participants.length,
        masterSeed: dataset.masterSeed,
        participants: dataset.participants.map(p => ({
          id: p.id,
          persona: p.personaId,
          nTrials: p.trials.length,
          trials: p.trials,
        })),
      })),
      analysisResults: session.analysisResults,
      paperContext: session.paperContext,
    };
    downloadFile(JSON.stringify(data, null, 2), `nightshift-full-${session.id}.json`, 'application/json');
  };

  // ============================================================
  // PYTHON SCRIPT — analysis code matching the paper
  // ============================================================
  const generatePythonCode = () => {
    const taskNames = datasets.map(d => getParadigm(d.paradigmId)?.name || d.paradigmId);
    const code = `# nightshift data analysis
# Generated from session: ${session.brief}
# Tasks: ${taskNames.join(', ')}

import pandas as pd
import numpy as np
from scipy import stats
import json

# === Load Data ===
# Option 1: Clean CSV (quantitative only)
df = pd.read_csv('nightshift-data-${session.id}.csv')
print(f"Loaded {len(df)} trials from {df['participant_id'].nunique()} participants")

# Option 2: Rich JSONL (includes CoT, awareness scores, metadata)
rich_data = []
with open('nightshift-rich-${session.id}.jsonl') as f:
    for line in f:
        rich_data.append(json.loads(line))
rich_df = pd.DataFrame(rich_data)
print(f"Rich data: {len(rich_df)} trials with metadata")
${hasMazeData ? `
# === MAZE-CONSTRUAL ANALYSIS (Ho et al. replication) ===
maze_df = pd.read_csv('nightshift-maze-data-${session.id}.csv')
print(f"\\nMaze data: {len(maze_df)} obstacle-level observations")

# Construal Effect: High vs Low awareness
high = maze_df[maze_df['is_high_construal'] == 1]['awareness']
low = maze_df[maze_df['is_high_construal'] == 0]['awareness']
print(f"\\n=== Construal Effect ===")
print(f"High construal awareness: {high.mean():.3f} (SD={high.std():.3f})")
print(f"Low construal awareness:  {low.mean():.3f} (SD={low.std():.3f})")
print(f"Difference (construal effect): {high.mean() - low.mean():.3f}")
print(f"Paper benchmark: 0.787 - 0.173 = 0.614")

# Statistical test
t_stat, p_val = stats.ttest_ind(high, low)
d = abs(high.mean() - low.mean()) / np.sqrt((high.std()**2 + low.std()**2) / 2)
print(f"t = {t_stat:.2f}, p = {p_val:.2e}, Cohen's d = {d:.3f}")

# Per-maze construal effect
print(f"\\n=== Per-Maze Construal Effect ===")
for maze_id in maze_df['maze_id'].unique():
    m = maze_df[maze_df['maze_id'] == maze_id]
    h = m[m['is_high_construal'] == 1]['awareness'].mean()
    l = m[m['is_high_construal'] == 0]['awareness'].mean()
    print(f"  {maze_id}: high={h:.3f}, low={l:.3f}, effect={h-l:.3f}")

# Awareness by construal probability (continuous)
print(f"\\n=== Awareness ~ Construal Probability ===")
r, p = stats.pearsonr(maze_df['construal_prob'].astype(float), maze_df['awareness'].astype(float))
print(f"Pearson r = {r:.3f}, p = {p:.2e}")

# Chain-of-thought analysis
if 'cot' in rich_df.columns:
    maze_rich = rich_df[rich_df['paradigm_id'] == 'maze-construal']
    cot_lengths = maze_rich['cot'].dropna().apply(len)
    print(f"\\n=== Chain-of-Thought Statistics ===")
    print(f"Mean CoT length: {cot_lengths.mean():.0f} chars")
    print(f"CoT range: {cot_lengths.min():.0f} - {cot_lengths.max():.0f} chars")
` : ''}
# === Descriptive Statistics ===
print("\\n=== Descriptive Statistics ===")
for task in df['task'].unique():
    task_df = df[df['task'] == task]
    if task_df['rt'].notna().any():
        print(f"\\n{task}:")
        print(f"  Mean RT: {task_df['rt'].mean():.0f} ms (SD={task_df['rt'].std():.0f})")
        if task_df['correct'].notna().any():
            print(f"  Accuracy: {task_df['correct'].mean():.1%}")
        for cond in task_df['condition'].unique():
            cond_df = task_df[task_df['condition'] == cond]
            print(f"  {cond}: M={cond_df['rt'].mean():.0f}, SD={cond_df['rt'].std():.0f}")

# === Effect Sizes ===
print("\\n=== Condition Effect Sizes ===")
for task in df['task'].unique():
    task_df = df[df['task'] == task]
    conditions = task_df['condition'].unique()
    if len(conditions) >= 2 and task_df['rt'].notna().any():
        g1 = task_df[task_df['condition'] == conditions[0]]['rt'].dropna()
        g2 = task_df[task_df['condition'] == conditions[-1]]['rt'].dropna()
        pooled_sd = np.sqrt((g1.std()**2 + g2.std()**2) / 2)
        d = abs(g1.mean() - g2.mean()) / pooled_sd if pooled_sd > 0 else 0
        t_stat, p_val = stats.ttest_ind(g1, g2)
        print(f"  {task}: d={d:.3f}, t={t_stat:.2f}, p={p_val:.4f}")

${datasets.length >= 2 ? `
# === Cross-Task Correlations ===
print("\\n=== Cross-Task Correlations ===")
participant_scores = {}
for task in df['task'].unique():
    task_df = df[df['task'] == task]
    scores = task_df.groupby('participant_id')['rt'].mean()
    participant_scores[task] = scores

score_df = pd.DataFrame(participant_scores).dropna()
corr = score_df.corr()
print(corr.round(3))
` : ''}

print("\\n=== Export complete ===")
`;

    downloadFile(code, `nightshift-analysis-${session.id}.py`, 'text/python');
  };

  const totalTrials = datasets.reduce((sum, d) => sum + d.dataset.participants.reduce((s, p) => s + p.trials.length, 0), 0);
  const hasCot = datasets.some(d => d.dataset.participants.some(p => p.trials.some(t => t.metadata?.cot)));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">export data</h3>
        <span className="text-[10px] text-text-3">
          {datasets.length} task(s) · {totalTrials.toLocaleString()} trials
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportCSV}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
          download CSV{hasMazeData ? ' (+ maze-specific)' : ''}
        </motion.button>
        {hasCot && (
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportJSONL}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
            download JSONL (with CoT)
          </motion.button>
        )}
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportJSON}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
          download JSON (full)
        </motion.button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={generatePythonCode}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
          download Python analysis
        </motion.button>
      </div>
      <p className="text-[9px] text-text-4 mt-2">
        CSV: clean quantitative data{hasMazeData ? ' + maze obstacle-level awareness data' : ''}
        {hasCot ? ' · JSONL: rich data with chain-of-thought' : ''}
        · JSON: full session · Python: analysis scripts{hasMazeData ? ' (includes Ho et al. replication code)' : ''}
      </p>
    </div>
  );
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
