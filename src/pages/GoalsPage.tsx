import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, CalendarDays, Check, ChevronDown, ChevronRight, Circle, ClipboardList,
  Edit3, HelpCircle, Link2, Link2Off, MoreHorizontal, Plus, Save, Search, Target, Trash2, X,
} from 'lucide-react';
import { goalsApi, keyResultsApi, tasksApi } from '@/api';
import { useGoalStore } from '@/store/useGoalStore';
import { Button } from '@/components/common/Button';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { Input, Textarea } from '@/components/common/Input';
import { Modal } from '@/components/common/Modal';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { GoalWithDetails, KeyResult, KeyResultWithLogs, LinkedTask, Task } from '@/types';

type SortField = 'title' | 'progress';
type SortDirection = 'asc' | 'desc';
type GoalStatus = 'draft' | 'active';
type KRType = 'metric' | 'boolean';
type DetailTab = 'krs' | 'tasks';

interface DraftKR {
  id?: string;
  title: string;
  type: KRType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string;
  weight: number;
}

const blankKR = (weight = 100): DraftKR => ({
  title: '',
  type: 'metric',
  startValue: 0,
  targetValue: 100,
  currentValue: 0,
  unit: '%',
  weight,
});

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const clampProgress = (value: number) => Math.max(0, Math.min(1, value));

const krProgress = (kr: KeyResult) => {
  if (kr.type === 'boolean') return kr.isCompleted ? 1 : 0;
  const range = kr.targetValue - kr.startValue;
  if (Math.abs(range) < Number.EPSILON) return 0;
  return clampProgress((kr.currentValue - kr.startValue) / range);
};

const progressColor = (progress: number) => {
  if (progress <= 0) return '#cbd5e1';
  if (progress < 0.5) return '#f6c453';
  return '#68d391';
};

type TaskStatusLike = Pick<Task, 'isCompleted' | 'status'>;

const taskStatusLabel = (task: TaskStatusLike, t: (key: string) => string) => {
  if (task.isCompleted) return t('board.statusCompleted');
  const labels: Record<Task['status'], string> = {
    not_started: t('board.statusNotStarted'),
    in_progress: t('board.statusInProgress'),
    long_term: t('board.statusLongTerm'),
    completed: t('board.statusCompleted'),
    closed: t('board.statusClosed'),
  };
  return labels[task.status] || t('board.statusNotStarted');
};

const taskStatusClass = (task: TaskStatusLike) => {
  if (task.isCompleted || task.status === 'completed') return 'bg-green-500/15 text-green-600';
  if (task.status === 'in_progress' || task.status === 'long_term') return 'bg-amber-500/15 text-amber-600';
  if (task.status === 'closed') return 'bg-slate-500/15 text-slate-500';
  return 'bg-red-500/15 text-red-500';
};

const healthState = (progress: number): 'normal' | 'risk' | 'behind' => {
  if (progress >= 0.6) return 'normal';
  if (progress >= 0.25) return 'risk';
  return 'behind';
};

const normalizeKRs = (items: DraftKR[]) => {
  if (items.length === 0) return [];
  const normalized = items.map((item) => ({ ...item, weight: clamp(item.weight) }));
  const previousWeight = normalized.slice(0, -1).reduce((sum, item) => sum + item.weight, 0);
  normalized[normalized.length - 1] = {
    ...normalized[normalized.length - 1],
    weight: clamp(100 - previousWeight),
  };
  return normalized;
};

const krToDraft = (kr: KeyResult): DraftKR => ({
  id: kr.id,
  title: kr.title,
  type: kr.type === 'boolean' ? 'boolean' : 'metric',
  startValue: kr.type === 'boolean' ? 0 : kr.startValue,
  targetValue: kr.type === 'boolean' ? 1 : kr.targetValue,
  currentValue: kr.currentValue,
  unit: kr.type === 'boolean' ? '' : (kr.unit || '%'),
  weight: kr.weight,
});

