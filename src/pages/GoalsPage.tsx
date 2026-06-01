import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Target, Trash2, Calendar as CalIcon, ChevronDown, ChevronRight } from 'lucide-react';
import { useGoalStore } from '@/store/useGoalStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input, Textarea } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { GoalWithMilestones, Milestone } from '@/types';

export function GoalsPage() {
  const { t } = useTranslation();
  const { goals, fetchGoals, createGoal, updateGoal, deleteGoal, createMilestone, toggleMilestone, deleteMilestone } = useGoalStore();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // New goal form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>('#10b981');
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const onCreate = async () => {
    if (!title.trim()) {
      toast.error(t('profile.nickname') + ' ?');
      return;
    }
    await createGoal({
      title: title.trim(),
      description: desc || undefined,
      color,
      dueAt: dueAt || undefined,
      parentGoalId: parentId || undefined,
    });
    setOpen(false);
    setTitle('');
    setDesc('');
    setDueAt(null);
    setColor('#10b981');
    setParentId(null);
  };

  const flattenForParent = (gs: GoalWithMilestones[]): GoalWithMilestones[] => {
    const out: GoalWithMilestones[] = [];
    const visit = (g: GoalWithMilestones) => {
      out.push(g);
      g.subGoals.forEach(visit);
    };
    gs.forEach(visit);
    return out;
  };
  const allGoals = flattenForParent(goals);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Target size={22} />
          {t('goal.title')}
        </h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          {t('goal.addGoal')}
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <Target size={32} className="mx-auto mb-2 opacity-50" />
          <div>{t('goal.noGoals')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              level={0}
              expanded={expanded}
              setExpanded={setExpanded}
              onCreateMilestone={createMilestone}
              onToggleMilestone={toggleMilestone}
              onDeleteMilestone={deleteMilestone}
              onDeleteGoal={deleteGoal}
              onUpdateGoal={updateGoal}
              onAddSubGoal={(parentId) => {
                setParentId(parentId);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setParentId(null);
        }}
        title={parentId ? t('goal.addSubGoal').replace('+ ', '') : t('goal.addGoal')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onCreate}>{t('common.create')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={t('profile.nickname')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label={t('profile.signature')}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div>
            <label className="label">{t('goal.due')}</label>
            <DateTimePicker value={dueAt} onChange={setDueAt} />
          </div>
          <div>
            <label className="label">{t('board.boardColor')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div>
            <label className="label">{t('goal.subGoals')}</label>
            <select
              className="input"
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              <option value="">-</option>
              {allGoals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GoalCard({
  goal,
  level,
  expanded,
  setExpanded,
  onCreateMilestone,
  onToggleMilestone,
  onDeleteMilestone,
  onDeleteGoal,
  onUpdateGoal,
  onAddSubGoal,
}: {
  goal: GoalWithMilestones;
  level: number;
  expanded: Record<string, boolean>;
  setExpanded: (r: Record<string, boolean>) => void;
  onCreateMilestone: (goalId: string, title: string) => Promise<void>;
  onToggleMilestone: (id: string) => Promise<void>;
  onDeleteMilestone: (id: string) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onUpdateGoal: (id: string, patch: { title?: string; description?: string | null; color?: string | null; icon?: string | null; dueAt?: string | null }) => Promise<void>;
  onAddSubGoal: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const isOpen = expanded[goal.id] ?? true;
  const [newMs, setNewMs] = useState('');
  const toggle = () => setExpanded({ ...expanded, [goal.id]: !isOpen });

  return (
    <div className="card" style={{ marginLeft: level * 16 }}>
      <div className="p-4 flex items-start gap-3">
        <button onClick={toggle} className="btn-ghost p-0.5 mt-0.5">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div
          className="w-2.5 h-10 rounded-full shrink-0"
          style={{ background: goal.color || 'var(--primary)' }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{goal.title}</h3>
            <span className="text-xs text-text-muted">{Math.round(goal.progress * 100)}%</span>
          </div>
          {goal.description && (
            <div className="text-xs text-text-muted mt-0.5 line-clamp-2">{goal.description}</div>
          )}
          <div className="mt-2">
            <ProgressBar value={goal.progress} color={goal.color || 'var(--primary)'} />
          </div>
          {goal.dueAt && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-text-muted">
              <CalIcon size={11} />
              {dayjs(goal.dueAt).format('YYYY-MM-DD')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => onAddSubGoal(goal.id)}>
            <Plus size={12} />
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (confirm(t('goal.deleteConfirm'))) onDeleteGoal(goal.id);
            }}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4">
          {goal.milestones.length > 0 && (
            <div className="mb-2 text-xs font-semibold text-text-muted uppercase">
              {t('goal.milestones')}
            </div>
          )}
          <div className="space-y-1 mb-2">
            {goal.milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                m={m}
                onToggle={() => onToggleMilestone(m.id)}
                onDelete={() => onDeleteMilestone(m.id)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newMs}
              onChange={(e) => setNewMs(e.target.value)}
              placeholder={t('goal.addMilestone').replace('+ ', '')}
              className="input flex-1"
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newMs.trim()) {
                  await onCreateMilestone(goal.id, newMs.trim());
                  setNewMs('');
                }
              }}
            />
            <Button
              size="sm"
              onClick={async () => {
                if (newMs.trim()) {
                  await onCreateMilestone(goal.id, newMs.trim());
                  setNewMs('');
                }
              }}
            >
              <Plus size={14} />
            </Button>
          </div>

          {goal.subGoals.length > 0 && (
            <div className="mt-3 space-y-2">
              {goal.subGoals.map((sg) => (
                <GoalCard
                  key={sg.id}
                  goal={sg}
                  level={level + 1}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  onCreateMilestone={onCreateMilestone}
                  onToggleMilestone={onToggleMilestone}
                  onDeleteMilestone={onDeleteMilestone}
                  onDeleteGoal={onDeleteGoal}
                  onUpdateGoal={onUpdateGoal}
                  onAddSubGoal={onAddSubGoal}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MilestoneRow({
  m,
  onToggle,
  onDelete,
}: {
  m: Milestone;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={onToggle}
        className="w-4 h-4 rounded border-2 flex items-center justify-center"
        style={{
          borderColor: m.isCompleted ? 'var(--primary)' : 'var(--border)',
          background: m.isCompleted ? 'var(--primary)' : 'transparent',
        }}
      >
        {m.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 ${m.isCompleted ? 'line-through text-text-muted' : ''}`}>{m.title}</span>
      <button onClick={onDelete} className="btn-ghost p-0.5">
        <Trash2 size={12} />
      </button>
    </div>
  );
}
