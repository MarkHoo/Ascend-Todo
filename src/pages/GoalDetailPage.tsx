import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Target, Plus, Trash2, Check, X, ChevronDown, ChevronRight,
  Calendar as CalIcon, Edit3, Star, Archive
} from 'lucide-react';
import { useGoalStore } from '@/store/useGoalStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input, Textarea } from '@/components/common/Input';
import { DateTimePicker } from '@/components/common/DateTimePicker';
import { ColorPicker } from '@/components/common/ColorPicker';
import { ProgressBar } from '@/components/common/ProgressBar';
import { toast } from '@/components/common/Toast';
import { dayjs } from '@/utils/date';
import type { GoalWithDetails, KeyResult, KeyResultWithLogs, Milestone } from '@/types';

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentGoal, fetchGoal, createMilestone, toggleMilestone, deleteMilestone,
    createKeyResult, checkInKeyResult, toggleKeyResult, deleteKeyResult, updateGoal,
    deleteGoal, archiveGoal, saveReview } = useGoalStore();

  const [showAddKR, setShowAddKR] = useState(false);
  const [krTitle, setKrTitle] = useState('');
  const [krType, setKrType] = useState<'metric' | 'boolean' | 'milestone'>('metric');
  const [krTarget, setKrTarget] = useState(100);
  const [krUnit, setKrUnit] = useState('');
  const [krWeight, setKrWeight] = useState(20);
  const [checkInKR, setCheckInKR] = useState<KeyResult | null>(null);
  const [checkInValue, setCheckInValue] = useState(0);
  const [checkInComment, setCheckInComment] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (id) fetchGoal(id);
  }, [id, fetchGoal]);

  if (!id || !currentGoal) {
    return <div className="p-6 text-text-muted">{t('common.loading')}</div>;
  }

  const goal = currentGoal;
  const daysLeft = goal.dueAt ? dayjs(goal.dueAt).diff(dayjs(), 'day') : null;

  const onAddKR = async () => {
    if (!krTitle.trim()) { toast.error('!'); return; }
    await createKeyResult({
      goalId: goal.id,
      title: krTitle.trim(),
      krType,
      targetValue: krType === 'metric' ? krTarget : undefined,
      unit: krUnit || undefined,
      weight: krWeight,
    });
    setShowAddKR(false);
    setKrTitle('');
    setKrTarget(100);
    setKrUnit('');
    setKrWeight(20);
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
    if (confirm(t('goal.deleteConfirm'))) {
      await archiveGoal(goal.id);
      toast.success('✓');
    }
  };

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
            {goal.category && <span className="chip">{goal.category}</span>}
            {goal.dueAt && (
              <span className="flex items-center gap-1">
                <CalIcon size={11} /> {dayjs(goal.dueAt).format('YYYY-MM-DD')}
                {daysLeft !== null && daysLeft >= 0 && <span className="text-warning">({daysLeft}d)</span>}
              </span>
            )}
            {goal.weight && <span>★ {goal.weight}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowReview(true)}>
            <Star size={14} /> {t('goal.progress')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onArchive}>
            <Archive size={14} />
          </Button>
          <Button size="sm" variant="danger" onClick={async () => {
            if (confirm(t('goal.deleteConfirm'))) { await deleteGoal(goal.id); navigate('/goals'); }
          }}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Progress */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('goal.progress')}</span>
          <span className="text-lg font-semibold">{Math.round(goal.progress * 100)}%</span>
        </div>
        <ProgressBar value={goal.progress} color={goal.color || 'var(--primary)'} height={10} />
      </div>

      {/* Key Results */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Key Results</div>
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
              onCheckIn={() => {
                setCheckInKR(kr);
                setCheckInValue(kr.currentValue);
              }}
              onToggle={() => toggleKeyResult(kr.id)}
              onDelete={() => {
                if (confirm(t('goal.deleteConfirm'))) deleteKeyResult(kr.id);
              }}
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
              onDelete={() => { if (confirm(t('goal.deleteConfirm'))) deleteMilestone(m.id); }} />
          ))}
        </div>
        <AddMilestoneInput goalId={goal.id} onCreate={createMilestone} />
      </div>

      {/* Linked Tasks */}
      {goal.linkedTasks.length > 0 && (
        <div className="card p-4 mb-4">
          <div className="text-sm font-semibold mb-2">{t('board.subtask')}</div>
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
          <div className="text-sm font-semibold mb-2">{t('goal.progress')}</div>
          {goal.reviewScore && <div className="mb-1">{'★'.repeat(goal.reviewScore)}{'☆'.repeat(5 - goal.reviewScore)}</div>}
          <div className="text-sm text-text-muted whitespace-pre-wrap">{goal.reviewNote}</div>
        </div>
      )}

      {/* Add KR Modal */}
      <Modal open={showAddKR} onClose={() => setShowAddKR(false)} title="Add Key Result"
        footer={<><Button variant="ghost" onClick={() => setShowAddKR(false)}>{t('common.cancel')}</Button>
        <Button onClick={onAddKR}>{t('common.create')}</Button></>}>
        <div className="space-y-3">
          <Input label={t('goal.title')} value={krTitle} onChange={(e) => setKrTitle(e.target.value)} />
          <div>
            <label className="label">Type</label>
            <div className="card p-0.5 flex items-center text-sm">
              {(['metric', 'boolean', 'milestone'] as const).map((m) => (
                <button key={m} onClick={() => setKrType(m)}
                  className={`px-3 py-1.5 rounded-md ${krType === m ? 'bg-primary text-white' : 'text-text-muted'}`}>{m}</button>
              ))}
            </div>
          </div>
          {krType === 'metric' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label={t('goal.totalValue')} type="number" value={krTarget}
                onChange={(e) => setKrTarget(Number(e.target.value) || 100)} />
              <Input label={t('profile.signature')} value={krUnit} onChange={(e) => setKrUnit(e.target.value)} placeholder="km / 次 / 本" />
            </div>
          )}
          <Input label={t('goal.percentage')} type="number" value={krWeight} min={1} max={100}
            onChange={(e) => setKrWeight(Math.max(1, Math.min(100, Number(e.target.value) || 20)))} />
        </div>
      </Modal>

      {/* Check-in Modal */}
      <Modal open={!!checkInKR} onClose={() => setCheckInKR(null)} title={`Update: ${checkInKR?.title}`}
        footer={<><Button variant="ghost" onClick={() => setCheckInKR(null)}>{t('common.cancel')}</Button>
        <Button onClick={onCheckIn}>{t('board.save')}</Button></>}>
        <div className="space-y-3">
          {checkInKR?.type === 'metric' ? (
            <Input label={`${checkInKR.title} (${checkInKR.unit || ''})`} type="number"
              value={checkInValue} onChange={(e) => setCheckInValue(Number(e.target.value))} />
          ) : (
            <div className="text-center py-4">
              <Button onClick={async () => { await checkInKeyResult(checkInKR!.id, 1); setCheckInKR(null); toast.success('✓'); }}>
                {t('pomodoro.start')} ✓
              </Button>
            </div>
          )}
          <Textarea label="Comment" value={checkInComment} onChange={(e) => setCheckInComment(e.target.value)} placeholder="How did it go?" />
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal open={showReview} onClose={() => setShowReview(false)} title={t('goal.progress')}
        footer={<><Button variant="ghost" onClick={() => setShowReview(false)}>{t('common.cancel')}</Button>
        <Button onClick={async () => {
          await saveReview(goal.id, reviewScore, reviewNote || undefined);
          setShowReview(false);
          toast.success('✓');
        }}>{t('board.save')}</Button></>}>
        <div className="space-y-3">
          <div>
            <label className="label">Score</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setReviewScore(s)} className="text-2xl">
                  {s <= (reviewScore || 0) ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>
          <Textarea label={t('profile.signature')} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
            placeholder="What worked? What didn't? What to improve?" />
        </div>
      </Modal>
    </div>
  );
}

