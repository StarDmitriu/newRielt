import type { Agent } from 'https';
import type { ProxyInterface } from 'telegram/network/connection/TCPMTProxy';
import { HttpsProxyAgent } from 'https-proxy-agent';

function readIntEnv(name: string): number | null {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function getWhatsappProxyAgent(): Agent | undefined {
  const proxyUrl = String(process.env.WA_PROXY_URL || '').trim();
  if (!proxyUrl) return undefined;
  return new HttpsProxyAgent(proxyUrl);
}

export function getWhatsappConnectTimeoutMs(): number {
  return readIntEnv('WA_CONNECT_TIMEOUT_MS') ?? 20_000;
}

export function getWhatsappKeepAliveIntervalMs(): number {
  return readIntEnv('WA_KEEPALIVE_INTERVAL_MS') ?? 20_000;
}

export function getTelegramProxy(): ProxyInterface | undefined {
  const host = String(process.env.TG_PROXY_HOST || '').trim();
  const port = readIntEnv('TG_PROXY_PORT');

  if (!host || !port) return undefined;

  const username =
    String(process.env.TG_PROXY_USERNAME || '').trim() || undefined;
  const password =
    String(process.env.TG_PROXY_PASSWORD || '').trim() || undefined;

  const mtProxySecret = String(process.env.TG_PROXY_SECRET || '').trim();
  if (mtProxySecret) {
    return {
      ip: host,
      port,
      username,
      password,
      secret: mtProxySecret,
      MTProxy: true,
    };
  }

  const socksTypeRaw = readIntEnv('TG_PROXY_SOCKS_TYPE');
  const socksType = socksTypeRaw === 4 ? 4 : 5;

  return {
    ip: host,
    port,
    username,
    password,
    socksType,
  };
}

export function shouldUseTelegramWss(): boolean {
  return !getTelegramProxy();
}
