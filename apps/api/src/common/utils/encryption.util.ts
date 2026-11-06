import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    // Fallback dev key — em produção obrigatório via env
    return createHash('sha256').update('postae-dev-key').digest();
  }
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : createHash('sha256').update(raw).digest();
}

export function encrypt(value: string | null | undefined): string {
  if (!value) return '';
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ivB64 = iv.toString('base64');
  const dataB64 = encrypted.toString('base64');
  const tagB64 = authTag.toString('base64');
  const payload = Buffer.from(`${ivB64}.${dataB64}.${tagB64}`);
  return payload.toString('base64');
}

export function decrypt(value: string | null | undefined): string {
  if (!value) return '';
  try {
    // O envelope completo é salvo em Base64. Versões anteriores tentavam
    // separar iv/data/tag diretamente no texto Base64; mantemos suporte ao
    // formato antigo (sem envelope) para não perder credenciais existentes.
    let payload = value;
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (decoded.split('.').length === 3) {
      payload = decoded;
    }

    const [ivB64, dataB64, tagB64] = payload.split('.');
    if (!ivB64 || !dataB64 || !tagB64) return '';
    const iv = Buffer.from(ivB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Token corrompido — invalida a credencial
    return '';
  }
}
