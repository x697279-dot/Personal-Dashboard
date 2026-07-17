/**
 * 飞行棋联机房间（挂到同一 WebSocket 进程）
 */
import type { WebSocket } from 'ws';
import {
  createGame,
  movePiece,
  rollDice,
  toPublicView,
  type FlyingState,
  type PlayerCount,
  type Seat,
  type TakeoffMode,
} from '../src/flying/engine';
import type { FlyingClientToServer, FlyingServerToClient, LobbyPlayer } from '../src/flying/net/protocol';

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
  playerCount: PlayerCount;
  takeoffMode: TakeoffMode;
  players: (Player | null)[];
  spectators: Spectator[];
  game: FlyingState | null;
};

const rooms = new Map<string, Room>();
const wsRoom = new WeakMap<WebSocket, string>();
const wsRole = new WeakMap<WebSocket, { kind: 'player'; seat: Seat } | { kind: 'spectator' }>();

function send(ws: WebSocket | null, msg: FlyingServerToClient) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      id: roomId,
      hostSeat: 0,
      playerCount: 4,
      takeoffMode: '246',
      players: [null, null, null, null],
      spectators: [],
      game: null,
    };
    rooms.set(roomId, room);
  }
  return room;
}

function resizePlayers(room: Room, count: PlayerCount) {
  room.playerCount = count;
  const next: (Player | null)[] = [null, null, null, null];
  for (let i = 0; i < 4; i += 1) {
    if (i < count) next[i] = room.players[i] ?? null;
    else if (room.players[i]?.ws) {
      const p = room.players[i]!;
      room.spectators.push({ name: p.name, ws: p.ws!, id: p.id });
      wsRole.set(p.ws!, { kind: 'spectator' });
      send(p.ws, { type: 'welcome', seat: 'spectator', roomId: room.id, isHost: false });
      send(p.ws, { type: 'info', message: '人数已调整，你改为观战' });
    }
  }
  room.players = next;
  if (room.hostSeat >= count) {
    const first = next.findIndex(Boolean);
    room.hostSeat = (first >= 0 ? first : 0) as Seat;
  }
}

function lobbyPlayers(room: Room): LobbyPlayer[] {
  return Array.from({ length: room.playerCount }, (_, seat) => {
    const p = room.players[seat];
    return {
      seat: seat as Seat,
      name: p?.name ?? '',
      ready: Boolean(p?.ready),
      connected: Boolean(p?.ws && p.ws.readyState === p.ws.OPEN),
    };
  });
}

function broadcastLobby(room: Room) {
  const payload: FlyingServerToClient = {
    type: 'lobby',
    hostSeat: room.hostSeat,
    playerCount: room.playerCount,
    takeoffMode: room.takeoffMode,
    players: lobbyPlayers(room),
    spectators: room.spectators.map((s) => ({ name: s.name })),
  };
  for (let i = 0; i < room.playerCount; i += 1) send(room.players[i]?.ws ?? null, payload);
  for (const s of room.spectators) send(s.ws, payload);
}

function namesOf(room: Room): string[] {
  return Array.from({ length: room.playerCount }, (_, i) => room.players[i]?.name || `玩家${i + 1}`);
}

function broadcastState(room: Room) {
  if (!room.game) return;
  const view = toPublicView(room.game);
  const names = namesOf(room);
  for (let i = 0; i < room.playerCount; i += 1) {
    const p = room.players[i];
    if (!p?.ws) continue;
    send(p.ws, { type: 'state', view, names, you: p.seat });
  }
  for (const s of room.spectators) {
    send(s.ws, { type: 'state', view, names, you: 'spectator' });
  }
}

function findPlayerByWs(room: Room, ws: WebSocket): Player | null {
  for (const p of room.players) {
    if (p?.ws === ws) return p;
  }
  return null;
}

export function isFlyingJoin(msg: unknown): msg is Extract<FlyingClientToServer, { type: 'join' }> {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'join' &&
    (msg as { game?: string }).game === 'flying'
  );
}

