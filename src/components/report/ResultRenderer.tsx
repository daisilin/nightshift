import { motion } from 'framer-motion';
import type { AnalysisResult, TableData, MatrixData, FactorData, ChartData } from '../../lib/analysis/types';
import { staggerItem } from '../../lib/animations';

function DataTable({ data }: { data: TableData }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-orchid/10">
          {data.headers.map(h => (
            <th key={h} className="text-left py-2 px-2 text-xs text-text-3 font-normal">{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {data.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-orchid/5 hover:bg-orchid/3">
              {row.map((cell, ci) => (
                <td key={ci} className={`py-1.5 px-2 text-xs ${ci === 0 ? 'text-text-2 font-medium' : 'text-text-3 font-mono'}`}>
                  {typeof cell === 'number' ? cell : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrelationHeatmap({ data }: { data: MatrixData }) {
  const n = data.labels.length;
  const getColor = (r: number) => {
    const abs = Math.abs(r);
    if (abs >= 0.5) return 'rgb(139, 172, 212)';
    if (abs >= 0.3) return 'rgb(176, 124, 198)';
    if (abs >= 0.15) return 'rgb(232, 168, 124)';
    return 'rgb(200, 200, 200)';
  };
  const getSig = (p: number) => {
    if (!data.significanceThresholds) return '';
    for (const t of data.significanceThresholds) {
      if (p <= t.threshold) return t.symbol;
    }
    return '';
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead><tr>
          <th></th>
          {data.labels.map(l => <th key={l} className="px-2 py-1 text-text-3 font-normal text-center" style={{ maxWidth: '80px' }}>{l}</th>)}
        </tr></thead>
        <tbody>
          {data.labels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <td className="px-2 py-1 text-text-2 font-medium text-right" style={{ maxWidth: '100px' }}>{rowLabel}</td>
              {data.values[i].map((val, j) => {
                const sig = data.pValues ? getSig(data.pValues[i][j]) : '';
                return (
                  <td key={j} className="px-2 py-1 text-center font-mono" style={{
                    color: i === j ? '#A89BB5' : getColor(val),
                    fontWeight: Math.abs(val) >= 0.3 ? 600 : 400,
                  }}>
                    {i === j ? '—' : `${val.toFixed(2)}${sig}`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.significanceThresholds && (
        <div className="text-[9px] text-text-4 mt-2">
          {data.significanceThresholds.map(t => `${t.symbol} p ≤ ${t.threshold}`).join(' · ')}
          {' · permutation-tested'}
        </div>
      )}
    </div>
  );
}

function FactorTable({ data }: { data: FactorData }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead><tr className="border-b border-orchid/10">
            <th className="text-left py-2 px-2 text-xs text-text-3 font-normal">Task</th>
            {data.factorNames.map(f => (
              <th key={f} className="text-center py-2 px-2 text-xs text-text-3 font-normal">{f}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.tasks.map((task, i) => (
              <tr key={task} className="border-b border-orchid/5">
                <td className="py-1.5 px-2 text-xs text-text-2">{task}</td>
                {data.loadings[i].map((loading, fi) => (
                  <td key={fi} className="py-1.5 px-2 text-center text-xs font-mono" style={{
                    color: Math.abs(loading) >= 0.5 ? '#8BACD4' : Math.abs(loading) >= 0.3 ? '#B07CC6' : '#A89BB5',
                    fontWeight: Math.abs(loading) >= 0.5 ? 700 : Math.abs(loading) >= 0.3 ? 500 : 400,
                    fontStyle: Math.abs(loading) >= 0.3 && Math.abs(loading) < 0.5 ? 'italic' : 'normal',
                  }}>
                    {loading.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[10px] text-text-4 mt-2">
        {data.factorNames.map((f, i) => `${f}: ${data.varianceExplained[i]}%`).join(' · ')}
        {' · total: '}{data.totalVariance}%
      </div>
      <div className="text-[9px] text-text-4 mt-1">bold: loading ≥ 0.5 · italic: 0.3–0.5</div>
    </div>
  );
}

function TextResult({ data }: { data: string }) {
  return <p className="text-sm text-text-2 leading-relaxed">{data}</p>;
}

export function ResultRenderer({ result }: { result: AnalysisResult }) {
  return (
    <motion.div variants={staggerItem} className="card p-5 mb-4">
      <h3 className="text-xs font-mono text-text-3 uppercase tracking-wider mb-3">{result.title}</h3>
      {result.type === 'table' && <DataTable data={result.data} />}
      {result.type === 'matrix' && <CorrelationHeatmap data={result.data} />}
      {result.type === 'factor-loadings' && <FactorTable data={result.data} />}
      {result.type === 'text' && <TextResult data={result.data} />}
      {result.interpretation && (
        <p className="text-[10px] text-text-3 mt-3 italic">{result.interpretation}</p>
      )}
    </motion.div>
  );
}
