/**
 * 五子棋联机房间（挂到同一 WebSocket 进程）
 */
import type { WebSocket } from 'ws';
import {
  applyTimeout,
  createGame,
  placeStone,
  requestUndo,
  resign,
  respondUndo,
  toPublicView,
  type GomokuState,
  type Seat,
} from '../src/gomoku/engine';
import type { GomokuClientToServer, GomokuServerToClient } from '../src/gomoku/net/protocol';

type Player = {
  seat: Seat;
  name: string;
  ready: boolean;
  ws: WebSocket | null;
  id: string;
};

type Spectator = {
  name: string;
  ws: WebSocket;
  id: string;
};

type Room = {
  id: string;
  hostSeat: Seat;
  players: [Player | null, Player | null];
  spectators: Spectator[];
  game: GomokuState | null;
};

const rooms = new Map<string, Room>();

/** ws -> roomId */
const wsRoom = new WeakMap<WebSocket, string>();
/** ws -> role */
const wsRole = new WeakMap<WebSocket, { kind: 'player'; seat: Seat } | { kind: 'spectator' }>();

let tickStarted = false;

function send(ws: WebSocket | null, msg: GomokuServerToClient) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      hostSeat: 0,
      players: [null, null],
      spectators: [],
      game: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastLobby(room: Room) {
  const payload: GomokuServerToClient = {
    type: 'lobby',
    hostSeat: room.hostSeat,
    players: [0, 1].map((seat) => {
      const p = room.players[seat as Seat];
      return {
        seat: seat as Seat,
        name: p?.name ?? '',
        ready: Boolean(p?.ready),
        connected: Boolean(p?.ws && p.ws.readyState === p.ws.OPEN),
      };
    }) as [import('../src/gomoku/net/protocol').LobbyPlayer, import('../src/gomoku/net/protocol').LobbyPlayer],
    spectators: room.spectators.map((s) => ({ name: s.name })),
  };
  for (const p of room.players) send(p?.ws ?? null, payload);
  for (const s of room.spectators) send(s.ws, payload);
}

function namesOf(room: Room): [string, string] {
  return [room.players[0]?.name || '黑方', room.players[1]?.name || '白方'];
}

function broadcastState(room: Room) {
  if (!room.game) return;
  const view = toPublicView(room.game);
  const names = namesOf(room);
  for (const p of room.players) {
    if (!p?.ws) continue;
    send(p.ws, { type: 'state', view, names, you: p.seat });
  }
  for (const s of room.spectators) {
    send(s.ws, { type: 'state', view, names, you: 'spectator' });
  }
}

function ensureTick() {
  if (tickStarted) return;
  tickStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (!room.game || room.game.status !== 'playing') continue;
      const before = room.game;
      const next = applyTimeout(before, now);
      if (next !== before && (next.status !== before.status || next.pendingUndo !== before.pendingUndo)) {
        room.game = next;
        broadcastState(room);
        if (next.status !== 'playing') {
          for (const p of room.players) {
            if (p) p.ready = false;
          }
          broadcastLobby(room);
        }
      }
    }
  }, 400);
}

function findPlayerByWs(room: Room, ws: WebSocket): Player | null {
  for (const p of room.players) {
    if (p?.ws === ws) return p;
  }
  return null;
}

export function isGomokuJoin(msg: unknown): msg is Extract<GomokuClientToServer, { type: 'join' }> {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'join' &&
    (msg as { game?: string }).game === 'gomoku'
  );
}

export function handleGomokuJoin(ws: WebSocket, msg: Extract<GomokuClientToServer, { type: 'join' }>) {
  ensureTick();
  const room = getRoom((msg.roomId || 'gomoku1').trim() || 'gomoku1');
  const name = (msg.name || '玩家').slice(0, 12);

  // 重连对战席
  for (let i = 0; i < 2; i += 1) {
    const p = room.players[i as Seat];
    if (p && p.name === name && (!p.ws || p.ws.readyState !== p.ws.OPEN)) {
      p.ws = ws;
      p.id = `${Date.now()}`;
      wsRoom.set(ws, room.id);
      wsRole.set(ws, { kind: 'player', seat: i as Seat });
      send(ws, { type: 'welcome', seat: i as Seat, roomId: room.id, isHost: room.hostSeat === i });
      broadcastLobby(room);
      if (room.game) {
        send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: i as Seat });
      }
      return;
    }
  }

  // 空座位
  for (let i = 0; i < 2; i += 1) {
    if (!room.players[i as Seat]) {
      const seat = i as Seat;
      room.players[seat] = { seat, name, ready: false, ws, id: `${Date.now()}-${seat}` };
      if (room.players.filter(Boolean).length === 1) room.hostSeat = seat;
      wsRoom.set(ws, room.id);
      wsRole.set(ws, { kind: 'player', seat });
      send(ws, { type: 'welcome', seat, roomId: room.id, isHost: seat === room.hostSeat });
      broadcastLobby(room);
      if (room.game) {
        send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: seat });
      }
      return;
    }
  }

  // 观战
  room.spectators.push({ name, ws, id: `${Date.now()}-s` });
  wsRoom.set(ws, room.id);
  wsRole.set(ws, { kind: 'spectator' });
  send(ws, { type: 'welcome', seat: 'spectator', roomId: room.id, isHost: false });
  broadcastLobby(room);
  if (room.game) {
    send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: 'spectator' });
  }
}

