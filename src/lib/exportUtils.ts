import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(num || 0);
}

export function formatDate(dateInput: string | Date | undefined | null, format = 'YYYY-MM-DD'): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (format === 'DD/MM/YYYY') return `${day}/${m}/${y}`;
  if (format === 'MM/DD/YYYY') return `${m}/${day}/${y}`;
  return `${y}-${m}-${day}`;
}

export function exportToExcel(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, unknown>>
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportToPdf(params: {
  filename: string;
  title: string;
  companyName?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  const doc = new jsPDF({ orientation: params.columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(13);
  doc.setTextColor(11, 25, 44);
  doc.text(params.companyName || 'KHAYRE CONSTRUCTION AND MATERIALS COMPANY', 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${params.title}  |  Generated: ${new Date().toLocaleString()}`, 14, 22);

  autoTable(doc, {
    head: [params.columns],
    body: params.rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [11, 25, 44], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${params.filename}.pdf`);
}
