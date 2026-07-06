import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Target, Plus, Trash2, Check, X, ChevronDown, ChevronRight,
  Calendar as CalIcon, Edit3, Star, Archive, TrendingUp, CheckCircle2, ListTodo
} from 'lucide-react';
import { useGoalStore } from '@/store/useGoalStore';
import { tasksApi } from '@/api';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { DeleteConfirmModal } from '@/components/common/DeleteConfirmModal';
import { Input, Textarea } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { GoalPeriod, GoalWithDetails, KeyResult, KeyResultWithLogs, Milestone, Task } from '@/types';

const KR_TYPE_OPTIONS = ['metric', 'boolean', 'task'] as const;

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentGoal, fetchGoal, createMilestone, toggleMilestone, deleteMilestone,
    createKeyResult, updateKeyResult, checkInKeyResult, toggleKeyResult, deleteKeyResult, updateGoal,
    deleteGoal, archiveGoal, saveReview, linkTaskToKR, unlinkTaskFromKR } = useGoalStore();

  const [showAddKR, setShowAddKR] = useState(false);
  const [krTitle, setKrTitle] = useState('');
  const [krType, setKrType] = useState<'metric' | 'boolean' | 'task'>('metric');
  const [krTarget, setKrTarget] = useState(100);
  const [krStart, setKrStart] = useState(0);
  const [krUnit, setKrUnit] = useState('');
  const [krWeight, setKrWeight] = useState(20);
  const [krCheckDate, setKrCheckDate] = useState<string | null>(null);
  const [checkInKR, setCheckInKR] = useState<KeyResult | null>(null);
  const [checkInValue, setCheckInValue] = useState(0);
  const [checkInComment, setCheckInComment] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [showTaskLink, setShowTaskLink] = useState<string | null>(null); // krId
  const [editingKRCheckDate, setEditingKRCheckDate] = useState<{ kr: KeyResult; value: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; onConfirm: () => void }>({ open: false, onConfirm: () => {} });

  useEffect(() => {
    if (id) fetchGoal(id);
    tasksApi.listAll().then(setAllTasks);
  }, [id, fetchGoal]);

  if (!id || !currentGoal) {
    return <div className="p-6 text-text-muted">{t('common.loading')}</div>;
  }

  const goal = currentGoal;
  const daysLeft = goal.dueAt ? dayjs(goal.dueAt).diff(dayjs(), 'day') : null;

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
      case 'metric': return <TrendingUp size={14} className="text-blue-500" />;
      case 'boolean': return <CheckCircle2 size={14} className="text-green-500" />;
      case 'task': return <ListTodo size={14} className="text-purple-500" />;
      default: return <TrendingUp size={14} />;
    }
  };

  const onAddKR = async () => {
    if (!krTitle.trim()) { toast.error(t('goal.required')); return; }
    await createKeyResult({
      goalId: goal.id,
      title: krTitle.trim(),
      krType,
      startValue: krType === 'metric' ? krStart : undefined,
      targetValue: krType === 'metric' ? krTarget : undefined,
      unit: krUnit || undefined,
      weight: krWeight,
      checkDate: krCheckDate,
    });
    setShowAddKR(false);
    setKrTitle('');
    setKrType('metric');
    setKrTarget(100);
    setKrStart(0);
    setKrUnit('');
    setKrWeight(20);
    setKrCheckDate(null);
  };

  const onCheckIn = async () => {
    if (!checkInKR) return;
    await checkInKeyResult(checkInKR.id, checkInValue, checkInComment || undefined);
    setCheckInKR(null);
    setCheckInValue(0);
    setCheckInComment('');
    toast.success('✓');
  };

  const onArchive = async () => {
    setDeleteConfirm({
      open: true,
      onConfirm: async () => {
        await archiveGoal(goal.id);
        toast.success('✓');
      },
    });
  };

  const onLinkTask = async (krId: string, taskId: string) => {
    await linkTaskToKR(krId, taskId);
    setShowTaskLink(null);
    toast.success('✓');
  };

  const onUnlinkTask = async (krId: string, taskId: string) => {
    await unlinkTaskFromKR(krId, taskId);
    toast.success('✓');
  };

  const onSaveKRCheckDate = async () => {
    if (!editingKRCheckDate) return;
    await updateKeyResult(editingKRCheckDate.kr.id, { checkDate: editingKRCheckDate.value });
    setEditingKRCheckDate(null);
    toast.success(t('board.save'));
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
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button className="btn-ghost p-1" onClick={() => navigate('/goals')}>
          <ArrowLeft size={18} />
        </button>
        <div className="w-3 h-8 rounded-full shrink-0" style={{ background: goal.color || 'var(--primary)' }} />
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1">
              <input
                className="input py-1 px-2 text-lg font-semibold flex-1"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && titleDraft.trim()) {
                    await updateGoal(goal.id, { title: titleDraft.trim() });
                    setEditingTitle(false);
                  }
                  if (e.key === 'Escape') { setEditingTitle(false); }
                }}
                autoFocus
              />
              <button className="btn-ghost p-1" onClick={async () => {
                if (titleDraft.trim()) { await updateGoal(goal.id, { title: titleDraft.trim() }); setEditingTitle(false); }
              }}><Check size={16} className="text-green-500" /></button>
              <button className="btn-ghost p-1" onClick={() => setEditingTitle(false)}><X size={16} /></button>
            </div>
          ) : (
            <h1 className="text-xl font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                onClick={() => { setEditingTitle(true); setTitleDraft(goal.title); }}
                title={t('goal.renameGoal')}>
              {goal.title}
            </h1>
          )}
          <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
            <span className="chip">{periodLabel(goal.period)}</span>
            {goal.dueAt && (
              <span className="flex items-center gap-1">
                <CalIcon size={11} /> {dayjs(goal.dueAt).format('YYYY-MM-DD')}
                {daysLeft !== null && daysLeft >= 0 && <span className="text-warning">({daysLeft}d)</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowReview(true)}>
            <Star size={14} /> {t('goal.review')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchive}>
            <Archive size={14} />
          </Button>
          <Button size="sm" variant="danger" onClick={async () => {
            setDeleteConfirm({
              open: true,
              onConfirm: async () => { await deleteGoal(goal.id); navigate('/goals'); },
            });
          }}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('goal.progress')}</span>
          <span className="text-lg font-semibold" style={{ color: progressColor }}>{Math.round(goal.progress * 100)}%</span>
        </div>
        <ProgressBar value={goal.progress} color={progressColor} height={10} />
      </div>

      {/* Key Results */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Target size={16} />
            {t('goal.keyResult')}
          </div>
          <Button size="sm" onClick={() => setShowAddKR(true)}>
            <Plus size={14} /> KR
          </Button>
        </div>
        <div className="space-y-3">
          {goal.keyResults.length === 0 && (
            <div className="text-sm text-text-muted text-center py-4">{t('common.empty')}</div>
          )}
          {goal.keyResults.map((kr) => (
            <KRCard
              key={kr.id}
              kr={kr}
              goal={goal}
              progressColor={progressColor}
              onCheckIn={() => {
                setCheckInKR(kr);
                setCheckInValue(kr.currentValue);
              }}
              onToggle={() => toggleKeyResult(kr.id)}
              onDelete={() => {
                setDeleteConfirm({ open: true, onConfirm: () => deleteKeyResult(kr.id) });
              }}
              onEditCheckDate={() => setEditingKRCheckDate({ kr, value: kr.checkDate || null })}
              onLinkTask={() => setShowTaskLink(kr.id)}
              onUnlinkTask={(taskId) => onUnlinkTask(kr.id, taskId)}
            />
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="card p-4 mb-4">
        <div className="text-sm font-semibold mb-2">{t('goal.milestones')}</div>
        <div className="space-y-1.5 mb-2">
          {goal.milestones.map((m) => (
            <MilestoneRow key={m.id} m={m} onToggle={() => toggleMilestone(m.id)}
              onDelete={() => { setDeleteConfirm({ open: true, onConfirm: () => deleteMilestone(m.id) }); }} />
          ))}
        </div>
        <AddMilestoneInput goalId={goal.id} onCreate={createMilestone} />
      </div>

      {/* Linked Tasks */}
      {goal.linkedTasks.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-sm font-semibold mb-2">{t('goal.linkedTasks')}</div>
          <div className="space-y-1.5">
            {goal.linkedTasks.map((lt) => (
              <div key={lt.id} className="flex items-center gap-2 text-sm">
                <span className={`w-3 h-3 rounded-full ${lt.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className={lt.isCompleted ? 'line-through text-text-muted' : ''}>{lt.title}</span>
                <span className="text-xs text-text-muted ml-auto">{lt.boardName}/{lt.listName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review / Notes */}
      {goal.reviewNote && (
        <div className="card p-4">
          <div className="text-sm font-semibold mb-2">{t('goal.review')}</div>
          {goal.reviewScore && <div className="mb-1">{'★'.repeat(goal.reviewScore)}{'☆'.repeat(5 - goal.reviewScore)}</div>}
          <div className="text-sm text-text-muted whitespace-pre-wrap">{goal.reviewNote}</div>
        </div>
      )}

      {/* Add KR Modal */}
      <Modal open={showAddKR} onClose={() => setShowAddKR(false)} title={t('goal.addKR')}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setShowAddKR(false)}>{t('common.cancel')}</Button>
        <Button onClick={onAddKR}>{t('common.create')}</Button></>}>
        <div className="space-y-3">
          <Input label={t('goal.krTitle')} value={krTitle} onChange={(e) => setKrTitle(e.target.value)} />
          <div>
            <label className="label">{t('goal.krType')}</label>
            <div className="card p-0.5 flex items-center text-sm gap-1">
              {KR_TYPE_OPTIONS.map((m) => (
                <button key={m} onClick={() => setKrType(m)}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 ${krType === m ? 'bg-primary text-white' : 'text-text-muted'}`}>
                  {krTypeIcon(m)}
                  {t(`goal.${m}`)}
                </button>
              ))}
            </div>
          </div>
          {krType === 'metric' && (
            <div className="grid grid-cols-3 gap-3">
              <Input label={t('goal.startValue')} type="number" value={krStart}
                onChange={(e) => setKrStart(Number(e.target.value) || 0)} />
              <Input label={t('goal.targetValue')} type="number" value={krTarget}
                onChange={(e) => setKrTarget(Number(e.target.value) || 100)} />
              <Input label={t('goal.unit')} value={krUnit} onChange={(e) => setKrUnit(e.target.value)} placeholder="km / 次 / 本" />
            </div>
          )}
          {krType === 'task' && (
            <div className="text-sm text-text-muted py-2">
              {t('goal.linkTask')} — {t('goal.selectTask')} {t('goal.keyResult')}
            </div>
          )}
          <Input label={t('goal.weight')} type="number" value={krWeight} min={1} max={100}
            onChange={(e) => setKrWeight(Math.max(1, Math.min(100, Number(e.target.value) || 20)))} />
          <div>
            <label className="label">{t('goal.checkDate')}</label>
            <DateTimePicker value={krCheckDate} onChange={setKrCheckDate} withTime />
          </div>
        </div>
      </Modal>

      {/* Check-in Modal */}
      <Modal open={!!checkInKR} onClose={() => setCheckInKR(null)} title={`${t('goal.updateKR')}: ${checkInKR?.title}`}
        footer={<><Button variant="ghost" onClick={() => setCheckInKR(null)}>{t('common.cancel')}</Button>
        <Button onClick={onCheckIn}>{t('board.save')}</Button></>}>
        <div className="space-y-3">
          {checkInKR?.type === 'metric' ? (
            <Input label={`${checkInKR.title} (${checkInKR.unit || ''})`} type="number"
              value={checkInValue} onChange={(e) => setCheckInValue(Number(e.target.value))} />
          ) : checkInKR?.type === 'boolean' ? (
            <div className="text-center py-4">
              <Button onClick={async () => { await checkInKeyResult(checkInKR!.id, 1); setCheckInKR(null); toast.success('✓'); }}>
                {t('board.save')} ✓
              </Button>
            </div>
          ) : (
            <div className="text-sm text-text-muted py-2">
              {t('goal.task')} KR — {t('goal.linkTask')}
            </div>
          )}
          <Textarea label={t('goal.comment')} value={checkInComment} onChange={(e) => setCheckInComment(e.target.value)} placeholder={t('goal.commentPlaceholder')} />
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title={t('goal.review')}
        footer={<><Button variant="ghost" onClick={() => setShowReview(false)}>{t('common.cancel')}</Button>
        <Button onClick={async () => {
          await saveReview(goal.id, reviewScore, reviewNote || undefined);
          setShowReview(false);
          toast.success('✓');
        }}>{t('board.save')}</Button></>}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('goal.score')}</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setReviewScore(s)} className="text-2xl">
                  {s <= (reviewScore || 0) ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>
          <Textarea label={t('goal.review')} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
            placeholder={t('goal.reviewPlaceholder')} />
        </div>
      </Modal>

      <Modal
        open={!!editingKRCheckDate}
        onClose={() => setEditingKRCheckDate(null)}
        title={t('goal.checkDate')}
        footer={<><Button variant="ghost" onClick={() => setEditingKRCheckDate(null)}>{t('common.cancel')}</Button>
        <Button onClick={onSaveKRCheckDate}>{t('board.save')}</Button></>}
      >
        <div className="space-y-3">
          <div className="text-sm font-medium">{editingKRCheckDate?.kr.title}</div>
          <DateTimePicker
            value={editingKRCheckDate?.value || null}
            onChange={(value) => editingKRCheckDate && setEditingKRCheckDate({ ...editingKRCheckDate, value })}
            withTime
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editingKRCheckDate && setEditingKRCheckDate({ ...editingKRCheckDate, value: null })}
          >
            {t('common.clear') || 'Clear'}
          </Button>
        </div>
      </Modal>

      {/* Task Link Modal */}
      <Modal open={!!showTaskLink} onClose={() => setShowTaskLink(null)} title={t('goal.linkTask')}
        size="lg"
        footer={<Button variant="ghost" onClick={() => setShowTaskLink(null)}>{t('common.close')}</Button>}>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {allTasks.filter(t => !t.isCompleted).map((task) => (
            <button
              key={task.id}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 transition-colors text-sm"
              onClick={() => onLinkTask(showTaskLink!, task.id)}
            >
              {task.title}
            </button>
          ))}
          {allTasks.filter(t => !t.isCompleted).length === 0 && (
            <div className="text-sm text-text-muted text-center py-4">{t('common.empty')}</div>
          )}
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

function KRCard({ kr, goal, progressColor, onCheckIn, onToggle, onDelete, onEditCheckDate, onLinkTask, onUnlinkTask }: {
  kr: KeyResult; goal: GoalWithDetails; progressColor: string;
  onCheckIn: () => void; onToggle: () => void; onDelete: () => void;
  onEditCheckDate: () => void;
  onLinkTask: () => void; onUnlinkTask: (taskId: string) => void;
}) {
  const { t } = useTranslation();
  const progress = kr.type === 'boolean'
    ? (kr.isCompleted ? 100 : 0)
    : kr.type === 'metric'
      ? Math.max(0, Math.min(100, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100))
      : Math.max(0, Math.min(100, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100));

  const krTypeIcon = (type: string) => {
    switch (type) {
      case 'metric': return <TrendingUp size={14} className="text-blue-500" />;
      case 'boolean': return <CheckCircle2 size={14} className="text-green-500" />;
      case 'task': return <ListTodo size={14} className="text-purple-500" />;
      default: return <TrendingUp size={14} />;
    }
  };

  return (
    <div className="border border-border rounded-lg p-3 group">
      <div className="flex items-start gap-2">
        {kr.type === 'boolean' ? (
          <button onClick={onToggle} className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5"
            style={{ borderColor: kr.isCompleted ? 'var(--primary)' : 'var(--border)', background: kr.isCompleted ? 'var(--primary)' : 'transparent' }}>
            {kr.isCompleted && <span className="text-white text-xs">✓</span>}
          </button>
        ) : (
          <div className="shrink-0 mt-0.5">{krTypeIcon(kr.type)}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{kr.title}</span>
            <span className="text-xs text-text-muted">{kr.weight}%</span>
            <button
              type="button"
              onClick={onEditCheckDate}
              className="text-xs text-text-muted inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface-2 hover:text-primary"
              title={t('goal.checkDate')}
            >
              <CalIcon size={11} />
              {kr.checkDate ? dayjs(kr.checkDate).format('YYYY-MM-DD HH:mm') : t('goal.checkDate')}
            </button>
            {kr.type === 'task' && (
              <span className="chip text-xs">{t('goal.task')}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProgressBar value={progress / 100} color={progressColor} height={6} className="flex-1" />
            <span className="text-xs font-mono text-text-muted w-16 text-right">
              {kr.type === 'metric' ? `${kr.currentValue}/${kr.targetValue}${kr.unit || ''}` : `${Math.round(progress)}%`}
            </span>
          </div>
          {/* Task-type: show linked tasks */}
          {kr.type === 'task' && goal.linkedTasks.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {goal.linkedTasks.slice(0, 5).map((lt) => (
                <div key={lt.id} className="flex items-center gap-1 text-xs">
                  <span className={`w-2 h-2 rounded-full ${lt.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className={lt.isCompleted ? 'line-through text-text-muted' : ''}>{lt.title}</span>
                  <button
                    className="btn-ghost p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => onUnlinkTask(lt.id)}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {kr.type === 'metric' && (
            <button onClick={onCheckIn} className="btn-ghost p-1 text-xs text-primary">+1</button>
          )}
          {kr.type === 'task' && (
            <button onClick={onLinkTask} className="btn-ghost p-1 text-xs text-primary">{t('goal.linkTask')}</button>
          )}
          <button onClick={onCheckIn} className="btn-ghost p-1"><Edit3 size={12} /></button>
          <button onClick={() => onDelete()} className="btn-ghost p-1"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ m, onToggle, onDelete }: { m: Milestone; onToggle: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 text-sm group">
      <button onClick={onToggle} className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
        style={{ borderColor: m.isCompleted ? 'var(--primary)' : 'var(--border)', background: m.isCompleted ? 'var(--primary)' : 'transparent' }}>
        {m.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 ${m.isCompleted ? 'line-through text-text-muted' : ''}`}>{m.title}</span>
      <button onClick={() => onDelete()} className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function AddMilestoneInput({ goalId, onCreate }: { goalId: string; onCreate: (goalId: string, title: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [val, setVal] = useState('');
  return (
    <div className="flex items-center gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={t('goal.addMilestone').replace('+ ', '')}
        className="input flex-1" onKeyDown={async (e) => {
          if (e.key === 'Enter' && val.trim()) { await onCreate(goalId, val.trim()); setVal(''); }
        }} />
      <Button size="sm" onClick={async () => { if (val.trim()) { await onCreate(goalId, val.trim()); setVal(''); } }}>
        <Plus size={14} />
      </Button>
    </div>
  );
}
