import { AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'O\'chirish', loading = false }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white">{title}</h3>
            <p className="text-sm text-dark-500 dark:text-dark-400 mt-0.5">{message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Bekor qilish</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn-danger"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Yuklanmoqda...
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
