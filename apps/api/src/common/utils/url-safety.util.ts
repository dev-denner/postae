import { promises as dns } from 'dns';
import { isIP } from 'net';

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = address.toLowerCase();
  return (
    value === '::1' ||
    value === '::' ||
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe80') ||
    value.startsWith('::ffff:127.') ||
    value.startsWith('::ffff:10.') ||
    value.startsWith('::ffff:192.168.')
  );
}

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

/**
 * Impede que URLs fornecidas por usuários apontem para localhost/rede interna.
 * Isso protege endpoints que baixam mídia no servidor (X e YouTube) contra SSRF.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('URL de mídia inválida.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('A mídia precisa usar uma URL http ou https pública.');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('A URL de mídia precisa ser pública; endereços internos não são permitidos.');
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('A URL de mídia precisa ser pública; endereços internos não são permitidos.');
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Não foi possível resolver o domínio da mídia. Use uma URL pública acessível.');
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('A URL de mídia precisa ser pública; endereços internos não são permitidos.');
  }
  return url;
}
