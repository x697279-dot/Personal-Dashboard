/**
 * 斗地主联机权威服务（局域网 / 公网均可）
 * 用法：npm run doudizhu-server
 * 公网部署：Render / Railway 等会注入 PORT，并提供 HTTPS→WSS 反代
 */
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  applyBid,
  applyPass,
  applyPlay,
  createInitialScores,
  createNewRound,
  toClientView,
  type GameState,
  type Seat,
} from '../src/doudizhu/engine/game';
import { DOUDIZHU_DEFAULT_PORT, type ClientToServer, type ServerToClient } from '../src/doudizhu/net/protocol';

const PORT = Number(process.env.PORT) || Number(process.env.DOUDIZHU_PORT) || DOUDIZHU_DEFAULT_PORT;

type Player = {
  seat: Seat;
  name: string;
  ready: boolean;
  ws: WebSocket | null;
  id: string;
};

type Room = {
  id: string;
  hostSeat: Seat;
  players: (Player | null)[];
  game: GameState | null;
  /** 申请换位：目标座位 -> 发起者座位 */
  pendingSwaps: Partial<Record<Seat, Seat>>;
};

const rooms = new Map<string, Room>();

function lanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const list: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) list.push(net.address);
    }
  }
  return list;
}

function send(ws: WebSocket | null, msg: ServerToClient) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcastLobby(room: Room) {
  const payload: ServerToClient = {
    type: 'lobby',
    hostSeat: room.hostSeat,
    players: [0, 1, 2].map((seat) => {
      const p = room.players[seat];
      return {
        seat: seat as Seat,
        name: p?.name ?? '',
        ready: Boolean(p?.ready),
        connected: Boolean(p?.ws && p.ws.readyState === p.ws.OPEN),
      };
    }),
  };
  for (const p of room.players) send(p?.ws ?? null, payload);
}

function broadcastState(room: Room) {
  if (!room.game) return;
  const names = [0, 1, 2].map((i) => room.players[i]?.name || `玩家${i + 1}`) as [string, string, string];
  for (const p of room.players) {
    if (!p?.ws) continue;
    send(p.ws, { type: 'state', view: toClientView(room.game, p.seat), names });
  }
}

function getRoom(roomId: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, hostSeat: 0, players: [null, null, null], game: null, pendingSwaps: {} };
    rooms.set(roomId, room);
  }
  return room;
}

function findSeatByWs(room: Room, ws: WebSocket): Seat | null {
  for (let i = 0; i < 3; i += 1) {
    if (room.players[i]?.ws === ws) return i as Seat;
  }
  return null;
}

function movePlayer(room: Room, from: Seat, to: Seat) {
  const player = room.players[from];
  if (!player) return;
  room.players[to] = player;
  room.players[from] = null;
  player.seat = to;
  player.ready = false;
  if (room.hostSeat === from) room.hostSeat = to;
}

function swapPlayers(room: Room, a: Seat, b: Seat) {
  const pa = room.players[a];
  const pb = room.players[b];
  room.players[a] = pb;
  room.players[b] = pa;
  if (pa) {
    pa.seat = b;
    pa.ready = false;
  }
  if (pb) {
    pb.seat = a;
    pb.ready = false;
  }
  if (room.hostSeat === a) room.hostSeat = b;
  else if (room.hostSeat === b) room.hostSeat = a;
}

function notifySeat(room: Room, seat: Seat) {
  const p = room.players[seat];
  if (!p?.ws) return;
  send(p.ws, { type: 'welcome', seat, roomId: room.id, isHost: seat === room.hostSeat });
}