export function GoalsPage() {
  const { t } = useTranslation();
  const {
    goals, fetchGoals, createGoal, createKeyResult, updateGoal,
    deleteGoal, checkInKeyResult, toggleKeyResult, deleteKeyResult, linkTaskToKR, unlinkTaskFromKR,
  } = useGoalStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithDetails | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formDueAt, setFormDueAt] = useState('');
  const [draftKRs, setDraftKRs] = useState<DraftKR[]>([blankKR()]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<SortField>('title');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [detailGoal, setDetailGoal] = useState<GoalWithDetails | null>(null);
  const [detailKRs, setDetailKRs] = useState<KeyResultWithLogs[]>([]);
  const [detailTab, setDetailTab] = useState<DetailTab>('krs');
  const [workingValues, setWorkingValues] = useState<Record<string, number>>({});
  const [workingDone, setWorkingDone] = useState<Record<string, boolean>>({});
  const [progressComment, setProgressComment] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [taskLinkOpen, setTaskLinkOpen] = useState(false);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    title?: string;
    message?: string;
    onConfirm: () => Promise<void>;
  }>({ open: false, onConfirm: async () => {} });

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const allGoals = useMemo(() => {
    const result: GoalWithDetails[] = [];
    const visit = (items: GoalWithDetails[]) => {
      items.forEach((goal) => {
        result.push(goal);
        visit(goal.subGoals);
      });
    };
    visit(goals);
    return result;
  }, [goals]);

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const comparison = sortField === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : a.progress - b.progress;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [goals, sortDirection, sortField]);

  const displayKRs = normalizeKRs(draftKRs);
  const totalWeight = displayKRs.reduce((sum, kr) => sum + kr.weight, 0);

  const pathForGoal = (goal: GoalWithDetails | null) => {
    if (!goal) return [];
    const byId = new Map(allGoals.map((item) => [item.id, item]));
    const path: GoalWithDetails[] = [];
    let current: GoalWithDetails | undefined = goal;
    while (current) {
      path.unshift(current);
      current = current.parentGoalId ? byId.get(current.parentGoalId) : undefined;
    }
    return path;
  };

  const hasUnsavedDetail = () => {
    return detailKRs.some((kr) => {
      if (kr.type === 'boolean') return (workingDone[kr.id] ?? kr.isCompleted) !== kr.isCompleted;
      return (workingValues[kr.id] ?? kr.currentValue) !== kr.currentValue;
    }) || progressComment.trim().length > 0;
  };

  const resetGoalForm = () => {
    setFormTitle('');
    setFormParentId('');
    setFormDueAt('');
    setDraftKRs([blankKR()]);
    setEditingGoal(null);
  };

  const openCreate = () => {
    resetGoalForm();
    setCreateOpen(true);
  };

  const openEdit = () => {
    if (!detailGoal) return;
    setEditingGoal(detailGoal);
    setFormTitle(detailGoal.title);
    setFormParentId(detailGoal.parentGoalId || '');
    setFormDueAt(detailGoal.dueAt ? dayjs(detailGoal.dueAt).format('YYYY-MM-DD') : '');
    setDraftKRs(detailKRs.length > 0 ? detailKRs.map(krToDraft) : [blankKR()]);
    setCreateOpen(true);
    setMoreOpen(false);
  };

  const closeGoalForm = () => {
    setCreateOpen(false);
    resetGoalForm();
  };

  const updateDraftKR = (index: number, patch: Partial<DraftKR>) => {
    setDraftKRs((items) => normalizeKRs(items.map((item, idx) => {
      if (idx !== index) return item;
      const next = { ...item, ...patch };
      if (patch.type === 'boolean') {
        next.startValue = 0;
        next.targetValue = 1;
        next.currentValue = item.currentValue > 0 ? 1 : 0;
        next.unit = '';
      }
      if (patch.type === 'metric' && !next.unit) {
        next.unit = '%';
        next.targetValue = next.targetValue || 100;
      }
      return next;
    })));
  };

  const addDraftKR = () => {
    const normalized = normalizeKRs(draftKRs);
    const remaining = clamp(100 - normalized.reduce((sum, kr) => sum + kr.weight, 0));
    setDraftKRs(normalizeKRs([...normalized, blankKR(remaining)]));
  };

  const removeDraftKR = (index: number) => {
    setDraftKRs((items) => {
      const next = items.filter((_, idx) => idx !== index);
      return normalizeKRs(next.length > 0 ? next : [blankKR()]);
    });
  };

  const saveGoal = async (status: GoalStatus) => {
    if (!formTitle.trim()) {
      toast.error(t('goal.required'));
      return;
    }

    const validKRs = displayKRs.filter((kr) => kr.title.trim());
    if (validKRs.length > 0 && totalWeight !== 100) {
      toast.error(t('goal.weightMustEqual100'));
      return;
    }

    if (editingGoal) {
      await updateGoal(editingGoal.id, {
        title: formTitle.trim(),
        parentGoalId: formParentId || null,
        dueAt: formDueAt || null,
      });
      const existingIds = new Set(detailKRs.map((kr) => kr.id));
      const keptIds = new Set(validKRs.filter((kr) => kr.id).map((kr) => kr.id!));
      for (const kr of validKRs) {
        if (kr.id) {
          await keyResultsApi.update({
            id: kr.id,
            title: kr.title.trim(),
            krType: kr.type,
            startValue: kr.type === 'metric' ? kr.startValue : 0,
            targetValue: kr.type === 'metric' ? kr.targetValue : 1,
            unit: kr.type === 'metric' ? kr.unit : '',
            weight: kr.weight,
          });
        } else {
          await createKeyResult({
            goalId: editingGoal.id,
            title: kr.title.trim(),
            krType: kr.type,
            startValue: kr.type === 'metric' ? kr.startValue : 0,
            targetValue: kr.type === 'metric' ? kr.targetValue : 1,
            unit: kr.type === 'metric' ? kr.unit : undefined,
            weight: kr.weight,
          });
        }
      }
      for (const id of existingIds) {
        if (!keptIds.has(id)) await deleteKeyResult(id);
      }
      closeGoalForm();
      await fetchGoals();
      await refreshDetail();
      toast.success(t('board.save'));
      return;
    }

    const created = await createGoal({
      title: formTitle.trim(),
      parentGoalId: formParentId || undefined,
      dueAt: formDueAt || undefined,
      period: formDueAt ? 'custom' : undefined,
      status,
    });
    for (const kr of validKRs) {
      await createKeyResult({
        goalId: created.id,
        title: kr.title.trim(),
        krType: kr.type,
        startValue: kr.type === 'metric' ? kr.startValue : 0,
        targetValue: kr.type === 'metric' ? kr.targetValue : 1,
        unit: kr.type === 'metric' ? kr.unit : undefined,
        weight: kr.weight,
      });
    }
    closeGoalForm();
    toast.success(status === 'draft' ? t('goal.draftSaved') : t('goal.created'));
  };

  const setSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const openDetail = async (goal: GoalWithDetails) => {
    setDetailGoal(goal);
    setDetailTab('krs');
    setMoreOpen(false);
    const krs = await keyResultsApi.list(goal.id);
    setDetailKRs(krs);
    setWorkingValues(Object.fromEntries(krs.map((kr) => [kr.id, kr.currentValue])));
    setWorkingDone(Object.fromEntries(krs.map((kr) => [kr.id, kr.isCompleted])));
    setProgressComment('');
  };

  const refreshDetail = async () => {
    if (!detailGoal) return;
    const [goal, krs] = await Promise.all([
      goalsApi.get(detailGoal.id),
      keyResultsApi.list(detailGoal.id),
    ]);
    setDetailGoal(goal);
    setDetailKRs(krs);
    setWorkingValues(Object.fromEntries(krs.map((kr) => [kr.id, kr.currentValue])));
    setWorkingDone(Object.fromEntries(krs.map((kr) => [kr.id, kr.isCompleted])));
  };

  const requestCloseDetail = () => {
    if (hasUnsavedDetail()) {
      setPendingClose(true);
      return;
    }
    setDetailGoal(null);
  };

  const updateAllKRProgress = async () => {
    for (const kr of detailKRs) {
      if (kr.type === 'boolean') {
        const nextDone = workingDone[kr.id] ?? kr.isCompleted;
        if (nextDone !== kr.isCompleted) await toggleKeyResult(kr.id);
      } else {
        const nextValue = workingValues[kr.id] ?? kr.currentValue;
        if (nextValue !== kr.currentValue || progressComment.trim()) {
          await checkInKeyResult(kr.id, nextValue, progressComment.trim() || undefined);
        }
      }
    }
    setProgressComment('');
    await refreshDetail();
    toast.success(t('goal.progressUpdated'));
  };

  const confirmUpdateAndClose = async () => {
    await updateAllKRProgress();
    setPendingClose(false);
    setDetailGoal(null);
  };

  const finishGoal = async () => {
    if (!detailGoal) return;
    await updateGoal(detailGoal.id, { status: 'completed' });
    await refreshDetail();
    toast.success(t('goal.goalCompleted'));
  };

  const unlinkTask = async (task: LinkedTask) => {
    if (!task.krId) return;
    setDeleteConfirm({
      open: true,
      title: t('goal.unlinkTask'),
      message: t('goal.unlinkTaskConfirm'),
      onConfirm: async () => {
        await unlinkTaskFromKR(task.krId!, task.id);
        await refreshDetail();
      },
    });
  };

  const openTaskLink = async () => {
    if (!detailGoal) return;
    const tasks = await tasksApi.listAll();
    setAllTasks(tasks);
    setTaskSearch('');
    setSelectedTaskId('');
    setTaskLinkOpen(true);
  };

  const confirmTaskLink = async () => {
    if (!selectedTaskId || detailKRs.length === 0) return;
    await linkTaskToKR(detailKRs[0].id, selectedTaskId);
    setTaskLinkOpen(false);
    setSelectedTaskId('');
    await refreshDetail();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Target size={22} />
          {t('goal.title')}
        </h1>
        <Button onClick={openCreate}>
          <Plus size={16} />
          {t('goal.addGoal')}
        </Button>
      </div>

      <div className="border border-border overflow-x-auto bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(0,1fr)_340px_110px] border-b border-border text-sm font-semibold">
            <SortHeader label={t('goal.title')} active={sortField === 'title'} direction={sortDirection} onClick={() => setSort('title')} />
            <SortHeader label={t('goal.progress')} active={sortField === 'progress'} direction={sortDirection} onClick={() => setSort('progress')} />
            <div className="px-4 py-3 text-center border-l border-border">{t('goal.weight')}</div>
          </div>

          {sortedGoals.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Target size={30} className="mx-auto mb-2 opacity-40" />
              {t('goal.noGoals')}
            </div>
          ) : (
            sortedGoals.map((goal, index) => (
              <GoalTreeRows
                key={goal.id}
                goal={goal}
                level={0}
                indexPath={[index + 1]}
                expanded={expanded}
                setExpanded={setExpanded}
                onOpen={openDetail}
              />
            ))
          )}
        </div>
      </div>

      <GoalFormModal
        open={createOpen}
        editing={!!editingGoal}
        title={formTitle}
        parentId={formParentId}
        dueAt={formDueAt}
        goals={allGoals}
        currentGoalId={editingGoal?.id}
        draftKRs={displayKRs}
        totalWeight={totalWeight}
        onTitleChange={setFormTitle}
        onParentChange={setFormParentId}
        onDueAtChange={setFormDueAt}
        onKRChange={updateDraftKR}
        onKRDelete={removeDraftKR}
        onKRAdd={addDraftKR}
        onClose={closeGoalForm}
        onSaveDraft={() => saveGoal('draft')}
        onConfirm={() => saveGoal('active')}
      />

      <GoalDetailModal
        goal={detailGoal}
        path={pathForGoal(detailGoal)}
        keyResults={detailKRs}
        tab={detailTab}
        workingValues={workingValues}
        workingDone={workingDone}
        progressComment={progressComment}
        showHistory={showHistory}
        moreOpen={moreOpen}
        onClose={requestCloseDetail}
        onEdit={openEdit}
        onMoreToggle={() => setMoreOpen((value) => !value)}
        onTabChange={setDetailTab}
        onValueChange={(id, value) => setWorkingValues((state) => ({ ...state, [id]: value }))}
        onDoneChange={(id, value) => setWorkingDone((state) => ({ ...state, [id]: value }))}
        onCommentChange={setProgressComment}
        onUpdate={updateAllKRProgress}
        onToggleHistory={() => setShowHistory((value) => !value)}
        onFinish={finishGoal}
        onDelete={() => detailGoal && setDeleteConfirm({
          open: true,
          onConfirm: async () => {
            await deleteGoal(detailGoal.id);
            setDetailGoal(null);
          },
        })}
        onUnlinkTask={unlinkTask}
        onLinkTask={openTaskLink}
      />

      <TaskLinkModal
        open={taskLinkOpen}
        tasks={allTasks}
        linkedTaskIds={new Set(detailGoal?.linkedTasks.map((task) => task.id) || [])}
        search={taskSearch}
        selectedTaskId={selectedTaskId}
        canConfirm={detailKRs.length > 0}
        onSearchChange={setTaskSearch}
        onSelect={setSelectedTaskId}
        onClose={() => setTaskLinkOpen(false)}
        onConfirm={confirmTaskLink}
      />

      <UnsavedConfirmModal
        open={pendingClose}
        onDiscard={() => {
          setPendingClose(false);
          setDetailGoal(null);
        }}
        onCancel={() => setPendingClose(false)}
        onConfirm={confirmUpdateAndClose}
      />

      <DeleteConfirmModal
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        message={deleteConfirm.message}
        onClose={() => setDeleteConfirm((state) => ({ ...state, open: false }))}
        onConfirm={deleteConfirm.onConfirm}
      />
    </div>
  );
}

