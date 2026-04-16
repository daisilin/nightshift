/**
 * TASK-SPECIFIC ANALYSIS STEPS
 *
 * Analysis steps that extract DVs from task-specific metadata:
 * - WCST: perseverative errors, categories completed, rule-switch accuracy
 * - Two-Step: model-based index, stay probabilities by condition
 *
 * These complement the generic analysis steps (descriptive stats, etc.)
 * by reading metadata that multi-turn tasks embed in trial data.
 */

import type { AnalysisStepDef, AnalysisInput, AnalysisResult, TableData } from './types';

// ============================================================
// WCST ANALYSIS
// ============================================================

export const wcstAnalysis: AnalysisStepDef = {
  id: 'wcst-analysis',
  name: 'WCST Perseverative Errors',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const wcstDesignIdx = input.designs.findIndex(d => d.paradigmId === 'wcst');
    if (wcstDesignIdx < 0) {
      return { stepId: 'wcst-analysis', type: 'text', title: 'WCST Analysis', data: 'No WCST data found.' };
    }

    const dataset = input.datasets[wcstDesignIdx];
    if (!dataset) {
      return { stepId: 'wcst-analysis', type: 'text', title: 'WCST Analysis', data: 'No WCST dataset.' };
    }

    const rows: (string | number)[][] = [];
    let totalPersErrors = 0;
    let totalErrors = 0;
    let totalCategories = 0;
    let n = 0;

    for (const p of dataset.participants) {
      // Extract WCST metrics from trial metadata
      const wcstTrials = p.trials.filter(t => t.metadata?.perseverative !== undefined);
      if (wcstTrials.length === 0) continue;

      const persErrors = wcstTrials.filter(t => t.metadata?.perseverative === true).length;
      const errors = wcstTrials.filter(t => !t.correct).length;
      const categories = wcstTrials[0]?.metadata?.categoriesCompleted ?? 0;
      const accuracy = ((wcstTrials.length - errors) / wcstTrials.length * 100).toFixed(1);

      rows.push([p.id, wcstTrials.length, persErrors, errors, categories, `${accuracy}%`]);
      totalPersErrors += persErrors;
      totalErrors += errors;
      totalCategories += categories;
      n++;
    }

    if (n === 0) {
      return { stepId: 'wcst-analysis', type: 'text', title: 'WCST Analysis', data: 'No WCST trial metadata found.' };
    }

    // Add summary row
    rows.push([
      'MEAN', '-',
      (totalPersErrors / n).toFixed(1),
      (totalErrors / n).toFixed(1),
      (totalCategories / n).toFixed(1),
      '-',
    ]);

    const tableData: TableData = {
      headers: ['Participant', 'Trials', 'Perseverative Errors', 'Total Errors', 'Categories', 'Accuracy'],
      rows,
    };

    return {
      stepId: 'wcst-analysis',
      type: 'table',
      title: 'WCST — Perseverative Errors & Cognitive Flexibility',
      data: tableData,
      interpretation: `Mean perseverative errors: ${(totalPersErrors / n).toFixed(1)} (Lin & Ma reference: ~2.45). `
        + `Mean categories completed: ${(totalCategories / n).toFixed(1)}/6. `
        + `Perseverative errors reflect difficulty inhibiting a previously correct sorting rule after an unannounced rule change.`,
    };
  },
};

// ============================================================
// TWO-STEP ANALYSIS
// ============================================================

