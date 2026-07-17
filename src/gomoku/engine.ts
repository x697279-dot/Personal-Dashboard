/** 五子棋核心规则：15×15，黑先，连五胜，满盘和棋 */

export const BOARD_SIZE = 15;
export const TURN_MS = 30_000;
export const UNDO_RESPOND_MS = 15_000;

/** 0 空 · 1 黑 · 2 白 */
export type Stone = 0 | 1 | 2;
/** 0 黑方 · 1 白方 */
export type Seat = 0 | 1;

export type Move = { r: number; c: number; seat: Seat };

export type GameStatus = 'playing' | 'black_win' | 'white_win' | 'draw';

export type PendingUndo = {
  fromSeat: Seat;
  deadline: number;
};

export type GomokuState = {
  board: Stone[][];
  turn: Seat;
  moves: Move[];
  status: GameStatus;
  turnDeadline: number;
  pendingUndo: PendingUndo | null;
};

export type PublicView = {
  board: Stone[][];
  turn: Seat;
  moves: Move[];
  status: GameStatus;
  turnDeadline: number;
  pendingUndo: PendingUndo | null;
  lastMove: Move | null;
};

export function seatStone(seat: Seat): Stone {
  return seat === 0 ? 1 : 2;
}

export function createGame(now = Date.now()): GomokuState {
  return {
    board: Array.from({ length: BOARD_SIZE }, () => Array<Stone>(BOARD_SIZE).fill(0)),
    turn: 0,
    moves: [],
    status: 'playing',
    turnDeadline: now + TURN_MS,
    pendingUndo: null,
  };
}

export function toPublicView(state: GomokuState): PublicView {
  return {
    board: state.board.map((row) => row.slice()),
    turn: state.turn,
    moves: state.moves.slice(),
    status: state.status,
    turnDeadline: state.turnDeadline,
    pendingUndo: state.pendingUndo ? { ...state.pendingUndo } : null,
    lastMove: state.moves.length ? state.moves[state.moves.length - 1]! : null,
  };
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/** 检查落子后是否连成五子 */
export function checkWin(board: Stone[][], r: number, c: number, stone: Stone): boolean {
  if (stone === 0) return false;
  const dirs: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const sign of [1, -1]) {
      let nr = r + dr * sign;
      let nc = c + dc * sign;
      while (inBounds(nr, nc) && board[nr]![nc] === stone) {
        count += 1;
        nr += dr * sign;
        nc += dc * sign;
      }
    }
    if (count >= 5) return true;
  }
  return false;
}

function isBoardFull(board: Stone[][]) {
  return board.every((row) => row.every((cell) => cell !== 0));
}

export function placeStone(
  state: GomokuState,
  seat: Seat,
  r: number,
  c: number,
  now = Date.now(),
): { ok: true; state: GomokuState } | { ok: false; error: string } {
  if (state.status !== 'playing') return { ok: false, error: '对局已结束' };
  if (state.pendingUndo) return { ok: false, error: '请先处理悔棋请求' };
  if (state.turn !== seat) return { ok: false, error: '还没轮到你' };
  if (!inBounds(r, c)) return { ok: false, error: '坐标无效' };
  if (state.board[r]![c] !== 0) return { ok: false, error: '此处已有棋子' };

  const next: GomokuState = {
    ...state,
    board: state.board.map((row) => row.slice()),
    moves: state.moves.slice(),
    pendingUndo: null,
  };
  const stone = seatStone(seat);
  next.board[r]![c] = stone;
  next.moves.push({ r, c, seat });

  if (checkWin(next.board, r, c, stone)) {
    next.status = seat === 0 ? 'black_win' : 'white_win';
    next.turnDeadline = 0;
    return { ok: true, state: next };
  }
  if (isBoardFull(next.board)) {
    next.status = 'draw';
    next.turnDeadline = 0;
    return { ok: true, state: next };
  }

  next.turn = seat === 0 ? 1 : 0;
  next.turnDeadline = now + TURN_MS;
  return { ok: true, state: next };
}

export function resign(state: GomokuState, seat: Seat): GomokuState {
  if (state.status !== 'playing') return state;
  return {
    ...state,
    status: seat === 0 ? 'white_win' : 'black_win',
    turnDeadline: 0,
    pendingUndo: null,
  };
}

