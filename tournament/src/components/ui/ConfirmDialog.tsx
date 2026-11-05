// 確認のポップアップ（協会サイトの決まり。components/site/SiteDialog.tsx）
import SiteDialog from '../site/SiteDialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** 危険な操作かどうか（見出しに注意の印が付く） */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, danger, confirmLabel = '確定', cancelLabel = 'キャンセル', onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <SiteDialog
      open={open}
      eyebrow={danger ? 'CAUTION' : 'CONFIRM'}
      title={title}
      danger={danger}
      onClose={onCancel}
      actions={<>
        <button className="btn btn--outline sdlg__btn" onClick={onCancel}>{cancelLabel}</button>
        <button className="btn btn--primary sdlg__btn" onClick={onConfirm}>{confirmLabel}</button>
      </>}
    >
      <p className="sdlg__msg">{message}</p>
    </SiteDialog>
  );
}
