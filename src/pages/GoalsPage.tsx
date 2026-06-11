import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, CalendarDays, Check, ChevronDown, ChevronRight, Circle, ClipboardList,
  Edit3, FileText, Filter, HelpCircle, Link2, Link2Off, MoreHorizontal, Plus, Save, Search, Target, Trash2, X,
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
type KRHealth = 'normal' | 'risk' | 'behind';
type GoalListStatus = 'active' | 'completed';

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

const KR_HEALTH_COLORS: Record<KRHealth, string> = {
  normal: '#2dd4bf',
  risk: '#f59e0b',
  behind: '#fb7185',
};

const weightedKRProgress = (
  keyResults: KeyResult[],
  valueFor: (kr: KeyResult) => number = krProgress,
) => {
  if (keyResults.length === 0) return 0;
  const totalWeight = keyResults.reduce((sum, kr) => sum + kr.weight, 0);
  if (totalWeight <= 0) return 0;
  return clampProgress(keyResults.reduce((sum, kr) => sum + valueFor(kr) * kr.weight, 0) / totalWeight);
};

const healthRank: Record<KRHealth, number> = { normal: 0, risk: 1, behind: 2 };

const worstGoalHealth = (goal: GoalWithDetails): KRHealth => {
  const healthStates = [
    ...goal.keyResults.map((kr) => (kr.healthStatus || 'normal') as KRHealth),
    ...goal.subGoals.map(worstGoalHealth),
  ];
  return healthStates.reduce<KRHealth>(
    (worst, health) => (healthRank[health] > healthRank[worst] ? health : worst),
    'normal',
  );
};

const formatForDateTimeInput = (value?: string | null) => {
  if (!value) return '';
  return dayjs(value).format('YYYY-MM-DDTHH:mm');
};