function SortHeader({ label, active, direction, onClick }: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button className="px-4 py-3 flex items-center gap-1 text-left hover:bg-surface-2" onClick={onClick}>
      {label}
      <span className={active ? 'text-primary text-xs' : 'text-text-muted/50 text-xs'}>
        {active ? (direction === 'desc' ? 'down' : 'up') : 'up/down'}
      </span>
    </button>
  );
}

function GoalTreeRows({
  goal, level, indexPath, expanded, setExpanded, onOpen,
}: {
  goal: GoalWithDetails;
  level: number;
  indexPath: number[];
  expanded: Record<string, boolean>;
  setExpanded: (expanded: Record<string, boolean>) => void;
  onOpen: (goal: GoalWithDetails) => void;
}) {
  const { t } = useTranslation();
  const isOpen = expanded[goal.id] ?? true;
  const hasChildren = goal.keyResults.length > 0 || goal.subGoals.length > 0;
  const label = `O${indexPath[indexPath.length - 1]}`;

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_340px_110px] min-h-16 items-center border-b border-border hover:bg-surface-2/40">
        <div className="px-4 flex items-center gap-3 min-w-0" style={{ paddingLeft: 18 + level * 26 }}>
          <button className="btn-ghost p-0.5 text-text-muted" onClick={() => setExpanded({ ...expanded, [goal.id]: !isOpen })} disabled={!hasChildren}>
            {hasChildren ? (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="inline-block w-4" />}
          </button>
          <span className="rounded-full bg-primary/10 text-primary text-sm font-semibold px-3 py-1">{label}</span>
          <button className="truncate font-semibold text-left hover:text-primary" onClick={() => onOpen(goal)}>{goal.title}</button>
          {goal.status === 'draft' && <span className="text-[10px] px-1.5 py-0.5 border border-warning/40 text-warning">{t('goal.draft')}</span>}
        </div>
        <ProgressCell progress={goal.progress} />
        <div className="px-4 text-center text-sm text-text-muted border-l border-border">-</div>
      </div>

      {isOpen && goal.keyResults.map((kr, index) => {
        const progress = krProgress(kr);
        return (
          <div key={kr.id} className="grid grid-cols-[minmax(0,1fr)_340px_110px] min-h-14 items-center border-b border-border bg-surface-2/20">
            <div className="px-4 flex items-center gap-3 min-w-0 text-sm" style={{ paddingLeft: 54 + level * 26 }}>
              <span className="text-border">|-</span>
              <span className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">KR{index + 1}</span>
              <span className="truncate">{kr.title}</span>
            </div>
            <ProgressCell progress={progress} />
            <div className="px-4 text-center text-sm tabular-nums border-l border-border">{kr.weight}%</div>
          </div>
        );
      })}

      {isOpen && goal.subGoals.map((subGoal, index) => (
        <GoalTreeRows
          key={subGoal.id}
          goal={subGoal}
          level={level + 1}
          indexPath={[...indexPath, index + 1]}
          expanded={expanded}
          setExpanded={setExpanded}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function ProgressCell({ progress }: { progress: number }) {
  return (
    <div className="px-4 flex items-center gap-3 border-l border-border">
      <ProgressBar value={progress} color={progressColor(progress)} className="w-36" />
      <span className="w-16 text-sm tabular-nums">{(progress * 100).toFixed(progress * 100 % 1 === 0 ? 0 : 2)}%</span>
    </div>
  );
}

function GoalFormModal({
  open, editing, title, parentId, dueAt, goals, currentGoalId, draftKRs, totalWeight,
  onTitleChange, onParentChange, onDueAtChange, onKRChange, onKRDelete, onKRAdd,
  onClose, onSaveDraft, onConfirm,
}: {
  open: boolean;
  editing: boolean;
  title: string;
  parentId: string;
  dueAt: string;
  goals: GoalWithDetails[];
  currentGoalId?: string;
  draftKRs: DraftKR[];
  totalWeight: number;
  onTitleChange: (value: string) => void;
  onParentChange: (value: string) => void;
  onDueAtChange: (value: string) => void;
  onKRChange: (index: number, patch: Partial<DraftKR>) => void;
  onKRDelete: (index: number) => void;
  onKRAdd: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const parentOptions = goals.filter((goal) => goal.id !== currentGoalId);
  const parentDisabled = parentOptions.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('goal.editGoal') : t('goal.addGoal')}
      size="xl"
      footer={
        <div className="w-full flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          {!editing && (
            <Button variant="outline" onClick={onSaveDraft}>
              <Save size={15} /> {t('goal.saveDraft')}
            </Button>
          )}
          <Button onClick={onConfirm}>
            <Check size={15} /> {t('common.confirm')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Input label={`${t('goal.goalName')} *`} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={t('goal.goalNamePlaceholder')} autoFocus />

        <div className={editing ? 'grid grid-cols-2 gap-6' : ''}>
          <div>
            <label className="label">{t('goal.parentGoal')}</label>
            <select className="input w-full disabled:bg-surface-2 disabled:text-text-muted" value={parentId} onChange={(event) => onParentChange(event.target.value)} disabled={parentDisabled}>
              <option value="">{t('goal.parentGoalPlaceholder')}</option>
              {parentOptions.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
            </select>
          </div>
          {editing && (
            <Input label={`${t('goal.due')} *`} type="date" value={dueAt} onChange={(event) => onDueAtChange(event.target.value)} />
          )}
        </div>

        <section className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary text-white">KR</span>
              {t('goal.keyResult')}
              <HelpCircle size={14} className="text-text-muted" />
            </div>
            <div className={totalWeight === 100 ? 'text-sm text-text-muted' : 'text-sm text-red-500 font-medium'}>
              {t('goal.totalWeight')}: {totalWeight}%
            </div>
          </div>

          <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-2">
            {draftKRs.map((kr, index) => (
              <DraftKRRow
                key={kr.id || index}
                kr={kr}
                isLast={index === draftKRs.length - 1}
                onChange={(patch) => onKRChange(index, patch)}
                onDelete={() => onKRDelete(index)}
              />
            ))}
          </div>

          <button className="mt-3 inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary" onClick={onKRAdd}>
            <Plus size={16} /> {t('goal.addKR')}
          </button>
        </section>
      </div>
    </Modal>
  );
}

function DraftKRRow({ kr, isLast, onChange, onDelete }: {
  kr: DraftKR;
  isLast: boolean;
  onChange: (patch: Partial<DraftKR>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-border pb-3">
      <div className="grid grid-cols-[24px_minmax(0,1fr)_190px_32px] gap-3 items-start">
        <ChevronDown size={16} className="text-text-muted mt-3" />
        <Input value={kr.title} onChange={(event) => onChange({ title: event.target.value })} placeholder={t('goal.krTitlePlaceholder')} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">{t('goal.weight')}</span>
          <input className="input h-10 w-24 disabled:bg-surface-2 disabled:text-text-muted" type="number" min={0} max={100} value={kr.weight} disabled={isLast}
            onChange={(event) => onChange({ weight: clamp(Number(event.target.value) || 0) })} />
          <span className="text-sm">%</span>
        </div>
        <button className="btn-ghost p-2 text-text-muted hover:text-red-500" onClick={onDelete} title={t('common.delete')}>
          <Trash2 size={16} />
        </button>
      </div>
      <div className="grid grid-cols-[160px_180px_220px_220px] gap-4 mt-2 ml-9 items-end">
        <select className="input h-10" value={kr.type} onChange={(event) => onChange({ type: event.target.value as KRType })}>
          <option value="metric">{t('goal.metricProgress')}</option>
          <option value="boolean">{t('goal.boolean')}</option>
        </select>
        <Input label={t('goal.unit')} value={kr.unit} disabled={kr.type === 'boolean'} onChange={(event) => onChange({ unit: event.target.value })} placeholder="%" />
        <Input label={t('goal.startValue')} type={kr.type === 'metric' ? 'number' : 'text'} value={kr.type === 'metric' ? kr.startValue : t('goal.notCompleted')} disabled={kr.type === 'boolean'}
          onChange={(event) => onChange({ startValue: Number(event.target.value) || 0 })} />
        <Input label={t('goal.targetValue')} type={kr.type === 'metric' ? 'number' : 'text'} value={kr.type === 'metric' ? kr.targetValue : t('goal.completed')} disabled={kr.type === 'boolean'}
          onChange={(event) => onChange({ targetValue: Number(event.target.value) || 0 })} />
      </div>
    </div>
  );
}

function GoalDetailModal({
  goal, path, keyResults, tab, workingValues, workingDone, progressComment,
  showHistory, moreOpen, onClose, onEdit, onMoreToggle, onTabChange, onValueChange,
  onDoneChange, onCommentChange, onUpdate, onToggleHistory, onFinish, onDelete, onUnlinkTask, onLinkTask,
}: {
  goal: GoalWithDetails | null;
  path: GoalWithDetails[];
  keyResults: KeyResultWithLogs[];
  tab: DetailTab;
  workingValues: Record<string, number>;
  workingDone: Record<string, boolean>;
  progressComment: string;
  showHistory: boolean;
  moreOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onMoreToggle: () => void;
  onTabChange: (tab: DetailTab) => void;
  onValueChange: (id: string, value: number) => void;
  onDoneChange: (id: string, value: boolean) => void;
  onCommentChange: (value: string) => void;
  onUpdate: () => Promise<void>;
  onToggleHistory: () => void;
  onFinish: () => Promise<void>;
  onDelete: () => void;
  onUnlinkTask: (task: LinkedTask) => void;
  onLinkTask: () => void;
}) {
  const { t } = useTranslation();
  if (!goal) return null;

  const history = keyResults
    .flatMap((kr) => kr.logs.map((log) => ({ ...log, krTitle: kr.title })))
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());

  return (
    <Modal open={true} onClose={onClose} size="xl">
      <div className={`grid ${showHistory ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1'} gap-0 -m-5`}>
        <div className="p-5 border-r border-border min-w-0">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <div className="text-sm text-text-muted mb-5 flex items-center gap-2">
                <span>{t('goal.parentGoal')}:</span>
                {path.length > 1 ? path.slice(0, -1).map((item) => <span key={item.id} className="text-primary">{item.title}</span>) : <span>{t('goal.none')}</span>}
              </div>
              <h2 className="text-2xl font-semibold truncate">{goal.title}</h2>
            </div>
            <div className="flex items-center gap-1 relative">
              <button className="btn-ghost p-2" onClick={onEdit} title={t('goal.editGoal')}><Edit3 size={18} /></button>
              <button className="btn-ghost p-2 bg-primary/10" onClick={onMoreToggle}><MoreHorizontal size={18} /></button>
              <button className="btn-ghost p-2" onClick={onClose}><X size={18} /></button>
              {moreOpen && (
                <div className="absolute right-8 top-10 w-44 bg-surface border border-border shadow-lg z-10">
                  <button className="w-full text-left px-4 py-3 hover:bg-surface-2" onClick={onFinish}>{t('goal.finishGoal')}</button>
                  <button className="w-full text-left px-4 py-3 hover:bg-surface-2 text-red-500" onClick={onDelete}>{t('common.delete')}</button>
                </div>
              )}
            </div>
          </div>

          <section className="mb-5">
            <div className="text-sm text-text-muted mb-2">{t('goal.overallProgress')}</div>
            <div className="flex items-center gap-3 max-w-sm">
              <ProgressBar value={goal.progress} color={progressColor(goal.progress)} className="flex-1" />
              <span className="text-primary tabular-nums">{(goal.progress * 100).toFixed(2)}%</span>
              <HelpCircle size={15} className="text-primary" />
            </div>
            <div className="text-xs text-text-muted mt-4">
              {goal.dueAt && <span>{t('goal.due')}: {dayjs(goal.dueAt).format('M月D日 HH:mm')}</span>}
              <span className="ml-6">{t('board.updatedAt')}: {dayjs(goal.updatedAt).format('M月D日 HH:mm')}</span>
            </div>
          </section>

          <div className="flex items-center justify-between border-b border-border mb-4">
            <div className="flex items-center gap-6">
              <TabButton active={tab === 'krs'} onClick={() => onTabChange('krs')} label={`${t('goal.keyResult')} ${keyResults.length}`} />
              <TabButton active={tab === 'tasks'} onClick={() => onTabChange('tasks')} label={`${t('goal.relatedTasks')} ${goal.linkedTasks.length}`} />
            </div>
            <Button size="sm" variant="ghost" onClick={onToggleHistory}>
              <Activity size={14} /> {t('goal.progressHistory')}
            </Button>
          </div>

          {tab === 'krs' ? (
            <KeyResultsPanel
              goal={goal}
              keyResults={keyResults}
              workingValues={workingValues}
              workingDone={workingDone}
              progressComment={progressComment}
              onValueChange={onValueChange}
              onDoneChange={onDoneChange}
              onCommentChange={onCommentChange}
              onUpdate={onUpdate}
            />
          ) : (
            <RelatedTasksPanel tasks={goal.linkedTasks} onUnlink={onUnlinkTask} onLink={onLinkTask} />
          )}

          <div className="flex items-center gap-5 text-xs text-text-muted mt-5 pt-3">
            <span>{t('board.createdAt')} {dayjs(goal.createdAt).format('YYYY年M月D日 HH:mm')}</span>
            <span>{t('board.updatedAt')} {dayjs(goal.updatedAt).format('YYYY年M月D日 HH:mm')}</span>
          </div>
        </div>

        <aside className={showHistory ? 'p-5 bg-surface-2/30' : 'hidden'}>
          <h4 className="font-semibold border-b border-primary pb-3 mb-4 text-primary">{t('goal.progressHistory')}</h4>
          <div className="relative pl-5 space-y-5 before:absolute before:left-[6px] before:top-2 before:bottom-2 before:w-px before:bg-border">
            {history.map((item) => (
              <div key={item.id} className="relative">
                <span className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-primary border-2 border-surface" />
                <div className="text-xs text-text-muted">{dayjs(item.createdAt).format('YYYY年 M月D日 HH:mm')}</div>
                <div className="text-sm mt-0.5">{item.krTitle}: {item.oldValue} -&gt; {item.newValue}</div>
                {item.comment && <div className="text-xs text-text-muted mt-1 whitespace-pre-wrap">{item.comment}</div>}
              </div>
            ))}
            <div className="relative">
              <span className="absolute -left-5 top-1 w-3 h-3 rounded-full bg-text-muted border-2 border-surface" />
              <div className="text-xs text-text-muted">{dayjs(goal.createdAt).format('YYYY年 M月D日 HH:mm')}</div>
              <div className="text-sm mt-0.5">{t('goal.goalCreated')}</div>
            </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`py-3 text-sm font-medium border-b-2 ${active ? 'text-primary border-primary' : 'text-text-muted border-transparent'}`} onClick={onClick}>
      {label}
    </button>
  );
}

function KeyResultsPanel({
  goal, keyResults, workingValues, workingDone, progressComment,
  onValueChange, onDoneChange, onCommentChange, onUpdate,
}: {
  goal: GoalWithDetails;
  keyResults: KeyResultWithLogs[];
  workingValues: Record<string, number>;
  workingDone: Record<string, boolean>;
  progressComment: string;
  onValueChange: (id: string, value: number) => void;
  onDoneChange: (id: string, value: boolean) => void;
  onCommentChange: (value: string) => void;
  onUpdate: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="text-sm text-text-muted mb-3">{t('goal.totalKR', { count: keyResults.length })}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_260px_80px_120px] text-sm text-text-muted border-b border-border pb-2">
        <span>{t('goal.keyResult')}</span>
        <span>{t('goal.progress')}</span>
        <span>{t('goal.weight')}</span>
        <span>{t('goal.status')}</span>
      </div>
      <div>
        {keyResults.map((kr) => {
          const progress = kr.type === 'boolean' ? ((workingDone[kr.id] ?? kr.isCompleted) ? 1 : 0) : krProgress({ ...kr, currentValue: workingValues[kr.id] ?? kr.currentValue });
          return (
            <div key={kr.id} className="border-b border-border py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_260px_80px_120px] items-center gap-3">
                <div className="font-medium truncate flex items-center gap-2"><ChevronDown size={15} className="text-text-muted" />{kr.title}</div>
                <div className="flex items-center gap-3">
                  <ProgressBar value={progress} color={progressColor(progress)} className="flex-1" />
                  <span className="w-12 text-sm tabular-nums">{(progress * 100).toFixed(0)}%</span>
                </div>
                <span>{kr.weight}%</span>
                <HealthLights active={healthState(progress)} />
              </div>
              <div className="mt-3 pl-6 flex items-center gap-5">
                {kr.type === 'boolean' ? (
                  <>
                    <span className="text-sm text-text-muted">{t('goal.currentProgress')}</span>
                    <div className="inline-flex rounded border border-border overflow-hidden">
                      <button className={`px-4 py-1.5 text-sm ${(workingDone[kr.id] ?? kr.isCompleted) ? 'bg-surface' : 'bg-primary text-white'}`} onClick={() => onDoneChange(kr.id, false)}>{t('goal.notCompleted')}</button>
                      <button className={`px-4 py-1.5 text-sm ${(workingDone[kr.id] ?? kr.isCompleted) ? 'bg-primary text-white' : 'bg-surface'}`} onClick={() => onDoneChange(kr.id, true)}>{t('goal.completed')}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <Input label={t('goal.currentProgress')} type="number" value={workingValues[kr.id] ?? kr.currentValue} onChange={(event) => onValueChange(kr.id, Number(event.target.value) || 0)} />
                    <span className="pb-2 text-sm">{kr.unit || ''}</span>
                    <span className="pb-2 text-sm text-text-muted">{t('goal.startValue')} {kr.startValue}{kr.unit || ''}</span>
                    <span className="pb-2 text-sm text-text-muted">{t('goal.targetValue')} {kr.targetValue}{kr.unit || ''}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Textarea className="mt-4 min-h-[150px]" value={progressComment} onChange={(event) => onCommentChange(event.target.value)} placeholder={t('goal.commentPlaceholder')} />
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onUpdate}>{t('goal.updateKR')}</Button>
        <HelpCircle size={16} className="text-text-muted" />
      </div>
      <div className="sr-only">{goal.id}</div>
    </>
  );
}

function RelatedTasksPanel({ tasks, onUnlink, onLink }: { tasks: LinkedTask[]; onUnlink: (task: LinkedTask) => void; onLink: () => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex items-center justify-between text-sm text-text-muted mb-3">
        <span>{t('goal.totalRelatedTasks', { count: tasks.length })}</span>
        <button className="inline-flex items-center gap-2 hover:text-primary transition-colors" onClick={onLink}>
          <Link2 size={15} />{t('goal.linkTask')}
        </button>
      </div>
      <div className="border-t border-border">
        {tasks.length === 0 && <div className="py-10 text-center text-text-muted">{t('common.empty')}</div>}
        {tasks.map((task) => (
          <div key={`${task.krId}-${task.id}`} className="group grid grid-cols-[minmax(0,1fr)_180px_140px_120px_42px] items-center min-h-14 border-b border-border">
            <div className="px-4 font-medium truncate">{task.title}</div>
            <div className="text-sm text-text-muted">{task.boardName}/{task.listName}</div>
            <div className="text-sm text-text-muted">{task.dueAt ? dayjs(task.dueAt).format('YYYY-MM-DD') : ''}</div>
            <span className={`justify-self-start text-xs px-3 py-1 rounded-full ${taskStatusClass(task)}`}>
              {taskStatusLabel(task, t)}
            </span>
            <button className="opacity-0 group-hover:opacity-100 btn-ghost p-1 text-primary" onClick={() => onUnlink(task)} title={t('goal.unlinkTask')}>
              <Link2Off size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskLinkModal({
  open, tasks, linkedTaskIds, search, selectedTaskId, canConfirm,
  onSearchChange, onSelect, onClose, onConfirm,
}: {
  open: boolean;
  tasks: Task[];
  linkedTaskIds: Set<string>;
  search: string;
  selectedTaskId: string;
  canConfirm: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (linkedTaskIds.has(task.id)) return false;
      if (!keyword) return true;
      return task.title.toLowerCase().includes(keyword);
    });
  }, [linkedTaskIds, search, tasks]);

  const selectedTask = filteredTasks.find((task) => task.id === selectedTaskId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goal.selectRelatedTask')}
      size="xl"
      footer={(
        <div className="w-full flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={onConfirm} disabled={!selectedTask || !canConfirm}>{t('common.confirm')}</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-5 border-b border-border pb-4">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-10 h-11"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredTasks[0]) onSelect(filteredTasks[0].id);
              }}
              placeholder={t('goal.searchTaskPlaceholder')}
              autoFocus
            />
          </div>
          <div className="text-sm text-text-muted min-w-24">{t('goal.totalTasks', { count: filteredTasks.length })}</div>
        </div>

        {!canConfirm && (
          <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            {t('goal.noKeyResultForTaskLink')}
          </div>
        )}

        <div className="max-h-[520px] overflow-y-auto border border-border">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_150px_150px_150px] text-sm font-medium text-text-muted border-b border-border bg-surface-2/40 sticky top-0">
            <div className="px-3 py-3"></div>
            <div className="px-4 py-3">{t('goal.taskTitle')}</div>
            <div className="px-4 py-3 border-l border-border">{t('goal.status')}</div>
            <div className="px-4 py-3 border-l border-border">{t('board.currentPriority')}</div>
            <div className="px-4 py-3 border-l border-border">{t('board.dueDate')}</div>
          </div>
          {filteredTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">{t('common.empty')}</div>
          ) : (
            filteredTasks.map((task) => (
              <button
                key={task.id}
                className={`w-full grid grid-cols-[44px_minmax(0,1fr)_150px_150px_150px] items-center min-h-14 text-left border-b border-border last:border-b-0 hover:bg-surface-2/50 ${selectedTaskId === task.id ? 'bg-primary/5' : ''}`}
                onClick={() => onSelect(task.id)}
              >
                <div className="px-3">
                  <span className={`block w-4 h-4 rounded border ${selectedTaskId === task.id ? 'bg-primary border-primary' : 'border-border'}`}>
                    {selectedTaskId === task.id && <Check size={14} className="text-white" />}
                  </span>
                </div>
                <div className="px-4 font-medium truncate">{task.title}</div>
                <div className="px-4 border-l border-border">
                  <span className={`text-xs px-3 py-1 rounded-full ${taskStatusClass(task)}`}>
                    {taskStatusLabel(task, t)}
                  </span>
                </div>
                <div className="px-4 border-l border-border text-sm">{task.priority ? t(`board.priority${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)}`) : t('board.priorityNone')}</div>
                <div className="px-4 border-l border-border text-sm">{task.dueAt ? dayjs(task.dueAt).format('YYYY-MM-DD') : ''}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

function UnsavedConfirmModal({ open, onDiscard, onCancel, onConfirm }: {
  open: boolean;
  onDiscard: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onCancel} title={t('goal.confirmUpdate')} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-text-muted">{t('goal.confirmUpdateMessage')}</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onDiscard}>{t('goal.discardUpdate')}</Button>
          <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button onClick={onConfirm}>{t('common.confirm')}</Button>
        </div>
      </div>
    </Modal>
  );
}

function HealthLights({ active }: { active: 'normal' | 'risk' | 'behind' }) {
  const lights = [
    { key: 'normal', color: '#2dd4bf' },
    { key: 'risk', color: '#f59e0b' },
    { key: 'behind', color: '#fb7185' },
  ] as const;
  return (
    <div className="flex items-center gap-3" title={active}>
      {lights.map((light) => (
        <Circle
          key={light.key}
          size={17}
          fill={active === light.key ? light.color : 'transparent'}
          color={light.color}
          strokeWidth={active === light.key ? 3 : 1.6}
        />
      ))}
    </div>
  );
}