function advanceRedeal(room: Room) {
  if (!room.game) return;
  if (room.game.phase === 'redeal') {
    room.game = createNewRound(room.game.scores, ((room.game.bidStart + 1) % 3) as Seat);
  }
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('doudizhu websocket ok');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let joinedRoomId: string | null = null;

  ws.on('message', (raw) => {
    let msg: ClientToServer;
    try {
      msg = JSON.parse(String(raw)) as ClientToServer;
    } catch {
      send(ws, { type: 'error', message: '无效消息' });
      return;
    }

    if (msg.type === 'join') {
      const room = getRoom(msg.roomId || 'room1');
      const name = (msg.name || '玩家').slice(0, 12);

      // 重连：同名离线座位
      let seat: Seat | null = null;
      for (let i = 0; i < 3; i += 1) {
        const p = room.players[i];
        if (p && p.name === name && (!p.ws || p.ws.readyState !== p.ws.OPEN)) {
          seat = i as Seat;
          p.ws = ws;
          p.id = `${Date.now()}`;
          break;
        }
      }

      if (seat === null) {
        for (let i = 0; i < 3; i += 1) {
          if (!room.players[i]) {
            seat = i as Seat;
            room.players[i] = { seat, name, ready: false, ws, id: `${Date.now()}-${i}` };
            if (room.players.filter(Boolean).length === 1) room.hostSeat = seat;
            break;
          }
        }
      }

      if (seat === null) {
        send(ws, { type: 'error', message: '房间已满' });
        return;
      }

      joinedRoomId = room.id;
      send(ws, { type: 'welcome', seat, roomId: room.id, isHost: seat === room.hostSeat });
      broadcastLobby(room);
      if (room.game) {
        const names = [0, 1, 2].map((i) => room.players[i]?.name || `玩家${i + 1}`) as [string, string, string];
        send(ws, { type: 'state', view: toClientView(room.game, seat), names });
      }
      return;
    }

    if (!joinedRoomId) {
      send(ws, { type: 'error', message: '请先加入房间' });
      return;
    }

    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const seat = findSeatByWs(room, ws);
    if (seat === null) return;

    if (msg.type === 'ready') {
      const p = room.players[seat];
      if (p) p.ready = msg.ready;
      broadcastLobby(room);
      return;
    }

    if (msg.type === 'changeSeat') {
      if (room.game) {
        send(ws, { type: 'error', message: '对局中无法换座' });
        return;
      }
      const target = msg.targetSeat;
      if (target === seat || target < 0 || target > 2) {
        send(ws, { type: 'error', message: '无效座位' });
        return;
      }
      if (room.players[target]) {
        send(ws, { type: 'error', message: '座位已被占用，请申请换位' });
        return;
      }
      movePlayer(room, seat, target);
      delete room.pendingSwaps[seat];
      delete room.pendingSwaps[target];
      for (const [t, from] of Object.entries(room.pendingSwaps)) {
        if (Number(from) === seat) delete room.pendingSwaps[Number(t) as Seat];
      }
      notifySeat(room, target);
      broadcastLobby(room);
      send(ws, { type: 'info', message: `已换到座位 ${target + 1}` });
      return;
    }

    if (msg.type === 'requestSwap') {
      if (room.game) {
        send(ws, { type: 'error', message: '对局中无法换座' });
        return;
      }
      const target = msg.targetSeat;
      if (target === seat || target < 0 || target > 2) {
        send(ws, { type: 'error', message: '无效座位' });
        return;
      }
      const targetPlayer = room.players[target];
      if (!targetPlayer?.ws || targetPlayer.ws.readyState !== targetPlayer.ws.OPEN) {
        send(ws, { type: 'error', message: '对方不在线，无法申请换位' });
        return;
      }
      room.pendingSwaps[target] = seat;
      const fromName = room.players[seat]?.name || '玩家';
      send(targetPlayer.ws, { type: 'swapRequest', fromSeat: seat, fromName });
      send(ws, { type: 'info', message: `已向座位 ${target + 1} 申请换位，等待对方同意` });
      return;
    }

    if (msg.type === 'respondSwap') {
      if (room.game) {
        send(ws, { type: 'error', message: '对局中无法换座' });
        return;
      }
      const from = msg.fromSeat;
      if (room.pendingSwaps[seat] !== from) {
        send(ws, { type: 'error', message: '没有待处理的换位申请' });
        return;
      }
      delete room.pendingSwaps[seat];
      const fromPlayer = room.players[from];
      if (!msg.accept) {
        send(fromPlayer?.ws ?? null, { type: 'info', message: `座位 ${seat + 1} 拒绝了换位` });
        send(ws, { type: 'info', message: '已拒绝换位申请' });
        return;
      }
      if (!fromPlayer || !room.players[seat]) {
        send(ws, { type: 'error', message: '换位失败，座位状态已变化' });
        return;
      }
      swapPlayers(room, from, seat);
      notifySeat(room, from);
      notifySeat(room, seat);
      broadcastLobby(room);
      send(room.players[from]?.ws ?? null, { type: 'info', message: '换位成功' });
      send(room.players[seat]?.ws ?? null, { type: 'info', message: '换位成功' });
      return;
    }

    if (msg.type === 'start') {
      if (seat !== room.hostSeat) {
        send(ws, { type: 'error', message: '只有房主可以开始' });
        return;
      }
      if (room.players.some((p) => !p || !p.ready || !p.ws)) {
        send(ws, { type: 'error', message: '需要三人全部准备并在线' });
        return;
      }
      room.game = createNewRound(room.game?.scores ?? createInitialScores(), 0);
      broadcastState(room);
      return;
    }

    if (msg.type === 'nextRound') {
      if (seat !== room.hostSeat) {
        send(ws, { type: 'error', message: '只有房主可以开下一局' });
        return;
      }
      if (!room.game || room.game.phase !== 'settled') {
        send(ws, { type: 'error', message: '本局尚未结束' });
        return;
      }
      const start = (((room.game.landlord ?? 0) + 1) % 3) as Seat;
      room.game = createNewRound(room.game.scores, start);
      broadcastState(room);
      return;
    }

    if (!room.game) {
      send(ws, { type: 'error', message: '对局尚未开始' });
      return;
    }

    if (msg.type === 'bid') {
      room.game = applyBid(room.game, seat, msg.bid);
      advanceRedeal(room);
      broadcastState(room);
      return;
    }

    if (msg.type === 'play') {
      room.game = applyPlay(room.game, seat, msg.cardIds);
      broadcastState(room);
      return;
    }

    if (msg.type === 'pass') {
      room.game = applyPass(room.game, seat);
      broadcastState(room);
      return;
    }

    if (msg.type === 'chat') {
      for (const p of room.players) send(p?.ws ?? null, { type: 'chat', seat, text: msg.text.slice(0, 80) });
    }
  });

  ws.on('close', () => {
    if (!joinedRoomId) return;
    const room = rooms.get(joinedRoomId);
    if (!room) return;
    const seat = findSeatByWs(room, ws);
    if (seat === null) return;
    const p = room.players[seat];
    if (p) p.ws = null;
    broadcastLobby(room);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanAddresses();
  console.log('');
  console.log('========================================');
  console.log('  斗地主联机服务已启动');
  console.log(`  端口: ${PORT}`);
  console.log('  局域网请填写：');
  if (ips.length) ips.forEach((ip) => console.log(`    ${ip}`));
  else console.log('    (未检测到局域网 IP，可试 127.0.0.1 本机自测)');
  console.log('  本机自测可用: 127.0.0.1');
  console.log('  公网部署后：填写平台域名，端口 443（自动 wss）');
  console.log('========================================');
  console.log('');
});
