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

  const exportCSV = () => {
    const rows = ['participant_id,persona,task,trial,condition,rt,response,correct'];
    for (const { paradigmId, dataset } of datasets) {
      const taskName = getParadigm(paradigmId)?.name || paradigmId;
      for (const p of dataset.participants) {
        for (const t of p.trials) {
          rows.push(`${p.id},${p.personaId},${taskName},${t.trialIndex},${t.condition},${t.rt ?? ''},${t.response},${t.correct ?? ''}`);
        }
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nightshift-data-${session.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nightshift-full-${session.id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const generatePythonCode = () => {
    const taskNames = datasets.map(d => getParadigm(d.paradigmId)?.name || d.paradigmId);
    const code = `# nightshift data analysis
# Generated from session: ${session.brief}
# Tasks: ${taskNames.join(', ')}

import pandas as pd
import numpy as np
from scipy import stats
import json

# Load the exported data
with open('nightshift-full-${session.id}.json') as f:
    data = json.load(f)

# Convert to DataFrame
rows = []
for ds in data['datasets']:
    for p in ds['participants']:
        for t in p['trials']:
            rows.append({
                'participant': p['id'],
                'persona': p['persona'],
                'task': ds['task'],
                'trial': t['trialIndex'],
                'condition': t['condition'],
                'rt': t.get('rt'),
                'response': t['response'],
                'correct': t.get('correct'),
            })
df = pd.DataFrame(rows)
print(f"Loaded {len(df)} trials from {df['participant'].nunique()} participants")

# --- Descriptive Statistics ---
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

# --- Effect Sizes ---
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
# --- Cross-Task Correlations ---
print("\\n=== Cross-Task Correlations ===")
participant_scores = {}
for task in df['task'].unique():
    task_df = df[df['task'] == task]
    scores = task_df.groupby('participant')['rt'].mean()
    participant_scores[task] = scores

score_df = pd.DataFrame(participant_scores).dropna()
corr = score_df.corr()
print(corr.round(3))

# --- Factor Analysis (requires factor_analyzer) ---
try:
    from factor_analyzer import FactorAnalyzer
    fa = FactorAnalyzer(n_factors=min(3, len(score_df.columns)), rotation='varimax')
    fa.fit(score_df)
    loadings = pd.DataFrame(fa.loadings_, index=score_df.columns,
                           columns=[f'Factor {i+1}' for i in range(fa.loadings_.shape[1])])
    print("\\n=== Factor Loadings (Varimax) ===")
    print(loadings.round(3))
    print(f"Variance explained: {fa.get_factor_variance()[1].round(3)}")
except ImportError:
    print("Install factor_analyzer: pip install factor_analyzer")
` : ''}

# --- HGLM (for paper comparison) ---
# Requires R + lme4. Use rpy2:
# from rpy2.robjects import r, pandas2ri
# pandas2ri.activate()
# r_df = pandas2ri.py2rpy(df)
# r('library(lme4)')
# r('model <- lmer(response ~ construal_prob + (1|participant) + (1|maze), data=df)')

print("\\n=== Export complete ===")
print(f"To run HGLM (paper's analysis), use R with lme4.")
print(f"Data saved as CSV for further analysis.")
`;

    const blob = new Blob([code], { type: 'text/python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nightshift-analysis-${session.id}.py`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalTrials = datasets.reduce((sum, d) => sum + d.dataset.participants.reduce((s, p) => s + p.trials.length, 0), 0);

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
          📄 download CSV
        </motion.button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={exportJSON}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
          📦 download JSON (full)
        </motion.button>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={generatePythonCode}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5">
          🐍 download Python analysis
        </motion.button>
      </div>
      <p className="text-[9px] text-text-4 mt-2">
        CSV for spreadsheets · JSON for programmatic access · Python includes descriptive stats, effect sizes{datasets.length >= 2 ? ', correlations, factor analysis' : ''}, and HGLM setup
      </p>
    </div>
  );
}
