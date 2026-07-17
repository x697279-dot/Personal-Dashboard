import { FLYING_DEFAULT_PORT, type FlyingClientToServer, type FlyingServerToClient } from './protocol';
import { buildDoudizhuWsUrl, looksLikePrivateHost } from '../../doudizhu/net/client';

export { looksLikePrivateHost };

export type FlyingSocketHandlers = {
  onMessage: (msg: FlyingServerToClient) => void;
  onClose?: () => void;
  onOpen?: () => void;
  onError?: (err: Event) => void;
};

export function buildFlyingWsUrl(hostInput: string, portInput: number | string = FLYING_DEFAULT_PORT): string {
  return buildDoudizhuWsUrl(hostInput, portInput);
}

export function connectFlying(host: string, port = FLYING_DEFAULT_PORT, handlers: FlyingSocketHandlers) {
  const url = buildFlyingWsUrl(host, port);
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => handlers.onOpen?.());
  ws.addEventListener('close', () => handlers.onClose?.());
  ws.addEventListener('error', (err) => handlers.onError?.(err));
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as FlyingServerToClient;
      handlers.onMessage(msg);
    } catch {
      handlers.onMessage({ type: 'error', message: '无法解析服务器消息' });
    }
  });

  return {
    url,
    send(msg: FlyingClientToServer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
    raw: ws,
  };
}
