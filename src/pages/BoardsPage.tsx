import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Pin, PinOff, Trash2, Check, X } from 'lucide-react';
import { useBoardStore } from '@/store/useBoardStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { ColorPicker } from '@/components/common/ColorPicker';
import { toast } from '@/components/common/Toast';
import type { Board } from '@/types';

export function BoardsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { boards, fetchBoards, createBoard, togglePin, deleteBoard } = useBoardStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>('#6366f1');
  const [desc, setDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error(t('profile.nickname') + ' ?');
      return;
    }
    await createBoard({ name: name.trim(), color, description: desc || undefined });
    setOpen(false);
    setName('');
    setDesc('');
    setColor('#6366f1');
  };

  const startRename = (b: Board) => {
    setEditingId(b.id);
    setEditName(b.name);
  };

  const confirmRename = async () => {
    if (editingId && editName.trim()) {
      await useBoardStore.getState().updateBoard(editingId, { name: editName.trim() });
      setEditingId(null);
    }
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditName('');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">{t('board.title')}</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          {t('board.addBoard')}
        </Button>
      </div>

      {boards.length === 0 ? (
        <div className="card p-12 text-center text-text-muted">
          <div className="text-base mb-2">{t('board.noBoards')}</div>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            {t('board.addBoard')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boards.map((b) => (
            <div
              key={b.id}
              className="card-hover p-4 cursor-pointer relative"
              onClick={() => {
                if (editingId !== b.id) navigate(`/boards/${b.id}`);
              }}
            >
              <div className="flex items-start gap-2">
                <div
                  className="w-3 h-12 rounded-full shrink-0"
                  style={{ background: b.color || 'var(--primary)' }}
                />
                <div className="flex-1 min-w-0">
                  {editingId === b.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="input py-0.5 px-1 text-sm flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmRename();
                          if (e.key === 'Escape') cancelRename();
                        }}
                        autoFocus
                      />
                      <button className="btn-ghost p-0.5" onClick={confirmRename}>
                        <Check size={14} className="text-green-500" />
                      </button>
                      <button className="btn-ghost p-0.5" onClick={cancelRename}>
                        <X size={14} className="text-text-muted" />
                      </button>
                    </div>
                  ) : (
                    <div
                      className="font-semibold truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        startRename(b);
                      }}
                      title={t('board.renameBoard')}
                    >
                      {b.name}
                    </div>
                  )}
                  {b.description && (
                    <div className="text-xs text-text-muted line-clamp-2 mt-1">
                      {b.description}
                    </div>
                  )}
                </div>
                {b.isPinned && (
                  <span className="chip">
                    <Pin size={10} /> {t('board.pinned')}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(b.id);
                  }}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  {b.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                  {b.isPinned ? t('board.unpin') : t('board.pin')}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t('goal.deleteConfirm'))) {
                      deleteBoard(b.id);
                    }
                  }}
                  className="btn-danger text-xs px-2 py-1 ml-auto"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('board.addBoard')}
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
            label={t('board.taskTitle')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Tasks"
          />
          <div>
            <label className="label">{t('board.boardColor')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <Input
            label={t('board.taskDescription')}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="..."
          />
        </div>
      </Modal>
    </div>
  );
}
