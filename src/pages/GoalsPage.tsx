import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Target, Trash2, Calendar as CalIcon, ChevronDown, ChevronRight,
  Check, X, TrendingUp, CheckCircle2, ListTodo, Star, Archive
} from 'lucide-react';
import { useGoalStore } from '@/store/useGoalStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { Input, Textarea } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { GoalPeriod, GoalWithDetails, KeyResult, Milestone } from '@/types';

const MAX_DEPTH = 5;

const PERIOD_OPTIONS: GoalPeriod[] = ['Q1', 'Q2', 'Q3', 'Q4', 'yearly', 'custom'];

const KR_TYPE_OPTIONS = ['metric', 'boolean', 'task'] as const;

interface DraftKR {
  title: string;
  type: 'metric' | 'boolean' | 'task';
  startValue: number;
  targetValue: number;
  unit: string;
  weight: number;
}

export function GoalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { goals, fetchGoals, createGoal, createKeyResult, deleteGoal, updateGoal,
    createMilestone, toggleMilestone, deleteMilestone } = useGoalStore();

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Create goal form state
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [period, setPeriod] = useState<GoalPeriod>('yearly');
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customDue, setCustomDue] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>('#10b981');
  const [parentId, setParentId] = useState<string | null>(null);
  const [draftKRs, setDraftKRs] = useState<DraftKR[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} });

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const flattenForParent = (gs: GoalWithDetails[], depth = 0): GoalWithDetails[] => {
    const out: GoalWithDetails[] = [];
    const visit = (g: GoalWithDetails, d: number) => {
      if (d < MAX_DEPTH - 1) {
        out.push(g);
        g.subGoals.forEach((sg) => visit(sg, d + 1));
      }
    };
    gs.forEach((g) => visit(g, depth));
    return out;
  };
  const allGoals = flattenForParent(goals);

  const addDraftKR = () => {
    setDraftKRs([...draftKRs, { title: '', type: 'metric', startValue: 0, targetValue: 100, unit: '', weight: 20 }]);
  };

  const removeDraftKR = (idx: number) => {
    setDraftKRs(draftKRs.filter((_, i) => i !== idx));
  };

  const updateDraftKR = (idx: number, patch: Partial<DraftKR>) => {
    setDraftKRs(draftKRs.map((kr, i) => i === idx ? { ...kr, ...patch } : kr));
  };

  const onCreate = async () => {
    if (!title.trim()) {
      toast.error(t('goal.required'));
      return;
    }
    const dueAt = period === 'custom' ? customDue : undefined;
    const startDate = period === 'custom' ? customStart : undefined;
    await createGoal({
      title: title.trim(),
      description: desc || undefined,
      color,
      dueAt: dueAt || undefined,
      parentGoalId: parentId || undefined,
      period,
      startDate: startDate || undefined,
    });
    // Create draft KRs for the newly created goal
    // We need to find the goal id from the refreshed list
    await fetchGoals();
    const newGoal = useGoalStore.getState().goals.find(g => g.title === title.trim() && g.parentGoalId === parentId);
    if (newGoal && draftKRs.length > 0) {
      for (const kr of draftKRs) {
        if (kr.title.trim()) {
          await createKeyResult({
            goalId: newGoal.id,
            title: kr.title.trim(),
            krType: kr.type,
            startValue: kr.type === 'metric' ? kr.startValue : undefined,
            targetValue: kr.type === 'metric' ? kr.targetValue : undefined,
            unit: kr.unit || undefined,
            weight: kr.weight,
          });
        }
      }
    }
    setOpen(false);
    setTitle('');
    setDesc('');
    setPeriod('yearly');
    setCustomStart(null);
    setCustomDue(null);
    setColor('#10b981');
    setParentId(null);
    setDraftKRs([]);
  };

  const periodLabel = (p: GoalPeriod) => {
    const year = dayjs().year();
    switch (p) {
      case 'Q1': return `Q1 ${year}`;
      case 'Q2': return `Q2 ${year}`;
      case 'Q3': return `Q3 ${year}`;
      case 'Q4': return `Q4 ${year}`;
      case 'yearly': return `${year}`;
      case 'custom': return t('goal.periodCustom');
    }
  };

  const krTypeIcon = (type: string) => {
    switch (type) {
      case 'metric': return <TrendingUp size={14} />;
      case 'boolean': return <CheckCircle2 size={14} />;
      case 'task': return <ListTodo size={14} />;
      default: return <TrendingUp size={14} />;
    }
  };

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
              onDeleteMilestone={async (id) => setDeleteConfirm({ open: true, onConfirm: async () => { await deleteMilestone(id); } })}
              onDeleteGoal={async (id) => setDeleteConfirm({ open: true, onConfirm: async () => { await deleteGoal(id); } })}
              onUpdateGoal={updateGoal}
              onOpenDetail={(id) => navigate(`/goals/${id}`)}
              onAddSubGoal={(pid) => {
                setParentId(pid);
                setOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Create Goal Modal */}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setParentId(null); }}
        title={parentId ? t('goal.addSubGoal').replace('+ ', '') : t('goal.addGoal')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setOpen(false); setParentId(null); }}>
              {t('common.cancel')}
            </Button>
            <Button onClick={onCreate}>{t('common.create')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Goal Name */}
          <Input
            label={`${t('goal.title')} *`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('goal.title')}
          />

          {/* Period */}
          <div>
            <label className="label">{t('goal.period')} *</label>
            <div className="flex gap-2">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-primary text-white'
                      : 'bg-surface-2 text-text-muted hover:bg-surface-3'
                  }`}
                >
                  {periodLabel(p)}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="label">{t('goal.startDate')}</label>
                  <DateTimePicker value={customStart} onChange={setCustomStart} />
                </div>
                <div>
                  <label className="label">{t('goal.due')}</label>
                  <DateTimePicker value={customDue} onChange={setCustomDue} />
                </div>
              </div>
            )}
          </div>

          {/* Parent Goal */}
          {!parentId && (
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
          )}

          {/* Description */}
          <Textarea
            label={t('goal.subGoals')}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          {/* Draft Key Results */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">{t('goal.keyResult')}</label>
              <Button size="sm" variant="ghost" onClick={addDraftKR}>
                <Plus size={14} /> {t('goal.addKRInline')}
              </Button>
            </div>
            {draftKRs.length === 0 && (
              <div className="text-sm text-text-muted text-center py-2">
                {t('goal.addKRInline')}
              </div>
            )}
            <div className="space-y-2">
              {draftKRs.map((kr, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {/* KR Type Tabs */}
                    <div className="card p-0.5 flex items-center text-xs gap-0.5">
                      {KR_TYPE_OPTIONS.map((m) => (
                        <button
                          key={m}
                          onClick={() => updateDraftKR(idx, { type: m })}
                          className={`px-2 py-1 rounded-md flex items-center gap-1 ${
                            kr.type === m ? 'bg-primary text-white' : 'text-text-muted'
                          }`}
                        >
                          {krTypeIcon(m)}
                          {t(`goal.${m}`)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn-ghost p-0.5 ml-auto"
                      onClick={() => removeDraftKR(idx)}
                    >
                      <X size={14} className="text-text-muted" />
                    </button>
                  </div>
                  <Input
                    value={kr.title}
                    onChange={(e) => updateDraftKR(idx, { title: e.target.value })}
                    placeholder={t('goal.krTitle')}
                  />
                  {kr.type === 'metric' && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Input
                        label={t('goal.startValue')}
                        type="number"
                        value={kr.startValue}
                        onChange={(e) => updateDraftKR(idx, { startValue: Number(e.target.value) || 0 })}
                      />
                      <Input
                        label={t('goal.targetValue')}
                        type="number"
                        value={kr.targetValue}
                        onChange={(e) => updateDraftKR(idx, { targetValue: Number(e.target.value) || 100 })}
                      />
                      <Input
                        label={t('goal.unit')}
                        value={kr.unit}
                        onChange={(e) => updateDraftKR(idx, { unit: e.target.value })}
                        placeholder="km / 次 / 本"
                      />
                    </div>
                  )}
                  <Input
                    label={t('goal.weight')}
                    type="number"
                    value={kr.weight}
                    onChange={(e) => updateDraftKR(idx, { weight: Math.max(1, Math.min(100, Number(e.target.value) || 20)) })}
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="label">{t('board.boardColor')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </div>
      </Modal>

      <DeleteConfirmModal
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ ...deleteConfirm, open: false })}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  );
}

// ─── GoalCard ───

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
  onOpenDetail,
  onAddSubGoal,
}: {
  goal: GoalWithDetails;
  level: number;
  expanded: Record<string, boolean>;
  setExpanded: (r: Record<string, boolean>) => void;
  onCreateMilestone: (goalId: string, title: string) => Promise<void>;
  onToggleMilestone: (id: string) => Promise<void>;
  onDeleteMilestone: (id: string) => Promise<void>;
  onDeleteGoal: (id: string) => Promise<void>;
  onUpdateGoal: (id: string, patch: { title?: string; description?: string | null; color?: string | null; icon?: string | null; dueAt?: string | null }) => Promise<void>;
  onOpenDetail: (id: string) => void;
  onAddSubGoal: (parentId: string) => void;
}) {
  const { t } = useTranslation();
  const isOpen = expanded[goal.id] ?? true;
  const [newMs, setNewMs] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(goal.title);
  const toggle = () => setExpanded({ ...expanded, [goal.id]: !isOpen });

  const saveTitle = async () => {
    if (titleDraft.trim() && titleDraft.trim() !== goal.title) {
      await onUpdateGoal(goal.id, { title: titleDraft.trim() });
    }
    setEditingTitle(false);
  };

  const canAddSubGoal = level < MAX_DEPTH - 1;

  const periodLabel = (p: string) => {
    const year = dayjs().year();
    switch (p) {
      case 'Q1': return `Q1 ${year}`;
      case 'Q2': return `Q2 ${year}`;
      case 'Q3': return `Q3 ${year}`;
      case 'Q4': return `Q4 ${year}`;
      case 'yearly': return `${year}`;
      case 'custom': return t('goal.periodCustom');
      default: return `${year}`;
    }
  };

  const krTypeIcon = (type: string) => {
    switch (type) {
      case 'metric': return <TrendingUp size={12} className="text-blue-500" />;
      case 'boolean': return <CheckCircle2 size={12} className="text-green-500" />;
      case 'task': return <ListTodo size={12} className="text-purple-500" />;
      default: return <TrendingUp size={12} />;
    }
  };

  // Progress color based on time elapsed
  const progressColor = (() => {
    if (!goal.startDate || !goal.dueAt) return goal.color || 'var(--primary)';
    const now = dayjs();
    const start = dayjs(goal.startDate);
    const end = dayjs(goal.dueAt);
    const totalDays = end.diff(start, 'day');
    if (totalDays <= 0) return 'var(--success)';
    const elapsed = now.diff(start, 'day');
    const timeRate = Math.min(100, (elapsed / totalDays) * 100);
    const progressPct = goal.progress * 100;
    const gap = timeRate - progressPct;
    if (gap <= 0) return 'var(--success)';
    if (gap <= 20) return 'var(--warning)';
    return 'var(--danger)';
  })();

  return (
    <div className="card" style={{ marginLeft: level * 20 }}>
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
            {editingTitle ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  className="input py-0.5 px-1 text-sm flex-1 font-semibold"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(goal.title); }
                  }}
                  autoFocus
                />
                <button className="btn-ghost p-0.5" onClick={saveTitle}>
                  <Check size={14} className="text-green-500" />
                </button>
                <button className="btn-ghost p-0.5" onClick={() => { setEditingTitle(false); setTitleDraft(goal.title); }}>
                  <X size={14} className="text-text-muted" />
                </button>
              </div>
            ) : (
              <h3
                className="font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => onOpenDetail(goal.id)}
                onDoubleClick={() => { setEditingTitle(true); setTitleDraft(goal.title); }}
                title={t('goal.renameGoal')}
              >
                {goal.title}
              </h3>
            )}
            {/* Period chip */}
            <span className="chip text-xs">{periodLabel(goal.period)}</span>
            <span className="text-xs text-text-muted">{Math.round(goal.progress * 100)}%</span>
          </div>
          {goal.description && (
            <div className="text-xs text-text-muted mt-0.5 line-clamp-2">{goal.description}</div>
          )}
          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar value={goal.progress} color={progressColor} className="flex-1" />
          </div>
          {/* KR summary list */}
          {goal.keyResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {goal.keyResults.map((kr) => {
                const krProgress = kr.type === 'boolean'
                  ? (kr.isCompleted ? 100 : 0)
                  : kr.type === 'metric'
                    ? Math.max(0, Math.min(100, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100))
                    : Math.max(0, Math.min(100, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100));
                return (
                  <div key={kr.id} className="flex items-center gap-2 text-xs">
                    {krTypeIcon(kr.type)}
                    <span className="truncate flex-1">{kr.title}</span>
                    <ProgressBar value={krProgress / 100} height={4} color={progressColor} className="w-24" />
                    <span className="text-text-muted font-mono w-16 text-right">
                      {kr.type === 'metric'
                        ? `${kr.currentValue}/${kr.targetValue}${kr.unit || ''}`
                        : kr.type === 'boolean'
                          ? (kr.isCompleted ? '✓' : '○')
                          : `${Math.round(kr.currentValue)}/${Math.round(kr.targetValue)}`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {goal.dueAt && (
            <div className="mt-1.5 flex items-center gap-1 text-xs text-text-muted">
              <CalIcon size={11} />
              {dayjs(goal.dueAt).format('YYYY-MM-DD')}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canAddSubGoal && (
            <Button size="sm" variant="ghost" onClick={() => onAddSubGoal(goal.id)}>
              <Plus size={12} />
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDeleteGoal(goal.id)}
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
                  onOpenDetail={onOpenDetail}
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
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-sm group">
      <button
        onClick={onToggle}
        className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
        style={{
          borderColor: m.isCompleted ? 'var(--primary)' : 'var(--border)',
          background: m.isCompleted ? 'var(--primary)' : 'transparent',
        }}
      >
        {m.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 ${m.isCompleted ? 'line-through text-text-muted' : ''}`}>{m.title}</span>
      <button
        onClick={() => onDelete()}
        className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}