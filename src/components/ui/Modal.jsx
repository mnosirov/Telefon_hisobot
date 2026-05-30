import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-content ${sizes[size]} w-full`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-100 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-dark-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
