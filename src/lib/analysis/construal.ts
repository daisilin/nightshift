/**
 * MAZE-CONSTRUAL ANALYSIS STEP
 *
 * Analyzes maze navigation data with awareness metadata.
 * Produces construal effect analysis matching Ho et al. (Nature).
 *
 * Key DVs:
 * - Per-obstacle awareness (0-1)
 * - High vs low construal awareness difference
 * - Construal effect size
 * - Comparison to paper benchmarks
 */

import type { AnalysisStepDef, AnalysisInput, AnalysisResult } from './types';

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function sd(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

export const construalAnalysis: AnalysisStepDef = {
  id: 'construal-effect',
  name: 'Construal Effect Analysis (Ho et al.)',
  category: 'effect',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    // Check if any dataset has maze-construal metadata
    const hasMazeData = input.datasets.some(ds =>
      ds.participants.some(p =>
        p.trials.some(t => t.metadata?.awarenessScores)
      )
    );

    if (!hasMazeData) {
      return {
        stepId: 'construal-effect',
        type: 'text',
        title: 'Construal Effect Analysis',
        data: 'No maze-construal awareness data found. This analysis requires trials with obstacle awareness metadata (run maze-construal paradigm).',
      };
    }

    // Collect all obstacle-level observations
    const allHigh: number[] = [];
    const allLow: number[] = [];
    const perParticipantEffects: number[] = [];
    const perMazeEffects: Map<string, { high: number[]; low: number[] }> = new Map();
    let totalObservations = 0;
    let nParticipants = 0;
    let nTrials = 0;

    for (const ds of input.datasets) {
      for (const p of ds.participants) {
        const participantHigh: number[] = [];
        const participantLow: number[] = [];

        for (const t of p.trials) {
          if (!t.metadata?.awarenessScores || !t.metadata?.construalProb) continue;
          nTrials++;
          const mazeId = t.metadata.mazeId || 'unknown';

          if (!perMazeEffects.has(mazeId)) {
            perMazeEffects.set(mazeId, { high: [], low: [] });
          }
          const mazeData = perMazeEffects.get(mazeId)!;

          for (const [label, awareness] of Object.entries(t.metadata.awarenessScores)) {
            const cp = t.metadata.construalProb[label];
            if (typeof cp !== 'number' || typeof awareness !== 'number') continue;
            totalObservations++;

            if (cp > 0.45) {
              allHigh.push(awareness);
              participantHigh.push(awareness);
              mazeData.high.push(awareness);
            } else {
              allLow.push(awareness);
              participantLow.push(awareness);
              mazeData.low.push(awareness);
            }
          }
        }

        if (participantHigh.length > 0 && participantLow.length > 0) {
          perParticipantEffects.push(mean(participantHigh) - mean(participantLow));
          nParticipants++;
        }
      }
    }

    const meanHigh = mean(allHigh);
    const meanLow = mean(allLow);
    const effect = meanHigh - meanLow;
    const pooledSD = Math.sqrt((sd(allHigh) ** 2 + sd(allLow) ** 2) / 2);
    const cohensD = pooledSD > 0 ? effect / pooledSD : 0;

    // Build comparison table
    const rows: (string | number)[][] = [
      ['High construal awareness', meanHigh.toFixed(3), sd(allHigh).toFixed(3), allHigh.length, '0.787'],
      ['Low construal awareness', meanLow.toFixed(3), sd(allLow).toFixed(3), allLow.length, '0.173'],
      ['Construal effect (diff)', effect.toFixed(3), sd(perParticipantEffects).toFixed(3), nParticipants, '0.614'],
      ['Cohen\'s d', cohensD.toFixed(3), '', '', 'large'],
    ];

    // Per-maze breakdown
    const mazeRows: (string | number)[][] = [];
    for (const [mazeId, data] of perMazeEffects.entries()) {
      const mHigh = mean(data.high);
      const mLow = mean(data.low);
      mazeRows.push([mazeId, mHigh.toFixed(3), mLow.toFixed(3), (mHigh - mLow).toFixed(3)]);
    }

    // Build interpretation
    const effectMatch = Math.abs(effect - 0.614) < 0.2 ? 'close to' : effect > 0.4 ? 'somewhat below' : 'substantially below';
    const interpretation = `Construal effect = ${effect.toFixed(3)} (paper: 0.614, ${effectMatch} benchmark). ` +
      `High construal awareness = ${meanHigh.toFixed(3)} (paper: 0.787). ` +
      `Low construal awareness = ${meanLow.toFixed(3)} (paper: 0.173). ` +
      `Based on ${totalObservations} obstacle observations from ${nParticipants} participants across ${nTrials} maze trials. ` +
      `Cohen's d = ${cohensD.toFixed(2)} (${cohensD > 0.8 ? 'large' : cohensD > 0.5 ? 'medium' : 'small'} effect).`;

    return {
      stepId: 'construal-effect',
      type: 'table',
      title: 'Construal Effect Analysis (vs Ho et al. benchmarks)',
      data: {
        headers: ['Measure', 'Simulated', 'SD', 'N', 'Paper benchmark'],
        rows,
      },
      interpretation,
    };
  },
};

export const construalByMaze: AnalysisStepDef = {
  id: 'construal-by-maze',
  name: 'Construal Effect by Maze',
  category: 'descriptive',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const perMaze: Map<string, { high: number[]; low: number[] }> = new Map();

    for (const ds of input.datasets) {
      for (const p of ds.participants) {
        for (const t of p.trials) {
          if (!t.metadata?.awarenessScores || !t.metadata?.construalProb) continue;
          const mazeId = t.metadata.mazeId || 'unknown';
          if (!perMaze.has(mazeId)) perMaze.set(mazeId, { high: [], low: [] });
          const md = perMaze.get(mazeId)!;

          for (const [label, awareness] of Object.entries(t.metadata.awarenessScores)) {
            const cp = t.metadata.construalProb[label];
            if (typeof cp !== 'number' || typeof awareness !== 'number') continue;
            if (cp > 0.45) md.high.push(awareness);
            else md.low.push(awareness);
          }
        }
      }
    }

    if (perMaze.size === 0) {
      return {
        stepId: 'construal-by-maze',
        type: 'text',
        title: 'Construal by Maze',
        data: 'No maze-level awareness data found.',
      };
    }

    const rows: (string | number)[][] = [];
    for (const [mazeId, data] of perMaze.entries()) {
      rows.push([
        mazeId,
        mean(data.high).toFixed(3),
        mean(data.low).toFixed(3),
        (mean(data.high) - mean(data.low)).toFixed(3),
        data.high.length + data.low.length,
      ]);
    }

    return {
      stepId: 'construal-by-maze',
      type: 'table',
      title: 'Construal Effect by Maze',
      data: {
        headers: ['Maze', 'High Construal', 'Low Construal', 'Effect', 'N obs'],
        rows,
      },
    };
  },
};
