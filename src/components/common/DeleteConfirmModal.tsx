import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
}

export function DeleteConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel, confirmVariant = 'danger' }: Props) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} size="sm" title={title || t('common.confirm')}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <p className="text-sm text-text-muted">
          {message || t('goal.deleteConfirm')}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel || t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
