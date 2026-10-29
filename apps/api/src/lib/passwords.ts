import crypto from 'node:crypto';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(plain, salt, 32).toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || !/^[a-f0-9]{64}$/i.test(hash)) return false;
  const actual = crypto.scryptSync(plain, salt, 32);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