export const twoStepAnalysis: AnalysisStepDef = {
  id: 'two-step-analysis',
  name: 'Two-Step Model-Based Index',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const tsDesignIdx = input.designs.findIndex(d => d.paradigmId === 'two-step');
    if (tsDesignIdx < 0) {
      return { stepId: 'two-step-analysis', type: 'text', title: 'Two-Step Analysis', data: 'No Two-Step data found.' };
    }

    const dataset = input.datasets[tsDesignIdx];
    if (!dataset) {
      return { stepId: 'two-step-analysis', type: 'text', title: 'Two-Step Analysis', data: 'No Two-Step dataset.' };
    }

    const rows: (string | number)[][] = [];
    const allStayProbs: { cr: number[]; cn: number[]; rr: number[]; rn: number[] } = { cr: [], cn: [], rr: [], rn: [] };

    for (const p of dataset.participants) {
      const tsTrials = p.trials.filter(t => t.metadata?.transition !== undefined);
      if (tsTrials.length === 0) continue;

      // Extract model-based metrics from metadata
      const mbIndex = tsTrials[0]?.metadata?.modelBasedIndex ?? 0;
      const cr = tsTrials[0]?.metadata?.stayProbabilities?.cr ?? 0;
      const cn = tsTrials[0]?.metadata?.stayProbabilities?.cn ?? 0;
      const rr = tsTrials[0]?.metadata?.stayProbabilities?.rr ?? 0;
      const rn = tsTrials[0]?.metadata?.stayProbabilities?.rn ?? 0;
      const rewardRate = tsTrials.filter(t => t.correct).length / tsTrials.length;

      rows.push([
        p.id,
        typeof mbIndex === 'number' ? mbIndex.toFixed(3) : '0.000',
        typeof cr === 'number' ? cr.toFixed(2) : '-',
        typeof cn === 'number' ? cn.toFixed(2) : '-',
        typeof rr === 'number' ? rr.toFixed(2) : '-',
        typeof rn === 'number' ? rn.toFixed(2) : '-',
        (rewardRate * 100).toFixed(1) + '%',
      ]);

      if (typeof cr === 'number') allStayProbs.cr.push(cr);
      if (typeof cn === 'number') allStayProbs.cn.push(cn);
      if (typeof rr === 'number') allStayProbs.rr.push(rr);
      if (typeof rn === 'number') allStayProbs.rn.push(rn);
    }

    const mean = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const tableData: TableData = {
      headers: ['Participant', 'MB Index', 'Stay(C+R)', 'Stay(C+NR)', 'Stay(R+R)', 'Stay(R+NR)', 'Reward Rate'],
      rows,
    };

    // Model-based signature: interaction between transition and reward on stay probability
    const mbInteraction = (mean(allStayProbs.cr) - mean(allStayProbs.cn)) - (mean(allStayProbs.rr) - mean(allStayProbs.rn));

    return {
      stepId: 'two-step-analysis',
      type: 'table',
      title: 'Two-Step Task — Model-Based Control',
      data: tableData,
      interpretation: `Mean MB index: ${mbInteraction.toFixed(3)}. `
        + `Model-based agents show higher stay after common+reward than rare+reward (transition×reward interaction). `
        + `Positive MB index = model-based; ~0 = model-free; negative = confused. `
        + `Lin & Ma reference: mean model-based weight ≈ 2.16 (different scale — their index is from full RL model fit).`,
    };
  },
};

// ============================================================
// TOL ANALYSIS
// ============================================================

export const tolAnalysis: AnalysisStepDef = {
  id: 'tol-analysis',
  name: 'Tower of London Performance',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const idx = input.designs.findIndex(d => d.paradigmId === 'tower-of-london');
    if (idx < 0) return { stepId: 'tol-analysis', type: 'text', title: 'TOL Analysis', data: 'No TOL data.' };

    const dataset = input.datasets[idx];
    if (!dataset) return { stepId: 'tol-analysis', type: 'text', title: 'TOL Analysis', data: 'No TOL dataset.' };

    const rows: (string | number)[][] = [];
    for (const p of dataset.participants) {
      const tolTrials = p.trials.filter(t => t.metadata?.weightedScore !== undefined);
      if (tolTrials.length === 0) continue;
      const ws = tolTrials[0]?.metadata?.weightedScore ?? 0;
      const propOpt = tolTrials[0]?.metadata?.proportionOptimal ?? 0;
      const propSolved = tolTrials[0]?.metadata?.proportionSolved ?? 0;
      rows.push([p.id, ws, (propOpt * 100).toFixed(1) + '%', (propSolved * 100).toFixed(1) + '%']);
    }

    return {
      stepId: 'tol-analysis', type: 'table',
      title: 'Tower of London — Weighted Performance Score',
      data: { headers: ['Participant', 'Weighted Score', '% Optimal', '% Solved'], rows },
      interpretation: `Lin & Ma reference: mean weighted score = 56.85. TOL loaded 0.63 on visuospatial factor.`,
    };
  },
};

// ============================================================
// N-BACK ANALYSIS
// ============================================================