export function handleFlyingJoin(ws: WebSocket, msg: Extract<FlyingClientToServer, { type: 'join' }>) {
  const room = getRoom((msg.roomId || 'fly1').trim() || 'fly1');
  const name = (msg.name || '玩家').slice(0, 12);

  for (let i = 0; i < room.playerCount; i += 1) {
    const p = room.players[i];
    if (p && p.name === name && (!p.ws || p.ws.readyState !== p.ws.OPEN)) {
      p.ws = ws;
      p.id = `${Date.now()}`;
      wsRoom.set(ws, room.id);
      wsRole.set(ws, { kind: 'player', seat: i as Seat });
      send(ws, { type: 'welcome', seat: i as Seat, roomId: room.id, isHost: room.hostSeat === i });
      broadcastLobby(room);
      if (room.game) send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: i as Seat });
      return;
    }
  }

  for (let i = 0; i < room.playerCount; i += 1) {
    if (!room.players[i]) {
      const seat = i as Seat;
      room.players[seat] = { seat, name, ready: false, ws, id: `${Date.now()}-${seat}` };
      if (room.players.filter(Boolean).length === 1) room.hostSeat = seat;
      wsRoom.set(ws, room.id);
      wsRole.set(ws, { kind: 'player', seat });
      send(ws, { type: 'welcome', seat, roomId: room.id, isHost: seat === room.hostSeat });
      broadcastLobby(room);
      if (room.game) send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: seat });
      return;
    }
  }

  room.spectators.push({ name, ws, id: `${Date.now()}-s` });
  wsRoom.set(ws, room.id);
  wsRole.set(ws, { kind: 'spectator' });
  send(ws, { type: 'welcome', seat: 'spectator', roomId: room.id, isHost: false });
  broadcastLobby(room);
  if (room.game) send(ws, { type: 'state', view: toPublicView(room.game), names: namesOf(room), you: 'spectator' });
}

export function handleFlyingMessage(ws: WebSocket, raw: unknown) {
  const msg = raw as FlyingClientToServer;
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

  if (msg.type === 'setPlayerCount') {
    const p = findPlayerByWs(room, ws);
    if (!p || p.seat !== room.hostSeat) {
      send(ws, { type: 'error', message: '只有房主可改人数' });
      return;
    }
    if (room.game && room.game.phase !== 'finished') {
      send(ws, { type: 'error', message: '对局中不可改人数' });
      return;
    }
    const count = msg.count;
    if (count !== 2 && count !== 3 && count !== 4) {
      send(ws, { type: 'error', message: '人数须为 2～4' });
      return;
    }
    room.game = null;
    resizePlayers(room, count);
    broadcastLobby(room);
    return;
  }

  if (msg.type === 'setTakeoffMode') {
    const p = findPlayerByWs(room, ws);
    if (!p || p.seat !== room.hostSeat) {
      send(ws, { type: 'error', message: '只有房主可改起飞点数' });
      return;
    }
    if (room.game && room.game.phase !== 'finished') {
      send(ws, { type: 'error', message: '对局中不可改规则' });
      return;
    }
    if (msg.mode !== '246' && msg.mode !== '56' && msg.mode !== '6') {
      send(ws, { type: 'error', message: '起飞点数无效' });
      return;
    }
    room.takeoffMode = msg.mode;
    room.game = null;
    broadcastLobby(room);
    return;
  }

  if (msg.type === 'ready') {
    const p = findPlayerByWs(room, ws);
    if (!p) {
      send(ws, { type: 'error', message: '观战无法准备' });
      return;
    }
    if (room.game && room.game.phase !== 'finished') {
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
    for (let i = 0; i < room.playerCount; i += 1) {
      const pl = room.players[i];
      if (!pl || !pl.ready || !pl.ws || pl.ws.readyState !== pl.ws.OPEN) {
        send(ws, { type: 'error', message: `需要 ${room.playerCount} 人全部准备` });
        return;
      }
    }
    room.game = createGame(room.playerCount, room.takeoffMode);
    broadcastState(room);
    broadcastLobby(room);
    return;
  }

  if (msg.type === 'roll') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法掷骰' });
      return;
    }
    const result = rollDice(room.game, p.seat);
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error });
      return;
    }
    room.game = result.state;
    broadcastState(room);
    if (room.game.phase === 'finished') {
      for (const pl of room.players) {
        if (pl) pl.ready = false;
      }
      broadcastLobby(room);
    }
    return;
  }

  if (msg.type === 'move') {
    const p = findPlayerByWs(room, ws);
    if (!p || !room.game) {
      send(ws, { type: 'error', message: '无法走子' });
      return;
    }
    const result = movePiece(room.game, p.seat, msg.pieceIndex);
    if (!result.ok) {
      send(ws, { type: 'error', message: result.error });
      return;
    }
    room.game = result.state;
    broadcastState(room);
    if (room.game.phase === 'finished') {
      for (const pl of room.players) {
        if (pl) pl.ready = false;
      }
      broadcastLobby(room);
    }
    return;
  }

  const role = wsRole.get(ws);
  if (role?.kind === 'spectator') {
    send(ws, { type: 'error', message: '观战中无法操作' });
  }
}

export function handleFlyingClose(ws: WebSocket) {
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
