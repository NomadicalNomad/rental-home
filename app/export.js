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
  const text = String(value ?? '');
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

function pdfSafe(text) {
  return String(text ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, '?');
}

function pdfEscape(text) {
  return pdfSafe(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapWords(text, maxChars) {
  const words = pdfSafe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word.length > maxChars ? word.slice(0, maxChars) : word;
    } else {
      line = next.length > maxChars ? next.slice(0, maxChars) : next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function moneyPlain(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatLongDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildPdf(objects) {
  const header = '%PDF-1.1\n';
  let body = '';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(header.length + body.length);
    body += object;
  }
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  const startxref = header.length + body.length;
  const trailer = `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return header + body + xref + trailer;
}

export function expensesToPdf({ address, list, exportedAt = new Date() }) {
  const rows = list || [];
  const { count, total } = exportTotals(rows);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const lineHeight = 13;
  const noteWidthChars = 42;
  const commandsForHeader = () => [
    '0.059 0.463 0.431 RG',
    '1.5 w',
    `${margin} ${pageHeight - 92} m ${pageWidth - margin} ${pageHeight - 92} l S`,
    '0 0 0 RG 0 0 0 rg',
    'BT',
    `/F1 16 Tf ${margin} ${pageHeight - 56} Td (${pdfEscape('RentManor')}) Tj`,
    `/F1 11 Tf 0 -18 Td (${pdfEscape(address || 'Property')}) Tj`,
    `/F1 10 Tf 0 -16 Td (${pdfEscape(`Expenses · ${formatLongDate(exportedAt)}`)}) Tj`,
    'ET'
  ];

  const tableHeader = y => [
    'BT',
    `/F1 9 Tf ${margin} ${y} Td (${pdfEscape('Date')}) Tj`,
    `/F1 9 Tf 88 0 Td (${pdfEscape('Category')}) Tj`,
    `/F1 9 Tf 92 0 Td (${pdfEscape('Notes')}) Tj`,
    `/F1 9 Tf 250 0 Td (${pdfEscape('Amount')}) Tj`,
    'ET',
    '0.059 0.463 0.431 RG 0.8 w',
    `${margin} ${y - 6} m ${pageWidth - margin} ${y - 6} l S`,
    '0 0 0 RG'
  ];

  const pages = [];
  let commands = [...commandsForHeader(), ...tableHeader(pageHeight - 114)];
  let y = pageHeight - 132;

  const flushPage = footer => {
    if (footer) commands.push(...footer);
    pages.push(commands);
    commands = [...commandsForHeader(), ...tableHeader(pageHeight - 114)];
    y = pageHeight - 132;
  };

  rows.forEach(item => {
    const noteLines = wrapWords(item.notes, noteWidthChars);
    const blockHeight = Math.max(lineHeight, noteLines.length * 11);
    if (y - blockHeight < 72) flushPage();
    const date = item.spentOn || '';
    const category = item.category || '';
    const amount = moneyPlain(item.amount);
    commands.push(
      'BT',
      `/F1 9 Tf ${margin} ${y} Td (${pdfEscape(date)}) Tj`,
      `/F1 9 Tf 88 0 Td (${pdfEscape(category)}) Tj`,
      `/F1 9 Tf 92 0 Td (${pdfEscape(noteLines[0] || '')}) Tj`,
      `/F1 9 Tf 250 0 Td (${pdfEscape(amount)}) Tj`,
      'ET'
    );
    noteLines.slice(1).forEach((line, index) => {
      commands.push('BT', `/F1 9 Tf ${margin + 180} ${y - (index + 1) * 11} Td (${pdfEscape(line)}) Tj`, 'ET');
    });
    y -= blockHeight + 6;
  });

  const footer = [
    '0.059 0.463 0.431 RG 0.8 w',
    `${margin} ${Math.max(y - 4, 56)} m ${pageWidth - margin} ${Math.max(y - 4, 56)} l S`,
    '0 0 0 RG',
    'BT',
    `/F1 10 Tf ${margin} ${Math.max(y - 20, 40)} Td (${pdfEscape(`Total · ${count} ${count === 1 ? 'expense' : 'expenses'} · ${moneyPlain(total)}`)}) Tj`,
    'ET'
  ];
  flushPage(footer);
  if (!pages.length) pages.push([...commandsForHeader(), ...footer]);

  const pageCount = pages.length;
  const fontId = 3 + pageCount * 2;
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n',
    `2 0 obj<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pageCount} >>endobj\n`
  ];
  pages.forEach((pageCommands, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    const stream = pageCommands.join('\n');
    objects.push(`${pageObj} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>endobj\n`);
    objects.push(`${contentObj} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`);
  });
  objects.push(`${fontId} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n`);
  return buildPdf(objects);
}