export function handleGomokuMessage(ws: WebSocket, raw: unknown) {
  const msg = raw as GomokuClientToServer;
  const roomId = wsRoom.get(ws);
  if (!roomId) {
    send(ws, { type: 'error', message: '请先加入房间' });
    return;
  }
  const room = rooms.get(roomId);
  if (!room) {
    send(ws, { type: 'error', message: '房间不存在' });
    return;
  }
  const role = wsRole.get(ws);

  if (msg.type === 'ready') {
    const p = findPlayerByWs(room, ws);
    if (!p) {
      send(ws, { type: 'error', message: '观战无法准备' });
      return;
    }
    if (room.game && room.game.status === 'playing') {
      send(ws, { type: 'error', message: '对局进行中' });
      return;
    }
    p.ready = Boolean(msg.ready);
    broadcastLobby(room);
    return;
  }

  if (msg.type === 'start') {
    const p = findPlayerByWs(room, ws);
    if (!p || p.seat !== room.hostSeat) {
      send(ws, { type: 'error', message: '只有房主可以开始' });
      return;
    }
    if (!room.players[0] || !room.players[1]) {
      send(ws, { type: 'error', message: '需要两位玩家' });
      return;
    }
    if (!room.players[0].ready || !room.players[1].ready) {
      send(ws, { type: 'error', message: '双方都准备后才能开始' });
      return;
    }
    room.game = createGame();
    broadcastState(room);
    broadcastLobby(room);
    return;
  }

  if (msg.type === 'place') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法落子' });
      return;
    }
    room.game = applyTimeout(room.game);
    if (room.game.status !== 'playing') {
      broadcastState(room);
      return;
    }
    const result = placeStone(room.game, p.seat, msg.r, msg.c);
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error });
      return;
    }
    room.game = result.state;
    broadcastState(room);
    if (room.game.status !== 'playing') {
      for (const pl of room.players) {
        if (pl) pl.ready = false;
      }
      broadcastLobby(room);
    }
    return;
  }

  if (msg.type === 'requestUndo') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法悔棋' });
      return;
    }
    const result = requestUndo(room.game, p.seat);
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error });
      return;
    }
    room.game = result.state;
    broadcastState(room);
    send(ws, { type: 'info', message: '已发送悔棋请求，等待对方同意' });
    const other = room.players[p.seat === 0 ? 1 : 0];
    if (other?.ws) send(other.ws, { type: 'info', message: `${p.name} 请求悔棋` });
    return;
  }

  if (msg.type === 'respondUndo') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法回应' });
      return;
    }
    const result = respondUndo(room.game, p.seat, Boolean(msg.accept));
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error });
      return;
    }
    room.game = result.state;
    broadcastState(room);
    send(ws, { type: 'info', message: msg.accept ? '已同意悔棋' : '已拒绝悔棋' });
    return;
  }

  if (msg.type === 'resign') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法认输' });
      return;
    }
    if (room.game.status !== 'playing') return;
    room.game = resign(room.game, p.seat);
    broadcastState(room);
    for (const pl of room.players) {
      if (pl) pl.ready = false;
    }
    broadcastLobby(room);
    return;
  }

  if (role?.kind === 'spectator') {
    send(ws, { type: 'error', message: '观战中无法操作' });
  }
}

export function handleGomokuClose(ws: WebSocket) {
  const roomId = wsRoom.get(ws);
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  for (const p of room.players) {
    if (p?.ws === ws) {
      p.ws = null;
      p.ready = false;
    }
  }
  room.spectators = room.spectators.filter((s) => s.ws !== ws);
  broadcastLobby(room);

  const anyone =
    room.players.some((p) => p?.ws && p.ws.readyState === p.ws.OPEN) || room.spectators.length > 0;
  if (!anyone && !room.game) {
    rooms.delete(roomId);
  }
}
