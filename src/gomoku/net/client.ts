import { GOMOKU_DEFAULT_PORT, type GomokuClientToServer, type GomokuServerToClient } from './protocol';
import { buildDoudizhuWsUrl, looksLikePrivateHost } from '../../doudizhu/net/client';

export { looksLikePrivateHost };

export type GomokuSocketHandlers = {
  onMessage: (msg: GomokuServerToClient) => void;
  onClose?: () => void;
  onOpen?: () => void;
  onError?: (err: Event) => void;
};

export function buildGomokuWsUrl(hostInput: string, portInput: number | string = GOMOKU_DEFAULT_PORT): string {
  return buildDoudizhuWsUrl(hostInput, portInput);
}

export function connectGomoku(host: string, port = GOMOKU_DEFAULT_PORT, handlers: GomokuSocketHandlers) {
  const url = buildGomokuWsUrl(host, port);
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => handlers.onOpen?.());
  ws.addEventListener('close', () => handlers.onClose?.());
  ws.addEventListener('error', (err) => handlers.onError?.(err));
  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as GomokuServerToClient;
      handlers.onMessage(msg);
    } catch {
      handlers.onMessage({ type: 'error', message: '无法解析服务器消息' });
    }
  });

  return {
    url,
    send(msg: GomokuClientToServer) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() {
      ws.close();
    },
    raw: ws,
  };
}
