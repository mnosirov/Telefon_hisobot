/**
 * Ma'lumotlarni CSV formatida yuklab olish
 * @param {Array} data - Ob'ektlar massivi
 * @param {Array} columns - [{ key, label }] - qaysi ustunlar chiqishi
 * @param {string} filename - fayl nomi (.csv qo'shiladi)
 */
export const exportToCSV = (data, columns, filename = 'export') => {
  if (!data || data.length === 0) return;

  // BOM for Excel UTF-8 support (o'zbekcha harflar to'g'ri chiqishi uchun)
  const BOM = '\uFEFF';

  // Header qator
  const header = columns.map((c) => `"${c.label}"`).join(',');

  // Ma'lumot qatorlari
  const rows = data.map((row) =>
    columns.map((col) => {
      const val = col.format ? col.format(row[col.key], row) : (row[col.key] ?? '');
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );

  const csvContent = BOM + [header, ...rows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Firestore Timestamp yoki Date ni o'qilishi mumkin formatga o'tkazish
 */
export const formatExportDate = (val) => {
  if (!val) return '';
  try {
    const date = val?.toDate ? val.toDate() : new Date(val);
    return date.toLocaleDateString('uz-UZ');
  } catch {
    return String(val);
  }
};
