import type {
  MetricResult, MetricInterpretation, PilotMetrics, PersonaMetrics,
  ExperimentDesign, SimulatedDataset, SimulatedParticipant,
} from './types';

// ============================================================
// BASIC STATISTICS
// ============================================================

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSq = values.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ============================================================
// EFFECT SIZES
// ============================================================

export function cohensD(group1: number[], group2: number[]): MetricResult {
  const m1 = mean(group1);
  const m2 = mean(group2);
  const sd1 = standardDeviation(group1);
  const sd2 = standardDeviation(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  const pooledSd = Math.sqrt(((n1 - 1) * sd1 ** 2 + (n2 - 1) * sd2 ** 2) / (n1 + n2 - 2));
  const d = pooledSd > 0 ? (m1 - m2) / pooledSd : 0;
  const absD = Math.abs(d);

  return {
    name: "Cohen's d",
    value: Math.round(absD * 100) / 100,
    unit: 'effect size',
    interpretation: interpretEffectSize(absD),
    ci: null,
    flag: absD < 0.2 ? 'insufficient-power' : null,
  };
}

export function interpretEffectSize(d: number): MetricInterpretation {
  if (d >= 0.8) return 'excellent';
  if (d >= 0.5) return 'good';
  if (d >= 0.3) return 'acceptable';
  if (d >= 0.2) return 'poor';
  return 'problematic';
}

// ============================================================
// CONFIDENCE INTERVALS
// ============================================================

// t-values for 95% CI, key df values
const T_TABLE: Record<number, number> = {
  5: 2.571, 10: 2.228, 15: 2.131, 20: 2.086, 25: 2.060,
  30: 2.042, 40: 2.021, 50: 2.009, 60: 2.000, 100: 1.984,
};

function tValue(df: number): number {
  const keys = Object.keys(T_TABLE).map(Number).sort((a, b) => a - b);
  for (const k of keys) {
    if (df <= k) return T_TABLE[k];
  }
  return 1.96; // large sample approximation
}

export function confidenceInterval(values: number[]): [number, number] {
  if (values.length < 2) return [0, 0];
  const m = mean(values);
  const se = standardDeviation(values) / Math.sqrt(values.length);
  const t = tValue(values.length - 1);
  return [Math.round((m - t * se) * 100) / 100, Math.round((m + t * se) * 100) / 100];
}

// ============================================================
// RELIABILITY
// ============================================================

export function cronbachAlpha(items: number[][]): MetricResult {
  // items[participant][item]
  if (items.length < 2 || items[0].length < 2) {
    return { name: "Cronbach's α", value: 0, unit: 'alpha', interpretation: 'problematic', ci: null, flag: 'low-reliability' };
  }

  const k = items[0].length; // number of items
  const n = items.length;    // number of participants

  // Total score variance
  const totals = items.map(row => row.reduce((a, b) => a + b, 0));
  const totalVar = variance(totals);

  // Sum of item variances
  let sumItemVar = 0;
  for (let j = 0; j < k; j++) {
    const col = items.map(row => row[j]);
    sumItemVar += variance(col);
  }

  if (totalVar === 0) {
    return { name: "Cronbach's α", value: 0, unit: 'alpha', interpretation: 'problematic', ci: null, flag: 'low-reliability' };
  }

  const alpha = (k / (k - 1)) * (1 - sumItemVar / totalVar);
  const clamped = Math.max(0, Math.min(1, Math.round(alpha * 100) / 100));

  return {
    name: "Cronbach's α",
    value: clamped,
    unit: 'alpha',
    interpretation: interpretReliability(clamped),
    ci: null,
    flag: clamped < 0.7 ? 'low-reliability' : null,
  };
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
}

export function interpretReliability(alpha: number): MetricInterpretation {
  if (alpha >= 0.9) return 'excellent';
  if (alpha >= 0.8) return 'good';
  if (alpha >= 0.7) return 'acceptable';
  if (alpha >= 0.6) return 'poor';
  return 'problematic';
}

// ============================================================
// DATA QUALITY
// ============================================================

export function ceilingCheck(values: number[], expectedRange: [number, number]): MetricResult {
  const max = expectedRange[1];
  const threshold = max - (max - expectedRange[0]) * 0.05;
  const atCeiling = values.filter(v => v >= threshold).length;
  const proportion = values.length > 0 ? atCeiling / values.length : 0;

  return {
    name: 'Ceiling effect',
    value: Math.round(proportion * 100) / 100,
    unit: 'proportion at ceiling',
    interpretation: proportion > 0.15 ? 'problematic' : proportion > 0.10 ? 'poor' : 'good',
    ci: null,
    flag: proportion > 0.15 ? 'ceiling-effect' : null,
  };
}

export function floorCheck(values: number[], expectedRange: [number, number]): MetricResult {
  const min = expectedRange[0];
  const threshold = min + (expectedRange[1] - min) * 0.05;
  const atFloor = values.filter(v => v <= threshold).length;
  const proportion = values.length > 0 ? atFloor / values.length : 0;

  return {
    name: 'Floor effect',
    value: Math.round(proportion * 100) / 100,
    unit: 'proportion at floor',
    interpretation: proportion > 0.15 ? 'problematic' : proportion > 0.10 ? 'poor' : 'good',
    ci: null,
    flag: proportion > 0.15 ? 'floor-effect' : null,
  };
}

export function signalToNoiseRatio(cond1: number[], cond2: number[]): MetricResult {
  const diff = Math.abs(mean(cond1) - mean(cond2));
  const pooledSd = Math.sqrt((variance(cond1) + variance(cond2)) / 2);
  const snr = pooledSd > 0 ? diff / pooledSd : 0;
  const rounded = Math.round(snr * 100) / 100;

  return {
    name: 'Signal-to-noise',
    value: rounded,
    unit: 'ratio',
    interpretation: snr >= 1.0 ? 'excellent' : snr >= 0.5 ? 'good' : snr >= 0.3 ? 'acceptable' : 'poor',
    ci: null,
    flag: snr < 0.3 ? 'high-variance' : null,
  };
}

export function outlierDetection(participantMeans: number[]): MetricResult {
  const med = median(participantMeans);
  const deviations = participantMeans.map(v => Math.abs(v - med));
  const mad = median(deviations) * 1.4826; // scale to match SD
  const outliers = mad > 0 ? participantMeans.filter(v => Math.abs(v - med) > 3 * mad).length : 0;
  const proportion = participantMeans.length > 0 ? outliers / participantMeans.length : 0;

  return {
    name: 'Outliers',
    value: Math.round(proportion * 100) / 100,
    unit: 'proportion',
    interpretation: proportion > 0.10 ? 'problematic' : proportion > 0.05 ? 'poor' : 'good',
    ci: null,
    flag: proportion > 0.10 ? 'outlier-contamination' : null,
  };
}

// ============================================================
// COMPOSITE: COMPUTE ALL METRICS FOR A PILOT
// ============================================================

export function computePilotMetrics(
  design: ExperimentDesign,
  dataset: SimulatedDataset,
  personaNames: Record<string, string>,
): PilotMetrics {
  const params = design.params;
  const byPersona: PersonaMetrics[] = [];

  // Group participants by persona
  const personaGroups = new Map<string, SimulatedParticipant[]>();
  for (const p of dataset.participants) {
    const group = personaGroups.get(p.personaId) ?? [];
    group.push(p);
    personaGroups.set(p.personaId, group);
  }

  for (const [personaId, participants] of personaGroups) {
    const metrics: MetricResult[] = [];

    if (params.type === 'behavioral') {
      // Get RT values by condition
      const conditionRts: Record<string, number[]> = {};
      const conditionAcc: Record<string, number[]> = {};

      for (const p of participants) {
        for (const t of p.trials) {
          if (!conditionRts[t.condition]) { conditionRts[t.condition] = []; conditionAcc[t.condition] = []; }
          if (t.rt !== null) conditionRts[t.condition].push(t.rt);
          if (t.correct !== null) conditionAcc[t.condition].push(t.correct ? 1 : 0);
        }
      }

      const condLabels = Object.keys(conditionRts);

      // Descriptive per condition
      for (const cond of condLabels) {
        const rts = conditionRts[cond];
        metrics.push({
          name: `Mean RT (${cond})`, value: Math.round(mean(rts)), unit: 'ms',
          interpretation: 'good', ci: confidenceInterval(rts), flag: null,
        });
        const acc = conditionAcc[cond];
        metrics.push({
          name: `Accuracy (${cond})`, value: Math.round(mean(acc) * 100) / 100, unit: 'proportion',
          interpretation: mean(acc) >= 0.8 ? 'good' : mean(acc) >= 0.6 ? 'acceptable' : 'poor',
          ci: null, flag: null,
        });
      }

      // Effect size: first vs last condition
      if (condLabels.length >= 2) {
        const first = conditionRts[condLabels[0]];
        const last = conditionRts[condLabels[condLabels.length - 1]];
        metrics.push(cohensD(first, last));
        metrics.push(signalToNoiseRatio(first, last));
      }

      // Ceiling/floor on accuracy
      const allAcc = Object.values(conditionAcc).flat();
      metrics.push(ceilingCheck(allAcc, [0, 1]));
      metrics.push(floorCheck(allAcc, [0, 1]));

      // Outliers on mean RT per participant
      const pMeans = participants.map(p => mean(p.trials.filter(t => t.rt !== null).map(t => t.rt!)));
      metrics.push(outlierDetection(pMeans));

    } else {
      // Survey metrics
      const nItems = params.nItems;
      const itemMatrix = participants.map(p => p.trials.map(t => t.response));

      // Cronbach's alpha (all items)
      if (nItems >= 3) {
        metrics.push(cronbachAlpha(itemMatrix));
      }

      // Per-subscale alpha
      for (let s = 0; s < params.nSubscales; s++) {
        const start = Math.floor(s * nItems / params.nSubscales);
        const end = Math.floor((s + 1) * nItems / params.nSubscales);
        const subItems = participants.map(p => p.trials.slice(start, end).map(t => t.response));
        if (subItems[0]?.length >= 3) {
          const alpha = cronbachAlpha(subItems);
          metrics.push({ ...alpha, name: `α (${params.subscaleNames[s] || `Sub ${s + 1}`})` });
        }
      }

      // Mean response
      const allResponses = participants.flatMap(p => p.trials.map(t => t.response));
      metrics.push({
        name: 'Mean response', value: Math.round(mean(allResponses) * 100) / 100,
        unit: `/ ${params.scalePoints}`, interpretation: 'good', ci: confidenceInterval(allResponses), flag: null,
      });

      // Ceiling/floor
      metrics.push(ceilingCheck(allResponses, [1, params.scalePoints]));
      metrics.push(floorCheck(allResponses, [1, params.scalePoints]));
    }

    byPersona.push({ personaId, personaName: personaNames[personaId] || personaId, metrics });
  }

  // Overall score: heuristic weighted sum
  const allMetrics = byPersona.flatMap(p => p.metrics);
  const flags = allMetrics.filter(m => m.flag !== null).length;
  const effectSizes = allMetrics.filter(m => m.name === "Cohen's d");
  const avgEffect = effectSizes.length > 0 ? mean(effectSizes.map(m => m.value)) : 0.5;
  const alphas = allMetrics.filter(m => m.name.startsWith("Cronbach") || m.name.startsWith('α'));
  const avgAlpha = alphas.length > 0 ? mean(alphas.map(m => m.value)) : 0.75;

  const effectScore = Math.min(25, avgEffect / 0.8 * 25);
  const reliabilityScore = Math.min(25, avgAlpha / 0.9 * 25);
  const qualityScore = Math.max(0, 25 - flags * 5);
  const baseScore = 25; // baseline for having run at all
  const overallScore = Math.round(Math.min(100, effectScore + reliabilityScore + qualityScore + baseScore));

  const recommendation = overallScore >= 75 ? 'proceed' as const
    : overallScore >= 50 ? 'revise' as const
    : 'redesign' as const;

  return {
    designId: design.id,
    byPersona,
    overall: allMetrics.slice(0, 6), // top metrics for overview
    overallScore,
    recommendation,
  };
}