const dateTimeInputToIso = (value: string) => {
  if (!value) return undefined;
  return dayjs(value).format('YYYY-MM-DDTHH:mm:ss');
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
  unit: kr.type === 'boolean' ? '' : (kr.unit ?? '%'),
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
  const [formOriginalKRIds, setFormOriginalKRIds] = useState<string[]>([]);
  const [draftBoxOpen, setDraftBoxOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedGoals, setDeletedGoals] = useState<GoalWithDetails[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<string[]>([]);
  const [goalSearch, setGoalSearch] = useState('');
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [goalStatuses, setGoalStatuses] = useState<GoalListStatus[]>(['active', 'completed']);
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    confirmVariant?: 'primary' | 'danger';
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

  const visibleGoals = useMemo(() => {
    const query = goalSearch.trim().toLocaleLowerCase();
    const pickVisible = (items: GoalWithDetails[]): GoalWithDetails[] => items.flatMap((goal) => {
      if (goal.status === 'draft') return [];
      const subGoals = pickVisible(goal.subGoals);
      const statusMatches = goalStatuses.includes(goal.status as GoalListStatus);
      const searchMatches = !query || goal.title.toLocaleLowerCase().includes(query);
      if ((statusMatches && searchMatches) || subGoals.length > 0) {
        return [{ ...goal, subGoals }];
      }
      return [];
    });
    return pickVisible(goals);
  }, [goalSearch, goalStatuses, goals]);

  const draftGoals = useMemo(
    () => allGoals
      .filter((goal) => goal.status === 'draft')
      .map((goal) => ({ ...goal, subGoals: [] })),
    [allGoals],
  );

  const sortedGoals = useMemo(() => {
    return [...visibleGoals].sort((a, b) => {
      const comparison = sortField === 'title'
        ? a.title.localeCompare(b.title, 'zh-CN')
        : a.progress - b.progress;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [visibleGoals, sortDirection, sortField]);
  const visibleGoalCount = useMemo(() => {
    const count = (items: GoalWithDetails[]): number => items.reduce(
      (total, goal) => total + 1 + count(goal.subGoals),
      0,
    );
    return count(sortedGoals);
  }, [sortedGoals]);

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
    setFormOriginalKRIds([]);
    setEditingGoal(null);
  };

  const openCreate = () => {
    resetGoalForm();
    setCreateOpen(true);
  };

  const openTrash = async () => {
    setSelectedDeletedIds([]);
    setDeletedGoals(await goalsApi.listDeleted());
    setTrashOpen(true);
  };

  const softDeleteGoals = async (ids: string[]) => {
    await Promise.all(ids.map((id) => goalsApi.delete(id)));
    setSelectedDraftIds([]);
    await fetchGoals();
  };

  const permanentlyDeleteSelected = async () => {
    await goalsApi.permanentlyDelete(selectedDeletedIds);
    setSelectedDeletedIds([]);
    setDeletedGoals(await goalsApi.listDeleted());
  };

  const emptyTrash = async () => {
    await goalsApi.emptyTrash();
    setSelectedDeletedIds([]);
    setDeletedGoals([]);
  };

  const openEdit = () => {
    if (!detailGoal) return;
    setEditingGoal(detailGoal);
    setFormTitle(detailGoal.title);
    setFormParentId(detailGoal.parentGoalId || '');
    setFormDueAt(formatForDateTimeInput(detailGoal.dueAt));
    setDraftKRs(detailKRs.length > 0 ? detailKRs.map(krToDraft) : [blankKR()]);
    setFormOriginalKRIds(detailKRs.map((kr) => kr.id));
    setCreateOpen(true);
    setMoreOpen(false);
  };

  const openDraft = async (goal: GoalWithDetails) => {
    const krs = await keyResultsApi.list(goal.id);
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormParentId(goal.parentGoalId || '');
    setFormDueAt(formatForDateTimeInput(goal.dueAt));
    setDraftKRs(krs.length > 0 ? krs.map(krToDraft) : [blankKR()]);
    setFormOriginalKRIds(krs.map((kr) => kr.id));
    setDraftBoxOpen(false);
    setCreateOpen(true);
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
      if (patch.type === 'metric' && next.unit === undefined) {
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
        dueAt: dateTimeInputToIso(formDueAt) || null,
        status,
      });
      const existingIds = new Set(formOriginalKRIds);
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
      if (detailGoal?.id === editingGoal.id) await refreshDetail();
      toast.success(t('board.save'));
      return;
    }

    const created = await createGoal({
      title: formTitle.trim(),
      parentGoalId: formParentId || undefined,
      dueAt: dateTimeInputToIso(formDueAt),
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
    await Promise.all([refreshDetail(), fetchGoals()]);
    toast.success(t('goal.progressUpdated'));
  };

  const confirmUpdateAndClose = async () => {
    await updateAllKRProgress();
    setPendingClose(false);
    setDetailGoal(null);
  };

  const finishGoal = async () => {
    if (!detailGoal) return;
    setMoreOpen(false);
    setDeleteConfirm({
      open: true,
      title: t('goal.finishGoal'),
      message: t('goal.finishGoalConfirm'),
      confirmLabel: t('common.confirm'),
      confirmVariant: 'primary',
      onConfirm: async () => {
        await updateGoal(detailGoal.id, { status: 'completed' });
        await refreshDetail();
        toast.success(t('goal.goalCompleted'));
      },
    });
  };

  const unlinkTask = async (task: LinkedTask) => {
    if (!task.krId) return;
    setDeleteConfirm({
      open: true,
      title: t('goal.confirmUnlink'),
      message: t('goal.unlinkTaskConfirmWithName', { title: task.title }),
      confirmLabel: t('common.confirm'),
      confirmVariant: 'primary',
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
    setSelectedTaskIds([]);
    setTaskLinkOpen(true);
  };

  const confirmTaskLink = async () => {
    if (selectedTaskIds.length === 0 || detailKRs.length === 0) return;
    for (const taskId of selectedTaskIds) {
      await linkTaskToKR(detailKRs[0].id, taskId);
    }
    setTaskLinkOpen(false);
    setSelectedTaskIds([]);
    await refreshDetail();
  };

  const updateKRHealth = async (id: string, health: KRHealth) => {
    await keyResultsApi.update({ id, healthStatus: health });
    setDetailKRs((items) => items.map((kr) => (kr.id === id ? { ...kr, healthStatus: health } : kr)));
    await fetchGoals();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Target size={22} />
          {t('goal.title')}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openTrash}>
            <Trash2 size={16} />
            {t('goal.trash')}
          </Button>
          <Button variant="outline" onClick={() => {
            setSelectedDraftIds([]);
            setDraftBoxOpen(true);
          }}>
            <FileText size={16} />
            {t('goal.draftBox')}
            {draftGoals.length > 0 && <span className="ml-1 text-xs text-text-muted">({draftGoals.length})</span>}
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} />
            {t('goal.addGoal')}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="input w-full pl-9"
            value={goalSearch}
            onChange={(event) => setGoalSearch(event.target.value)}
            placeholder={t('goal.searchPlaceholder')}
          />
        </div>
        <div className="relative">
          <Button variant="outline" onClick={() => setStatusFilterOpen((open) => !open)}>
            <Filter size={16} />
            {t('goal.statusFilter')}
            <ChevronDown size={15} />
          </Button>
          {statusFilterOpen && (
            <div className="absolute left-0 top-full z-30 mt-2 w-40 border border-border bg-surface py-1 shadow-lg">
              {(['active', 'completed'] as GoalListStatus[]).map((status) => (
                <label key={status} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={goalStatuses.includes(status)}
                    onChange={() => setGoalStatuses((statuses) => (
                      statuses.includes(status)
                        ? statuses.filter((item) => item !== status)
                        : [...statuses, status]
                    ))}
                  />
                  {status === 'active' ? t('goal.active') : t('goal.completed')}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="ml-auto whitespace-nowrap text-sm text-text-muted">
          {t('goal.goalCount', { count: visibleGoalCount })}
        </span>
      </div>

      <div className="overflow-x-auto bg-surface">
        <div className="min-w-[900px] relative">
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-border z-10" style={{ right: 460 }} />
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-border z-10" style={{ right: 140 }} />
          <div className="grid grid-cols-[minmax(0,1fr)_320px_140px] border-b border-border text-[15px] font-semibold text-text">
            <SortHeader label={t('goal.title')} active={sortField === 'title'} direction={sortDirection} onClick={() => setSort('title')} />
            <SortHeader label={t('goal.progress')} active={sortField === 'progress'} direction={sortDirection} onClick={() => setSort('progress')} />
            <div className="px-4 py-3 text-center">{t('goal.weight')}</div>
          </div>

          {sortedGoals.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              <Target size={30} className="mx-auto mb-2 opacity-40" />
              {t('goal.noGoals')}
            </div>
          ) : (
            sortedGoals.map((goal) => (
              <GoalTreeRows
                key={goal.id}
                goal={goal}
                level={0}
                expanded={expanded}
                setExpanded={setExpanded}
                onOpen={openDetail}
              />
            ))
          )}
        </div>
      </div>

      <DraftBoxModal
        open={draftBoxOpen}
        drafts={draftGoals}
        selectedIds={selectedDraftIds}
        onClose={() => setDraftBoxOpen(false)}
        onOpenDraft={openDraft}
        onSelectionChange={setSelectedDraftIds}
        onDelete={() => setDeleteConfirm({
          open: true,
          title: t('goal.deleteDrafts'),
          message: t('goal.deleteDraftsConfirm', { count: selectedDraftIds.length }),
          confirmLabel: t('common.delete'),
          onConfirm: () => softDeleteGoals(selectedDraftIds),
        })}
      />

      <TrashModal
        open={trashOpen}
        goals={deletedGoals}
        selectedIds={selectedDeletedIds}
        onClose={() => setTrashOpen(false)}
        onSelectionChange={setSelectedDeletedIds}
        onDelete={() => setDeleteConfirm({
          open: true,
          title: t('goal.permanentDelete'),
          message: t('goal.permanentDeleteConfirm', { count: selectedDeletedIds.length }),
          confirmLabel: t('goal.permanentDelete'),
          onConfirm: permanentlyDeleteSelected,
        })}
        onEmpty={() => setDeleteConfirm({
          open: true,
          title: t('goal.emptyTrash'),
          message: t('goal.emptyTrashConfirm'),
          confirmLabel: t('goal.emptyTrash'),
          onConfirm: emptyTrash,
        })}
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
        onHealthChange={updateKRHealth}
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
        selectedTaskIds={selectedTaskIds}
        canConfirm={detailKRs.length > 0}
        onSearchChange={setTaskSearch}
        onToggle={(id) => setSelectedTaskIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])}
        onToggleAll={(ids) => setSelectedTaskIds((selected) => {
          const visibleIds = new Set(ids);
          const allVisibleSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
          return allVisibleSelected
            ? selected.filter((id) => !visibleIds.has(id))
            : Array.from(new Set([...selected, ...ids]));
        })}
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
        confirmLabel={deleteConfirm.confirmLabel}
        confirmVariant={deleteConfirm.confirmVariant}
      />

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
    <button className="px-6 py-3.5 flex items-center gap-1 text-left hover:bg-surface-2" onClick={onClick}>
      {label}
      <span className={active ? 'text-primary text-xs' : 'text-text-muted/40 text-xs'}>
        {active ? (direction === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </button>
  );
}

function GoalTreeRows({
  goal, level, isLast = false, ancestorContinuations = [], expanded, setExpanded, onOpen,
}: {
  goal: GoalWithDetails;
  level: number;
  isLast?: boolean;
  ancestorContinuations?: boolean[];
  expanded: Record<string, boolean>;
  setExpanded: (expanded: Record<string, boolean>) => void;
  onOpen: (goal: GoalWithDetails) => void;
}) {
  const { t } = useTranslation();
  const isOpen = expanded[goal.id] ?? true;
  const hasChildren = goal.keyResults.length > 0 || goal.subGoals.length > 0;
  const isChildGoal = level > 0;
  const branchLeft = 34 + (level - 1) * 30;
  const childLineLeft = 34 + level * 30;
  const childCount = goal.keyResults.length + goal.subGoals.length;

  return (
    <>
      <div
        className={`grid grid-cols-[minmax(0,1fr)_320px_140px] min-h-[58px] items-center transition-colors duration-150 hover:bg-surface-2/40 ${isChildGoal ? 'bg-surface-2/10' : ''}`}
        style={{ boxShadow: 'inset 0 -1px 0 var(--border)' }}
      >
        <div className="h-full px-6 flex items-center gap-2 min-w-0 relative" style={{ paddingLeft: 24 + level * 30 }}>
          {ancestorContinuations.map((continues, ancestorLevel) => continues && (
            <span
              key={ancestorLevel}
              className="absolute top-0 bottom-0 border-l border-dashed border-border"
              style={{ left: 34 + ancestorLevel * 30 }}
            />
          ))}
          {isChildGoal && (
            <>
              <span
                className="absolute top-0 border-l border-dashed border-border"
                style={{ left: branchLeft, height: isLast ? '50%' : '100%' }}
              />
              <span className="absolute w-5 border-t border-dashed border-border" style={{ left: branchLeft, top: '50%' }} />
            </>
          )}
          <button className="btn-ghost p-0.5 text-text-muted shrink-0" onClick={() => setExpanded({ ...expanded, [goal.id]: !isOpen })} disabled={!hasChildren}>
            {hasChildren ? (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="inline-block w-4" />}
          </button>
          {isOpen && childCount > 0 && (
            <span
              className="absolute border-l border-dashed border-border"
              style={{ left: childLineLeft, top: '50%', bottom: 0 }}
            />
          )}
          <button className="truncate font-semibold text-left hover:text-primary text-[15px]" onClick={() => onOpen(goal)}>{goal.title}</button>
        </div>
        <ProgressCell progress={goal.progress} color={KR_HEALTH_COLORS[worstGoalHealth(goal)]} />
        <div className="px-4 text-center text-sm text-text-muted">-</div>
      </div>

      {isOpen && goal.keyResults.map((kr, index) => {
        const progress = krProgress(kr);
        const isLastChild = goal.subGoals.length === 0 && index === goal.keyResults.length - 1;
        return (
          <button
            key={kr.id}
            type="button"
            className="grid w-full grid-cols-[minmax(0,1fr)_320px_140px] min-h-[58px] items-center bg-surface-2/10 text-left transition-colors duration-150 hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
            style={{ boxShadow: 'inset 0 -1px 0 var(--border)' }}
            onClick={() => onOpen(goal)}
          >
            <div className="h-full px-6 flex items-center gap-3 min-w-0 text-sm relative" style={{ paddingLeft: 56 + level * 30 }}>
              {ancestorContinuations.map((continues, ancestorLevel) => continues && (
                <span
                  key={ancestorLevel}
                  className="absolute top-0 bottom-0 border-l border-dashed border-border"
                  style={{ left: 34 + ancestorLevel * 30 }}
                />
              ))}
              {isChildGoal && !isLast && (
                <span className="absolute top-0 bottom-0 border-l border-dashed border-border" style={{ left: branchLeft }} />
              )}
              <span
                className="absolute top-0 border-l border-dashed border-border"
                style={{ left: childLineLeft, height: isLastChild ? '50%' : '100%' }}
              />
              <span className="absolute w-5 border-t border-dashed border-border" style={{ left: childLineLeft, top: '50%' }} />
              <span className="w-2 h-2 rounded-full border border-border bg-surface shrink-0" />
              <span className="truncate">{kr.title}</span>
            </div>
            <ProgressCell progress={progress} color={KR_HEALTH_COLORS[(kr.healthStatus || 'normal') as KRHealth]} />
            <div className="px-4 text-center text-sm tabular-nums">{kr.weight}%</div>
          </button>
        );
      })}

      {isOpen && goal.subGoals.map((subGoal, index) => (
        <GoalTreeRows
          key={subGoal.id}
          goal={subGoal}
          level={level + 1}
          isLast={index === goal.subGoals.length - 1}
          ancestorContinuations={level === 0 ? [] : [...ancestorContinuations, !isLast]}
          expanded={expanded}
          setExpanded={setExpanded}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function ProgressCell({ progress, color }: { progress: number; color: string }) {
  return (
    <div className="px-6 flex items-center gap-4">
      <ProgressBar value={progress} color={color} className="w-32" />
      <span className="w-16 text-sm tabular-nums">{(progress * 100).toFixed(2)}%</span>
    </div>
  );
}

function DraftBoxModal({
  open, drafts, selectedIds, onClose, onOpenDraft, onSelectionChange, onDelete,
}: {
  open: boolean;
  drafts: GoalWithDetails[];
  selectedIds: string[];
  onClose: () => void;
  onOpenDraft: (goal: GoalWithDetails) => void;
  onSelectionChange: (ids: string[]) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goal.draftBox')}
      size="xl"
      footer={(
        <div className="flex w-full items-center justify-between">
          <span className="text-sm text-text-muted">{t('goal.selectedCount', { count: selectedIds.length })}</span>
          <Button variant="danger" disabled={selectedIds.length === 0} onClick={onDelete}>
            <Trash2 size={15} /> {t('common.delete')}
          </Button>
        </div>
      )}
    >
      <GoalSelectionTable
        goals={drafts}
        selectedIds={selectedIds}
        emptyText={t('goal.noDrafts')}
        onSelectionChange={onSelectionChange}
        onOpen={onOpenDraft}
      />
    </Modal>
  );
}

function TrashModal({
  open, goals, selectedIds, onClose, onSelectionChange, onDelete, onEmpty,
}: {
  open: boolean;
  goals: GoalWithDetails[];
  selectedIds: string[];
  onClose: () => void;
  onSelectionChange: (ids: string[]) => void;
  onDelete: () => void;
  onEmpty: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goal.trash')}
      size="xl"
      footer={(
        <div className="flex w-full items-center justify-between">
          <span className="text-sm text-text-muted">{t('goal.trashRetention')}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={goals.length === 0} onClick={onEmpty}>
              <Trash2 size={15} /> {t('goal.emptyTrash')}
            </Button>
            <Button variant="danger" disabled={selectedIds.length === 0} onClick={onDelete}>
              <X size={15} /> {t('goal.permanentDelete')}
            </Button>
          </div>
        </div>
      )}
    >
      <GoalSelectionTable
        goals={goals}
        selectedIds={selectedIds}
        emptyText={t('goal.trashEmpty')}
        onSelectionChange={onSelectionChange}
      />
    </Modal>
  );
}

function GoalSelectionTable({
  goals, selectedIds, emptyText, onSelectionChange, onOpen,
}: {
  goals: GoalWithDetails[];
  selectedIds: string[];
  emptyText: string;
  onSelectionChange: (ids: string[]) => void;
  onOpen?: (goal: GoalWithDetails) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const result: Array<{ goal: GoalWithDetails; level: number }> = [];
    const visit = (items: GoalWithDetails[], level: number) => {
      items.forEach((goal) => {
        result.push({ goal, level });
        visit(goal.subGoals, level + 1);
      });
    };
    visit(goals, 0);
    return result;
  }, [goals]);
  const allSelected = rows.length > 0 && rows.every(({ goal }) => selectedIds.includes(goal.id));

  const toggle = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div className="max-h-[58vh] overflow-auto border border-border">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_320px_140px] border-b border-border text-[15px] font-semibold">
          <label className="flex items-center justify-center border-r border-border">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onSelectionChange(allSelected ? [] : rows.map(({ goal }) => goal.id))}
              aria-label={t('common.selectAll')}
            />
          </label>
          <div className="px-6 py-3.5">{t('goal.title')}</div>
          <div className="border-l border-border px-6 py-3.5">{t('goal.progress')}</div>
          <div className="border-l border-border px-4 py-3.5 text-center">{t('goal.weight')}</div>
        </div>
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-text-muted">{emptyText}</div>
        ) : rows.map(({ goal, level }) => (
          <div
            key={goal.id}
            className="grid min-h-[58px] grid-cols-[44px_minmax(0,1fr)_320px_140px] items-center transition-colors hover:bg-surface-2/40"
            style={{ boxShadow: 'inset 0 -1px 0 var(--border)' }}
          >
            <label className="flex h-full items-center justify-center border-r border-border">
              <input type="checkbox" checked={selectedIds.includes(goal.id)} onChange={() => toggle(goal.id)} />
            </label>
            <div className="min-w-0 px-6" style={{ paddingLeft: 24 + level * 24 }}>
              {onOpen ? (
                <button className="max-w-full truncate text-left font-semibold hover:text-primary" onClick={() => onOpen(goal)}>
                  {goal.title}
                </button>
              ) : (
                <span className="block truncate font-semibold">{goal.title}</span>
              )}
            </div>
            <div className="flex h-full items-center border-l border-border">
              <ProgressCell progress={goal.progress} color={KR_HEALTH_COLORS[worstGoalHealth(goal)]} />
            </div>
            <div className="flex h-full items-center justify-center border-l border-border text-sm text-text-muted">-</div>
          </div>
        ))}
      </div>
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
  const unavailableParentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!currentGoalId) return ids;

    ids.add(currentGoalId);
    const currentGoal = goals.find((goal) => goal.id === currentGoalId);
    const collectDescendants = (goal: GoalWithDetails) => {
      goal.subGoals.forEach((subGoal) => {
        ids.add(subGoal.id);
        collectDescendants(subGoal);
      });
    };
    if (currentGoal) collectDescendants(currentGoal);
    return ids;
  }, [currentGoalId, goals]);
  const parentOptions = goals.filter(
    (goal) => goal.status === 'active' && !unavailableParentIds.has(goal.id),
  );
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

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="label">{t('goal.parentGoal')}</label>
            <select className="input w-full disabled:bg-surface-2 disabled:text-text-muted" value={parentId} onChange={(event) => onParentChange(event.target.value)} disabled={parentDisabled}>
              <option value="">{t('goal.parentGoalPlaceholder')}</option>
              {parentOptions.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
            </select>
          </div>
          <Input label={`${t('goal.deadline')} *`} type="datetime-local" value={dueAt} onChange={(event) => onDueAtChange(event.target.value)} />
        </div>

        <section className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 font-semibold">
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary text-white">KR</span>
              {t('goal.keyResult')}
              <InfoTooltip text={t('goal.krTypeHelp')} />
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
  const [collapsed, setCollapsed] = useState(false);
  const unit = kr.unit ?? '%';
  return (
    <div className="border-b border-border pb-3">
      <div className="grid grid-cols-[24px_minmax(0,1fr)_190px_32px] gap-3 items-start">
        <button className="btn-ghost p-0.5 text-text-muted mt-2" onClick={() => setCollapsed((value) => !value)} title={collapsed ? t('common.open') : t('common.close')}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
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
      {!collapsed && <div className="mt-2 ml-9 flex items-center gap-5 whitespace-nowrap overflow-x-auto pb-1">
        <select className="input h-10 w-40 shrink-0" value={kr.type} onChange={(event) => onChange({ type: event.target.value as KRType })}>
          <option value="metric">{t('goal.metricProgress')}</option>
          <option value="boolean">{t('goal.boolean')}</option>
        </select>
        {kr.type === 'metric' ? (
          <>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <span className="text-text-muted">{t('goal.unit')}:</span>
              <input className="input h-10 w-28" value={unit} onChange={(event) => onChange({ unit: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <span className="text-text-muted">{t('goal.startValue')}:</span>
              <span className="relative inline-flex">
                <input className="input h-10 w-36 pr-14" type="number" value={kr.startValue} onChange={(event) => onChange({ startValue: Number(event.target.value) || 0 })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 max-w-12 truncate text-xs text-text-muted border-l border-border pl-2">{unit}</span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <span className="text-text-muted">{t('goal.targetValue')}:</span>
              <span className="relative inline-flex">
                <input className="input h-10 w-36 pr-14" type="number" value={kr.targetValue} onChange={(event) => onChange({ targetValue: Number(event.target.value) || 0 })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 max-w-12 truncate text-xs text-text-muted border-l border-border pl-2">{unit}</span>
              </span>
            </label>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <span className="text-text-muted">{t('goal.startValue')}:</span>
              <input className="input h-10 w-32 disabled:bg-surface-2 disabled:text-text-muted" value={t('goal.notCompleted')} disabled />
            </label>
            <label className="flex items-center gap-2 text-sm shrink-0">
              <span className="text-text-muted">{t('goal.targetValue')}:</span>
              <input className="input h-10 w-32 disabled:bg-surface-2 disabled:text-text-muted" value={t('goal.completed')} disabled />
            </label>
          </>
        )}
      </div>}
    </div>
  );
}

function GoalDetailModal({
  goal, path, keyResults, tab, workingValues, workingDone, progressComment,
  showHistory: _showHistory, moreOpen, onClose, onEdit, onMoreToggle, onTabChange, onValueChange,
  onDoneChange, onCommentChange, onUpdate, onHealthChange, onToggleHistory: _onToggleHistory, onFinish, onDelete, onUnlinkTask, onLinkTask,
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
  onHealthChange: (id: string, health: KRHealth) => Promise<void>;
  onToggleHistory: () => void;
  onFinish: () => Promise<void>;
  onDelete: () => void;
  onUnlinkTask: (task: LinkedTask) => void;
  onLinkTask: () => void;
}) {
  const { t } = useTranslation();
  if (!goal) return null;
  const isFinished = goal.status === 'completed';

  const history = keyResults
    .flatMap((kr) => kr.logs.map((log) => ({ ...log, krTitle: kr.title })))
    .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
  const liveOverallProgress = weightedKRProgress(keyResults, (kr) => (
    kr.type === 'boolean'
      ? ((workingDone[kr.id] ?? kr.isCompleted) ? 1 : 0)
      : krProgress({ ...kr, currentValue: workingValues[kr.id] ?? kr.currentValue })
  ));
  const overallHealth = keyResults.reduce<KRHealth>(
    (worst, kr) => {
      const health = (kr.healthStatus || 'normal') as KRHealth;
      return healthRank[health] > healthRank[worst] ? health : worst;
    },
    'normal',
  );

  return (
    <Modal open={true} onClose={onClose} size="xl">
      <div className="-m-5 flex flex-col max-h-[90vh]">
        <div className="h-[52px] px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="text-base font-semibold">{t('goal.goalDetail')}</h3>
          <div className="flex items-center gap-1 relative">
            {!isFinished && <button className="btn-ghost p-2" onClick={onEdit} title={t('goal.editGoal')}><Edit3 size={18} /></button>}
            <button className="btn-ghost p-2 bg-primary/10" onClick={onMoreToggle}><MoreHorizontal size={18} /></button>
            <button className="btn-ghost p-2" onClick={onClose}><X size={18} /></button>
            {moreOpen && (
              <div className="absolute right-8 top-10 w-44 bg-surface border border-border shadow-lg z-20">
                {!isFinished && <button className="w-full text-left px-4 py-3 hover:bg-surface-2" onClick={onFinish}>{t('goal.finishGoal')}</button>}
                <button className="w-full text-left px-4 py-3 hover:bg-surface-2 text-red-500" onClick={onDelete}>{t('common.delete')}</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-0 min-h-0 flex-1">
          <div className="p-5 border-r border-border min-w-0 overflow-y-auto">
            <div className="mb-5">
              <div className="text-sm text-text-muted mb-5 flex items-center gap-2">
                <span>{t('goal.parentGoal')}:</span>
                {path.length > 1 ? path.slice(0, -1).map((item) => <span key={item.id} className="text-primary">{item.title}</span>) : <span>{t('goal.none')}</span>}
              </div>
              <h2 className="text-2xl font-semibold truncate">{goal.title}</h2>
            </div>

          <section className="mb-5">
            <div className="text-sm text-text-muted mb-2">{t('goal.overallProgress')}</div>
            <div className="flex items-center gap-3 max-w-sm">
              <ProgressBar value={liveOverallProgress} color={KR_HEALTH_COLORS[overallHealth]} className="flex-1" />
              <span className="text-primary tabular-nums">{(liveOverallProgress * 100).toFixed(2)}%</span>
              <InfoTooltip text={t('goal.overallProgressHelp')} />
            </div>
            <div className="text-xs text-text-muted mt-4">
              {goal.dueAt && <span>{t('goal.deadline')}: {dayjs(goal.dueAt).format('M月D日 HH:mm')}</span>}
              <span className="ml-6">{t('goal.updatedTime')}: {dayjs(goal.updatedAt).format('M月D日 HH:mm')}</span>
            </div>
          </section>

          <div className="flex items-center gap-6 border-b border-border mb-4">
            <TabButton active={tab === 'krs'} onClick={() => onTabChange('krs')} label={`${t('goal.keyResult')} ${keyResults.length}`} />
            <TabButton active={tab === 'tasks'} onClick={() => onTabChange('tasks')} label={`${t('goal.relatedTasks')} ${goal.linkedTasks.length}`} />
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
              onHealthChange={onHealthChange}
            />
          ) : (
            <RelatedTasksPanel tasks={goal.linkedTasks} onUnlink={onUnlinkTask} onLink={onLinkTask} />
          )}

          {tab === 'krs' && (
            <div className="flex items-center gap-5 text-xs text-text-muted mt-5 pt-3">
              <span>{t('board.createdAt')} {dayjs(goal.createdAt).format('YYYY年M月D日 HH:mm')}</span>
              <span>{t('goal.updatedTime')} {dayjs(goal.updatedAt).format('YYYY年M月D日 HH:mm')}</span>
            </div>
          )}
        </div>

        <aside className="p-5 bg-surface-2/30 overflow-y-auto">
          <div>
          <h4 className="font-semibold border-b-2 border-primary pb-3 mb-4 text-primary inline-flex items-center gap-2">
            <Activity size={14} /> {t('goal.progressHistory')}
          </h4>
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
          </div>
        </aside>
        </div>
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

function InfoTooltip({ text, align = 'center' }: { text: string; align?: 'center' | 'start' }) {
  const alignClass = align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className="relative inline-flex group">
      <HelpCircle size={15} className="text-text-muted group-hover:text-primary" />
      <span className={`absolute top-6 z-30 hidden w-72 rounded bg-text px-3 py-2 text-xs leading-5 text-surface shadow-lg group-hover:block whitespace-normal ${alignClass}`}>
        {text}
      </span>
    </span>
  );
}

function KeyResultsPanel({
  goal, keyResults, workingValues, workingDone, progressComment,
  onValueChange, onDoneChange, onCommentChange, onUpdate, onHealthChange,
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
  onHealthChange: (id: string, health: KRHealth) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const isFinished = goal.status === 'completed';
  const gridClass = isFinished
    ? 'grid grid-cols-[minmax(0,1fr)_210px_70px] items-center gap-3'
    : 'grid grid-cols-[minmax(0,1fr)_210px_70px_104px] items-center gap-3';
  return (
    <>
      <div className="text-sm text-text-muted mb-3">{t('goal.totalKR', { count: keyResults.length })}</div>
      <div className={`${gridClass} text-sm text-text-muted border-b border-border pb-2`}>
        <span>{t('goal.keyResult')}</span>
        <span>{t('goal.progress')}</span>
        <span>{t('goal.weight')}</span>
        {!isFinished && <span>{t('goal.status')}</span>}
      </div>
      <div>
        {keyResults.map((kr) => {
          const progress = kr.type === 'boolean' ? ((workingDone[kr.id] ?? kr.isCompleted) ? 1 : 0) : krProgress({ ...kr, currentValue: workingValues[kr.id] ?? kr.currentValue });
          const health = (kr.healthStatus || 'normal') as KRHealth;
          const color = KR_HEALTH_COLORS[health] || KR_HEALTH_COLORS.normal;
          const isCollapsed = collapsed[kr.id] === true;
          return (
            <div key={kr.id} className="border-b border-border py-3">
              <div className={gridClass}>
                <button className="font-medium truncate flex items-center gap-2 text-left hover:text-primary" onClick={() => setCollapsed((state) => ({ ...state, [kr.id]: !isCollapsed }))}>
                  {isCollapsed ? <ChevronRight size={15} className="text-text-muted" /> : <ChevronDown size={15} className="text-text-muted" />}
                  <span className="truncate">{kr.title}</span>
                </button>
                <div className="flex items-center gap-3">
                  <ProgressBar value={progress} color={color} className="flex-1" />
                  <span className="w-16 text-sm tabular-nums">{(progress * 100).toFixed(2)}%</span>
                </div>
                <span>{kr.weight}%</span>
                {!isFinished && <HealthLights active={health} onChange={(next) => onHealthChange(kr.id, next)} />}
              </div>
              {!isCollapsed && (
                <div className="mt-3 ml-6 py-2">
                  {isFinished ? (
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      <span className="text-sm text-text-muted shrink-0">{t('goal.currentProgress')}</span>
                      <span className="text-sm font-medium">
                        {kr.type === 'boolean'
                          ? (kr.isCompleted ? t('goal.completed') : t('goal.notCompleted'))
                          : `${kr.currentValue}${kr.unit || ''}`}
                      </span>
                      {kr.type !== 'boolean' && (
                        <>
                          <span className="text-sm text-text-muted">{t('goal.startValue')} {kr.startValue}{kr.unit || ''}</span>
                          <span className="text-sm text-text-muted">{t('goal.targetValue')} {kr.targetValue}{kr.unit || ''}</span>
                        </>
                      )}
                    </div>
                  ) : kr.type === 'boolean' ? (
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-text-muted shrink-0">{t('goal.currentProgress')}</span>
                      <div className="inline-flex rounded border border-border overflow-hidden">
                        <button className={`px-5 py-2 text-sm ${(workingDone[kr.id] ?? kr.isCompleted) ? 'bg-surface' : 'bg-primary text-white'}`} onClick={() => onDoneChange(kr.id, false)}>{t('goal.notCompleted')}</button>
                        <button className={`px-5 py-2 text-sm ${(workingDone[kr.id] ?? kr.isCompleted) ? 'bg-primary text-white' : 'bg-surface'}`} onClick={() => onDoneChange(kr.id, true)}>{t('goal.completed')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 whitespace-nowrap">
                      <span className="text-sm text-text-muted shrink-0">{t('goal.currentProgress')}</span>
                      <input className="input h-9 w-32" type="number" value={workingValues[kr.id] ?? kr.currentValue} onChange={(event) => onValueChange(kr.id, Number(event.target.value) || 0)} />
                      <span className="text-sm">{kr.unit || ''}</span>
                      <span className="text-sm text-text-muted">{t('goal.startValue')} {kr.startValue}{kr.unit || ''}</span>
                      <span className="text-sm text-text-muted">{t('goal.targetValue')} {kr.targetValue}{kr.unit || ''}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!isFinished && (
        <>
          <Textarea className="mt-4 min-h-[150px]" value={progressComment} onChange={(event) => onCommentChange(event.target.value)} placeholder={t('goal.commentPlaceholder')} />
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={onUpdate}>{t('goal.updateKR')}</Button>
            <InfoTooltip text={t('goal.updateProgressHelp')} align="start" />
          </div>
        </>
      )}
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
  open, tasks, linkedTaskIds, search, selectedTaskIds, canConfirm,
  onSearchChange, onToggle, onToggleAll, onClose, onConfirm,
}: {
  open: boolean;
  tasks: Task[];
  linkedTaskIds: Set<string>;
  search: string;
  selectedTaskIds: string[];
  canConfirm: boolean;
  onSearchChange: (value: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ field: 'status' | 'priority' | 'dueAt'; direction: SortDirection }>({ field: 'dueAt', direction: 'asc' });
  const priorityRank = (priority?: Task['priority']) => {
    const ranks: Record<string, number> = { highest: 5, higher: 4, normal: 3, lower: 2, lowest: 1 };
    return priority ? (ranks[priority] || 0) : 0;
  };
  const setTaskSort = (field: 'status' | 'priority' | 'dueAt') => {
    setSort((state) => state.field === field
      ? { field, direction: state.direction === 'asc' ? 'desc' : 'asc' }
      : { field, direction: 'asc' });
  };
  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const base = tasks.filter((task) => {
      if (linkedTaskIds.has(task.id)) return false;
      if (!keyword) return true;
      return task.title.toLowerCase().includes(keyword);
    });
    return base.sort((a, b) => {
      let comparison = 0;
      if (sort.field === 'status') comparison = taskStatusLabel(a, t).localeCompare(taskStatusLabel(b, t), 'zh-CN');
      if (sort.field === 'priority') comparison = priorityRank(a.priority) - priorityRank(b.priority);
      if (sort.field === 'dueAt') comparison = dayjs(a.dueAt || '9999-12-31').valueOf() - dayjs(b.dueAt || '9999-12-31').valueOf();
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [linkedTaskIds, search, sort.direction, sort.field, tasks, t]);
  const visibleTaskIds = filteredTasks.map((task) => task.id);
  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.includes(id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('goal.selectRelatedTask')}
      size="xl"
      footer={(
        <div className="w-full flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={onConfirm} disabled={selectedTaskIds.length === 0 || !canConfirm}>{t('common.confirm')}</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-7 border-b border-border pb-4">
          <div className="relative w-96 max-w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-10 h-11"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && filteredTasks[0]) onToggle(filteredTasks[0].id);
              }}
              placeholder={t('goal.searchTaskPlaceholder')}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-text-muted whitespace-nowrap pr-1">
            <span>{t('goal.totalTasks', { count: filteredTasks.length })}</span>
            <span>{t('goal.selectedTasks', { count: selectedTaskIds.length })}</span>
          </div>
        </div>

        {!canConfirm && (
          <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            {t('goal.noKeyResultForTaskLink')}
          </div>
        )}

        <div className="max-h-[520px] overflow-y-auto border border-border relative">
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-border z-30" style={{ right: 450 }} />
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-border z-30" style={{ right: 300 }} />
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-border z-30" style={{ right: 150 }} />
          <div className="grid grid-cols-[34px_minmax(0,1fr)_150px_150px_150px] text-sm font-medium text-text-muted border-b border-border bg-surface-2/40 sticky top-0 z-20">
            <button
              className="pl-3 pr-1 py-3 flex items-center"
              onClick={() => onToggleAll(visibleTaskIds)}
              disabled={visibleTaskIds.length === 0}
              title={t('common.selectAll')}
            >
              <span className={`block w-4 h-4 rounded border ${allVisibleSelected ? 'bg-primary border-primary' : 'border-border bg-surface'}`}>
                {allVisibleSelected && <Check size={14} className="text-white" />}
              </span>
            </button>
            <div className="pl-2 pr-4 py-3">{t('goal.taskTitle')}</div>
            <button className="px-4 py-3 text-left hover:text-primary" onClick={() => setTaskSort('status')}>{t('goal.status')} {sort.field === 'status' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</button>
            <button className="px-4 py-3 text-left hover:text-primary" onClick={() => setTaskSort('priority')}>{t('board.currentPriority')} {sort.field === 'priority' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</button>
            <button className="px-4 py-3 text-left hover:text-primary" onClick={() => setTaskSort('dueAt')}>{t('goal.deadline')} {sort.field === 'dueAt' ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</button>
          </div>
          {filteredTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">{t('common.empty')}</div>
          ) : (
            filteredTasks.map((task) => (
              <button
                key={task.id}
                className={`w-full grid grid-cols-[34px_minmax(0,1fr)_150px_150px_150px] items-center min-h-14 text-left border-b border-border last:border-b-0 hover:bg-surface-2/50 ${selectedTaskIds.includes(task.id) ? 'bg-primary/5' : ''}`}
                onClick={() => onToggle(task.id)}
              >
                <div className="pl-3 pr-1">
                  <span className={`block w-4 h-4 rounded border ${selectedTaskIds.includes(task.id) ? 'bg-primary border-primary' : 'border-border'}`}>
                    {selectedTaskIds.includes(task.id) && <Check size={14} className="text-white" />}
                  </span>
                </div>
                <div className="pl-2 pr-4 font-medium truncate">{task.title}</div>
                <div className="px-4">
                  <span className={`text-xs px-3 py-1 rounded-full ${taskStatusClass(task)}`}>
                    {taskStatusLabel(task, t)}
                  </span>
                </div>
                <div className="px-4 text-sm">{task.priority ? t(`board.priority${task.priority.charAt(0).toUpperCase()}${task.priority.slice(1)}`) : t('board.priorityNone')}</div>
                <div className="px-4 text-sm">{task.dueAt ? dayjs(task.dueAt).format('YYYY-MM-DD') : ''}</div>
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

function HealthLights({ active, onChange }: { active: KRHealth; onChange: (health: KRHealth) => void }) {
  const { t } = useTranslation();
  const lights = [
    { key: 'normal', color: KR_HEALTH_COLORS.normal, label: t('goal.healthNormal') },
    { key: 'risk', color: KR_HEALTH_COLORS.risk, label: t('goal.healthRisk') },
    { key: 'behind', color: KR_HEALTH_COLORS.behind, label: t('goal.healthBehind') },
  ] as const;
  return (
    <div className="flex items-center gap-3">
      {lights.map((light) => (
        <button
          key={light.key}
          className="relative group rounded-full p-0.5"
          onClick={() => onChange(light.key)}
          aria-label={light.label}
        >
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-text px-2 py-1 text-xs text-surface opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
            {light.label}
          </span>
          <Circle
            size={17}
            fill={active === light.key ? light.color : 'transparent'}
            color={light.color}
            strokeWidth={active === light.key ? 3 : 1.6}
          />
        </button>
      ))}
    </div>
  );
}
