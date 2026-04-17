import { motion } from 'framer-motion';
import { taskBank } from '../data/taskBank';
import { personaBank } from '../data/personaBank';

export interface AgentPlan {
  brief?: string;
  addTasks?: string[];
  removeTasks?: string[];
  addPersonas?: string[];
  removePersonas?: string[];
  nParticipants?: number;
  modelPool?: 'sonnet' | 'diverse' | 'capability-spread';
  notes?: string;
}

interface Props {
  plan: AgentPlan;
  currentTasks: string[];
  currentPersonas: string[];
  currentBrief: string;
  onApprove: (plan: AgentPlan) => void;
  onEdit: () => void;
  onReject: () => void;
  title?: string;
  approveLabel?: string;
  currentN?: number;
}

function resolveTasks(current: string[], plan: AgentPlan): string[] {
  let tasks = [...current];
  if (plan.removeTasks) tasks = tasks.filter(id => !plan.removeTasks!.includes(id));
  if (plan.addTasks) {
    const valid = plan.addTasks.filter(id => taskBank.find(t => t.id === id));
    tasks = [...new Set([...tasks, ...valid])];
  }
  return tasks;
}

function resolvePersonas(current: string[], plan: AgentPlan): string[] {
  let personas = [...current];
  if (plan.removePersonas) personas = personas.filter(id => !plan.removePersonas!.includes(id));
  if (plan.addPersonas) {
    const valid = plan.addPersonas.filter(id => personaBank.find(p => p.id === id));
    personas = [...new Set([...personas, ...valid])];
  }
  return personas;
}

export function PlanConfirmation({ plan, currentTasks, currentPersonas, currentBrief, onApprove, onEdit, onReject, title, approveLabel, currentN }: Props) {
  const finalTasks = resolveTasks(currentTasks, plan);
  const finalPersonas = resolvePersonas(currentPersonas, plan);
  const finalBrief = plan.brief || currentBrief;
  const n = plan.nParticipants || currentN || 20;
  const pool = plan.modelPool || 'sonnet';
  const nChanged = currentN !== undefined && plan.nParticipants !== undefined && plan.nParticipants !== currentN;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-orchid/20 bg-gradient-to-br from-orchid/5 to-rose/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-orchid uppercase tracking-wider">{title || 'proposed plan'}</span>
        <span className="text-[9px] text-text-4">review before dispatch</span>
      </div>

      {/* Brief */}
      <div>
        <span className="text-[9px] text-text-3 uppercase">research question</span>
        <p className="text-sm text-text mt-0.5">{finalBrief}</p>
      </div>

      {/* Tasks */}
      <div>
        <span className="text-[9px] text-text-3 uppercase">tasks ({finalTasks.length})</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {finalTasks.map(id => {
            const t = taskBank.find(tb => tb.id === id);
            if (!t) return null;
            const isNew = plan.addTasks?.includes(id);
            return (
              <span key={id} className={`px-2 py-0.5 rounded text-[10px] border ${isNew ? 'bg-sage/15 border-sage/30 text-text' : 'bg-orchid/8 border-orchid/15 text-text-2'}`}>
                {t.emoji} {t.name} {isNew && <span className="text-sage text-[8px]">+new</span>}
              </span>
            );
          })}
          {plan.removeTasks?.map(id => {
            const t = taskBank.find(tb => tb.id === id);
            return t ? (
              <span key={id} className="px-2 py-0.5 rounded text-[10px] border border-red-200 bg-red-50 text-red-400 line-through">
                {t.emoji} {t.name}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Populations */}
      <div>
        <span className="text-[9px] text-text-3 uppercase">populations ({finalPersonas.length})</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {finalPersonas.map(id => {
            const p = personaBank.find(pb => pb.id === id);
            return p ? (
              <span key={id} className="px-1.5 py-0.5 rounded text-[9px] bg-surface-2/50 text-text-3 border border-orchid/8">
                {p.emoji} {p.name}
              </span>
            ) : null;
          })}
        </div>
      </div>

      {/* Settings row */}
      <div className="flex items-center gap-4 text-[10px] text-text-3">
        <span>
          n ={' '}
          {nChanged && (
            <span className="text-text-4 line-through mr-1">{currentN}</span>
          )}
          <strong className={nChanged ? 'text-sage' : 'text-text'}>{n}</strong> per population
        </span>
        <span>pool: <strong className="text-text">{pool}</strong></span>
        <span>est. ~<strong className="text-text">{Math.round(n * finalTasks.length * 2)}</strong>min</span>
      </div>

      {/* Notes */}
      {plan.notes && (
        <div className="text-[11px] text-text-3 italic border-l-2 border-orchid/20 pl-2">
          {plan.notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onApprove(plan)}
          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          {approveLabel || 'approve & dispatch'}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onEdit}
          className="px-3 py-2 rounded-lg text-xs text-text-2 border border-orchid/15 cursor-pointer hover:bg-orchid/5"
        >
          edit
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onReject}
          className="px-3 py-2 rounded-lg text-xs text-text-3 cursor-pointer hover:text-text-2"
        >
          revise
        </motion.button>
      </div>
    </motion.div>
  );
}
