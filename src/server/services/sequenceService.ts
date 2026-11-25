import crypto from 'crypto';

export function generateDocumentNumber(prefix: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomInt(1000, 9999);
  const tail = String(now.getTime()).slice(-3);
  return `${prefix}-${y}${m}${d}-${rand}${tail}`;
}
