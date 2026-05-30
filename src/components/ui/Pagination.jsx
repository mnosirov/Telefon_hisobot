import { ChevronLeft, ChevronRight } from 'lucide-react';

const Pagination = ({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-dark-100 dark:border-dark-700">
      <p className="text-sm text-dark-500 dark:text-dark-400">
        {startItem}–{endItem} / {totalItems} ta
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-dark-600 dark:text-dark-400" />
        </button>

        {pages.map((page, idx) =>
          page === '...' ? (
            <span key={`dots-${idx}`} className="px-2 text-dark-400">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                currentPage === page
                  ? 'bg-primary-600 text-white'
                  : 'text-dark-600 dark:text-dark-400 hover:bg-dark-100 dark:hover:bg-dark-700'
              }`}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-dark-600 dark:text-dark-400" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