function KRCard({ kr, goal, onCheckIn, onToggle, onDelete }: {
  kr: KeyResult; goal: GoalWithDetails;
  onCheckIn: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const progress = kr.type === 'boolean'
    ? (kr.isCompleted ? 100 : 0)
    : kr.type === 'metric'
      ? Math.max(0, Math.min(100, ((kr.currentValue - kr.startValue) / (kr.targetValue - kr.startValue)) * 100))
      : 0;

  // Progress color based on time elapsed
  const progressColor = (() => {
    if (!goal.startDate || !goal.dueAt) return 'var(--primary)';
    const now = dayjs();
    const start = dayjs(goal.startDate);
    const end = dayjs(goal.dueAt);
    const totalDays = end.diff(start, 'day');
    if (totalDays <= 0) return 'var(--success)';
    const elapsed = now.diff(start, 'day');
    const timeRate = Math.min(100, (elapsed / totalDays) * 100);
    const gap = timeRate - progress;
    if (gap <= 0) return 'var(--success)';
    if (gap <= 20) return 'var(--warning)';
    return 'var(--danger)';
  })();

  return (
    <div className="border border-border rounded-lg p-3 group">
      <div className="flex items-start gap-2">
        {kr.type === 'boolean' ? (
          <button onClick={onToggle} className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5"
            style={{ borderColor: kr.isCompleted ? 'var(--primary)' : 'var(--border)', background: kr.isCompleted ? 'var(--primary)' : 'transparent' }}>
            {kr.isCompleted && <span className="text-white text-xs">✓</span>}
          </button>
        ) : (
          <div className="w-5 h-5 shrink-0 mt-0.5 rounded-full" style={{ background: progressColor, opacity: 0.8 }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{kr.title}</span>
            <span className="text-xs text-text-muted">{kr.weight}%</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProgressBar value={progress / 100} color={progressColor} height={6} className="flex-1" />
            <span className="text-xs font-mono text-text-muted w-16 text-right">
              {kr.type === 'metric' ? `${kr.currentValue}/${kr.targetValue}${kr.unit || ''}` : `${Math.round(progress)}%`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {kr.type === 'metric' && (
            <button onClick={onCheckIn} className="btn-ghost p-1 text-xs text-primary">+1</button>
          )}
          <button onClick={onCheckIn} className="btn-ghost p-1"><Edit3 size={12} /></button>
          <button onClick={onDelete} className="btn-ghost p-1"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({ m, onToggle, onDelete }: { m: Milestone; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm group">
      <button onClick={onToggle} className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
        style={{ borderColor: m.isCompleted ? 'var(--primary)' : 'var(--border)', background: m.isCompleted ? 'var(--primary)' : 'transparent' }}>
        {m.isCompleted && <span className="text-white text-[10px]">✓</span>}
      </button>
      <span className={`flex-1 ${m.isCompleted ? 'line-through text-text-muted' : ''}`}>{m.title}</span>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-0.5">
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