export function applyTimeout(state: GomokuState, now = Date.now()): GomokuState {
  if (state.status !== 'playing') return state;
  if (state.pendingUndo && now >= state.pendingUndo.deadline) {
    return { ...state, pendingUndo: null };
  }
  if (!state.turnDeadline || now < state.turnDeadline) return state;
  // 当前行棋方超时判负
  return {
    ...state,
    status: state.turn === 0 ? 'white_win' : 'black_win',
    turnDeadline: 0,
    pendingUndo: null,
  };
}

export function requestUndo(
  state: GomokuState,
  fromSeat: Seat,
  now = Date.now(),
): { ok: true; state: GomokuState } | { ok: false; error: string } {
  if (state.status !== 'playing') return { ok: false, error: '对局已结束' };
  if (state.pendingUndo) return { ok: false, error: '已有悔棋请求进行中' };
  if (!state.moves.length) return { ok: false, error: '还没有可悔的棋' };
  // 只能悔自己刚下的一手：上一手必须是自己
  const last = state.moves[state.moves.length - 1]!;
  if (last.seat !== fromSeat) return { ok: false, error: '只能悔自己刚下的一手' };
  // 悔棋后应轮到自己，即当前 turn 是对手
  if (state.turn === fromSeat) return { ok: false, error: '当前不需要悔棋' };

  return {
    ok: true,
    state: {
      ...state,
      pendingUndo: { fromSeat, deadline: now + UNDO_RESPOND_MS },
    },
  };
}

export function respondUndo(
  state: GomokuState,
  responder: Seat,
  accept: boolean,
  now = Date.now(),
): { ok: true; state: GomokuState } | { ok: false; error: string } {
  if (!state.pendingUndo) return { ok: false, error: '没有悔棋请求' };
  if (responder === state.pendingUndo.fromSeat) return { ok: false, error: '不能回应自己的请求' };
  if (now >= state.pendingUndo.deadline) {
    return { ok: true, state: { ...state, pendingUndo: null } };
  }
  if (!accept) {
    return { ok: true, state: { ...state, pendingUndo: null } };
  }

  const moves = state.moves.slice(0, -1);
  const last = state.moves[state.moves.length - 1]!;
  const board = state.board.map((row) => row.slice());
  board[last.r]![last.c] = 0;

  return {
    ok: true,
    state: {
      board,
      moves,
      turn: last.seat,
      status: 'playing',
      turnDeadline: now + TURN_MS,
      pendingUndo: null,
    },
  };
}

/** 简单人机：优先堵/冲四附近，否则随机靠中心 */
export function chooseAiMove(state: GomokuState, aiSeat: Seat): { r: number; c: number } | null {
  if (state.status !== 'playing' || state.turn !== aiSeat) return null;
  const empties: Array<{ r: number; c: number; score: number }> = [];
  const my = seatStone(aiSeat);
  const opp = seatStone(aiSeat === 0 ? 1 : 0);

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      if (state.board[r]![c] !== 0) continue;
      let score = 1;
      // 靠近已有子
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          if (!dr && !dc) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          if (state.board[nr]![nc] !== 0) score += 3;
        }
      }
      // 模拟自己落子能否赢
      const trial = state.board.map((row) => row.slice());
      trial[r]![c] = my;
      if (checkWin(trial, r, c, my)) score += 10_000;
      trial[r]![c] = opp;
      if (checkWin(trial, r, c, opp)) score += 5_000;
      // 偏中心
      score += 8 - Math.abs(r - 7) - Math.abs(c - 7);
      empties.push({ r, c, score });
    }
  }
  if (!empties.length) return null;
  empties.sort((a, b) => b.score - a.score);
  const top = empties.slice(0, Math.min(5, empties.length));
  return top[Math.floor(Math.random() * top.length)]!;
}

export function statusLabel(status: GameStatus): string {
  switch (status) {
    case 'playing':
      return '对局中';
    case 'black_win':
      return '黑方胜';
    case 'white_win':
      return '白方胜';
    case 'draw':
      return '和棋';
    default:
      return '';
  }
}