export const nbackAnalysis: AnalysisStepDef = {
  id: 'nback-analysis',
  name: 'N-back d-prime',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const idx = input.designs.findIndex(d => d.paradigmId === 'n-back');
    if (idx < 0) return { stepId: 'nback-analysis', type: 'text', title: 'N-back Analysis', data: 'No N-back data.' };

    const dataset = input.datasets[idx];
    if (!dataset) return { stepId: 'nback-analysis', type: 'text', title: 'N-back Analysis', data: 'No dataset.' };

    const rows: (string | number)[][] = [];
    for (const p of dataset.participants) {
      const nbTrials = p.trials.filter(t => t.metadata?.dPrime !== undefined);
      if (nbTrials.length === 0) continue;
      const dp = nbTrials[0]?.metadata?.dPrime ?? 0;
      const hr = nbTrials[0]?.metadata?.hitRate ?? 0;
      const far = nbTrials[0]?.metadata?.falseAlarmRate ?? 0;
      rows.push([p.id, typeof dp === 'number' ? dp.toFixed(2) : '0', typeof hr === 'number' ? hr.toFixed(2) : '-', typeof far === 'number' ? far.toFixed(2) : '-']);
    }

    return {
      stepId: 'nback-analysis', type: 'table',
      title: 'N-back — Signal Detection (d\')',
      data: { headers: ['Participant', 'd\'', 'Hit Rate', 'FA Rate'], rows },
      interpretation: `Lin & Ma reference: CDT d' = 1.80. N-back loaded 0.70 on working memory factor.`,
    };
  },
};

// ============================================================
// CORSI ANALYSIS
// ============================================================

export const corsiAnalysis: AnalysisStepDef = {
  id: 'corsi-analysis',
  name: 'Corsi Block Score',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const idx = input.designs.findIndex(d => d.paradigmId === 'corsi-block');
    if (idx < 0) return { stepId: 'corsi-analysis', type: 'text', title: 'Corsi Analysis', data: 'No Corsi data.' };

    const dataset = input.datasets[idx];
    if (!dataset) return { stepId: 'corsi-analysis', type: 'text', title: 'Corsi Analysis', data: 'No dataset.' };

    const rows: (string | number)[][] = [];
    for (const p of dataset.participants) {
      const cTrials = p.trials.filter(t => t.metadata?.corsiScore !== undefined);
      if (cTrials.length === 0) continue;
      const score = cTrials[0]?.metadata?.corsiScore ?? 0;
      const maxSpan = cTrials[0]?.metadata?.maxSpan ?? 0;
      rows.push([p.id, score, maxSpan]);
    }

    return {
      stepId: 'corsi-analysis', type: 'table',
      title: 'Corsi Block — Spatial Working Memory',
      data: { headers: ['Participant', 'Corsi Score', 'Max Span'], rows },
      interpretation: `Lin & Ma reference: mean Corsi score = 53.5. Corsi loaded 0.78 on working memory factor.`,
    };
  },
};

// ============================================================
// FIAR ANALYSIS
// ============================================================

export const fiarAnalysis: AnalysisStepDef = {
  id: 'fiar-analysis',
  name: 'Four-in-a-Row Performance',
  category: 'effect',
  requires: 'any',

  execute(input: AnalysisInput): AnalysisResult {
    const idx = input.designs.findIndex(d => d.paradigmId === 'four-in-a-row');
    if (idx < 0) return { stepId: 'fiar-analysis', type: 'text', title: 'FIAR Analysis', data: 'No FIAR data.' };

    const dataset = input.datasets[idx];
    if (!dataset) return { stepId: 'fiar-analysis', type: 'text', title: 'FIAR Analysis', data: 'No dataset.' };

    const rows: (string | number)[][] = [];
    for (const p of dataset.participants) {
      const fTrials = p.trials.filter(t => t.metadata?.winRate !== undefined);
      if (fTrials.length === 0) continue;
      const wr = fTrials[0]?.metadata?.winRate ?? 0;
      const perf = fTrials[0]?.metadata?.performanceScore ?? 0;
      const w = fTrials[0]?.metadata?.wins ?? 0;
      const l = fTrials[0]?.metadata?.losses ?? 0;
      rows.push([p.id, typeof perf === 'number' ? perf.toFixed(1) : '0', (typeof wr === 'number' ? wr * 100 : 0).toFixed(0) + '%', w, l]);
    }

    return {
      stepId: 'fiar-analysis', type: 'table',
      title: 'Four-in-a-Row — Game Performance',
      data: { headers: ['Participant', 'Perf Score', 'Win Rate', 'Wins', 'Losses'], rows },
      interpretation: `Lin & Ma reference: mean Elo = -2.79. FIAR loaded 0.67 on working memory factor.`,
    };
  },
};
