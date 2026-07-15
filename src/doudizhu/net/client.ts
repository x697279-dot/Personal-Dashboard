import { DOUDIZHU_DEFAULT_PORT, type ClientToServer, type ServerToClient } from './protocol';

export type DoudizhuSocketHandlers = {
  onMessage: (msg: ServerToClient) => void;
  onClose?: () => void;
  onOpen?: () => void;
  onError?: (err: Event) => void;
};

/** 是否像内网 IP（HTTPS 页连这类地址会被浏览器拦截） */
export function looksLikePrivateHost(host: string): boolean {
  const h = host
    .trim()
    .replace(/^(wss?|https?):\/\//i, '')
    .replace(/:\d+$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

/**
 * 组装 WebSocket 地址：
 * - 已写 wss:// / ws:// 时原样使用
 * - HTTPS 页面默认走 wss（线上站必需）
 * - HTTP 本地页默认走 ws（局域网）
 */
export function buildDoudizhuWsUrl(hostInput: string, portInput: number | string = DOUDIZHU_DEFAULT_PORT): string {
  const raw = hostInput.trim();
  if (!raw) throw new Error('请填写服务器地址');

  if (/^wss?:\/\//i.test(raw)) return raw.replace(/\/$/, '');

  const cleaned = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const pageHttps = typeof location !== 'undefined' && location.protocol === 'https:';
  const preferWss = pageHttps || /^https:\/\//i.test(hostInput);
  const scheme = preferWss ? 'wss' : 'ws';

  if (/:\d+$/.test(cleaned)) return `${scheme}://${cleaned}`;

  const port = Number(portInput);
  if (preferWss && (!port || port === 443)) return `${scheme}://${cleaned}`;
  if (!preferWss && port === 80) return `${scheme}://${cleaned}`;
  const finalPort = Number.isFinite(port) && port > 0 ? port : DOUDIZHU_DEFAULT_PORT;
  return `${scheme}://${cleaned}:${finalPort}`;
}

export function connectDoudizhu(host: string, port = DOUDIZHU_DEFAULT_PORT, handlers: DoudizhuSocketHandlers) {
  const url = buildDoudizhuWsUrl(host, port);
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => handlers.onOpen?.());
  ws.addEventListener('close', () => handlers.onClose?.());
  ws.addEventListener('error', (err) => handlers.onError?.(err));
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as ServerToClient;
      handlers.onMessage(msg);
    } catch {
      handlers.onMessage({ type: 'error', message: '无法解析服务器消息' });
    }
  });

  return {
    url,
    send(msg: ClientToServer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
    raw: ws,
  };
}
