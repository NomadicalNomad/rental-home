import {createExpensePdf} from './pdf-report.js';
/* Per-property expense export (CSV / printable PDF). No receipt binaries. */

export const SHARE_UNAVAILABLE_TOAST = 'File saved — use your share menu';

export function canShareFiles(file, nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  if (!file || !nav?.canShare) return false;
  try {
    return Boolean(nav.canShare({ files: [file] }));
  } catch (_) {
    return false;
  }
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\x00-\x1f]*[=+@-]/u.test(text)) text = "'" + text;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function expensesToCsv(list) {
  const header = 'spent_on,amount,category,notes';
  const rows = (list || []).map(item => [
    item.spentOn || '',
    Number.isFinite(Number(item.amount)) ? Number(item.amount).toFixed(2) : '',
    item.category || '',
    item.notes || ''
  ].map(csvCell).join(','));
  return `${header}\n${rows.join('\n')}${rows.length ? '\n' : ''}`;
}

export function exportFileName(address, ext, { sample = false } = {}) {
  const short = String(address || 'property')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'property';
  return `${sample ? 'sample-' : ''}${short}-expenses.${ext}`;
}

export function exportTotals(list) {
  const rows = list || [];
  const total = rows.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return { count: rows.length, total };
}

export async function expensesToPdf(options){return createExpensePdf(options);}
