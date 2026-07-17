/** 飞行棋轻量版：2～4 人，经典环道 52 格，每人 4 架 */

export type Seat = 0 | 1 | 2 | 3;
export type PlayerCount = 2 | 3 | 4;
/** 起飞点数：2/4/6 · 5/6 · 仅 6 */
export type TakeoffMode = '246' | '56' | '6';

export const RING = 52;
export const HOME_LEN = 6;
export const PIECES_PER = 4;
export const PER_SIDE = RING / 4; // 13
/**
 * 各色起飞格（自家门口）：
 * 红左上→顶边靠左 · 黄右上→右边靠上 · 蓝右下→底边靠右 · 绿左下→左边靠下
 */
export const ENTRY: readonly number[] = [1, 14, 27, 40];
export const COLOR_NAMES = ['红', '黄', '蓝', '绿'] as const;
export const COLOR_KEYS = ['red', 'yellow', 'blue', 'green'] as const;

export const TAKEOFF_LABELS: Record<TakeoffMode, string> = {
  '246': '2,4,6',
  '56': '5,6',
  '6': '6',
};

export type Piece =
  | { z: 'base' }
  | { z: 'ring'; dist: number }
  | { z: 'home'; dist: number }
  | { z: 'done' };

export type Phase = 'roll' | 'move' | 'finished';

export type FlyingState = {
  playerCount: PlayerCount;
  takeoffMode: TakeoffMode;
  turn: Seat;
  phase: Phase;
  dice: number | null;
  pieces: Piece[][];
  winner: Seat | null;
  log: string;
};

export type PublicView = {
  playerCount: PlayerCount;
  takeoffMode: TakeoffMode;
  turn: Seat;
  phase: Phase;
  dice: number | null;
  pieces: Piece[][];
  winner: Seat | null;
  log: string;
  legalMoves: number[];
};

export function seatsOf(count: PlayerCount): Seat[] {
  return Array.from({ length: count }, (_, i) => i as Seat);
}

export function canTakeoff(dice: number, mode: TakeoffMode): boolean {
  if (mode === '6') return dice === 6;
  if (mode === '56') return dice === 5 || dice === 6;
  return dice === 2 || dice === 4 || dice === 6;
}

export function ringCell(seat: Seat, dist: number): number {
  return (ENTRY[seat]! + dist) % RING;
}

function emptyPieces(count: PlayerCount): Piece[][] {
  return seatsOf(count).map(() =>
    Array.from({ length: PIECES_PER }, () => ({ z: 'base' as const })),
  );
}

export function createGame(
  playerCount: PlayerCount = 4,
  takeoffMode: TakeoffMode = '246',
): FlyingState {
  return {
    playerCount,
    takeoffMode,
    turn: 0,
    phase: 'roll',
    dice: null,
    pieces: emptyPieces(playerCount),
    winner: null,
    log: `${COLOR_NAMES[0]}方先手 · 起飞点数 ${TAKEOFF_LABELS[takeoffMode]}`,
  };
}

export function toPublicView(state: FlyingState): PublicView {
  return {
    playerCount: state.playerCount,
    takeoffMode: state.takeoffMode,
    turn: state.turn,
    phase: state.phase,
    dice: state.dice,
    pieces: state.pieces.map((row) => row.map((p) => ({ ...p }))),
    winner: state.winner,
    log: state.log,
    legalMoves: listLegalMoves(state),
  };
}

function clone(state: FlyingState): FlyingState {
  return {
    ...state,
    pieces: state.pieces.map((row) => row.map((p) => ({ ...p }))),
  };
}

function nextSeat(state: FlyingState, from: Seat): Seat {
  return ((from + 1) % state.playerCount) as Seat;
}

function allDone(pieces: Piece[]): boolean {
  return pieces.every((p) => p.z === 'done');
}

function simulateMove(state: FlyingState, seat: Seat, pieceIndex: number, dice: number): FlyingState | null {
  if (state.phase !== 'move' || state.turn !== seat || state.dice !== dice) return null;
  const piece = state.pieces[seat]?.[pieceIndex];
  if (!piece) return null;

  const next = clone(state);
  const mine = next.pieces[seat]!;

  if (piece.z === 'base') {
    if (!canTakeoff(dice, state.takeoffMode)) return null;
    mine[pieceIndex] = { z: 'ring', dist: 0 };
  } else if (piece.z === 'ring') {
    const total = piece.dist + dice;
    if (total < RING) {
      mine[pieceIndex] = { z: 'ring', dist: total };
    } else {
      const homeDist = total - RING;
      if (homeDist > HOME_LEN) return null;
      if (homeDist === HOME_LEN) mine[pieceIndex] = { z: 'done' };
      else mine[pieceIndex] = { z: 'home', dist: homeDist };
    }
  } else if (piece.z === 'home') {
    const total = piece.dist + dice;
    if (total > HOME_LEN) return null;
    if (total === HOME_LEN) mine[pieceIndex] = { z: 'done' };
    else mine[pieceIndex] = { z: 'home', dist: total };
  } else {
    return null;
  }

  let captured = false;
  const moved = mine[pieceIndex]!;
  if (moved.z === 'ring') {
    const cell = ringCell(seat, moved.dist);
    for (const other of seatsOf(state.playerCount)) {
      if (other === seat) continue;
      const row = next.pieces[other]!;
      for (let i = 0; i < row.length; i += 1) {
        const op = row[i]!;
        if (op.z === 'ring' && ringCell(other, op.dist) === cell) {
          row[i] = { z: 'base' };
          captured = true;
        }
      }
    }
  }

  if (allDone(mine)) {
    next.phase = 'finished';
    next.winner = seat;
    next.dice = null;
    next.log = `${COLOR_NAMES[seat]}方胜利！全部飞机到齐`;
    return next;
  }

  const bonus = dice === 6 || captured;
  if (bonus) {
    next.phase = 'roll';
    next.dice = null;
    next.log = captured
      ? `${COLOR_NAMES[seat]}撞飞对手 · 再掷一次`
      : `${COLOR_NAMES[seat]}掷出 6 · 再掷一次`;
  } else {
    const n = nextSeat(state, seat);
    next.turn = n;
    next.phase = 'roll';
    next.dice = null;
    next.log = `轮到 ${COLOR_NAMES[n]}方掷骰`;
  }
  return next;
}

export function listLegalMoves(state: FlyingState): number[] {
  if (state.phase !== 'move' || state.dice == null) return [];
  const seat = state.turn;
  const dice = state.dice;
  const out: number[] = [];
  for (let i = 0; i < PIECES_PER; i += 1) {
    if (simulateMove(state, seat, i, dice)) out.push(i);
  }
  return out;
}

export function rollDice(
  state: FlyingState,
  seat: Seat,
  forced?: number,
): { ok: true; state: FlyingState } | { ok: false; error: string } {
  if (state.phase === 'finished') return { ok: false, error: '对局已结束' };
  if (state.phase !== 'roll') return { ok: false, error: '现在不能掷骰' };
  if (state.turn !== seat) return { ok: false, error: '还没轮到你' };

  const dice = forced ?? 1 + Math.floor(Math.random() * 6);
  const next: FlyingState = {
    ...clone(state),
    dice,
    phase: 'move',
    log: `${COLOR_NAMES[seat]}掷出 ${dice}`,
  };

  const legal = listLegalMoves(next);
  if (!legal.length) {
    if (dice === 6) {
      next.phase = 'roll';
      next.dice = null;
      next.log = `${COLOR_NAMES[seat]}掷出 6 但无法走动 · 再掷一次`;
      return { ok: true, state: next };
    }
    const n = nextSeat(state, seat);
    next.turn = n;
    next.phase = 'roll';
    next.dice = null;
    next.log = `${COLOR_NAMES[seat]}掷出 ${dice} 无法走动 · 轮到 ${COLOR_NAMES[n]}`;
    return { ok: true, state: next };
  }

  return { ok: true, state: next };
}

export function movePiece(
  state: FlyingState,
  seat: Seat,
  pieceIndex: number,
): { ok: true; state: FlyingState } | { ok: false; error: string } {
  if (state.phase !== 'move' || state.dice == null) return { ok: false, error: '请先掷骰' };
  if (state.turn !== seat) return { ok: false, error: '还没轮到你' };
  const next = simulateMove(state, seat, pieceIndex, state.dice);
  if (!next) return { ok: false, error: '这架飞机走不了' };
  return { ok: true, state: next };
}

export function chooseAiAction(
  state: FlyingState,
  seat: Seat,
): { type: 'roll' } | { type: 'move'; pieceIndex: number } | null {
  if (state.phase === 'finished' || state.turn !== seat) return null;
  if (state.phase === 'roll') return { type: 'roll' };
  const legal = listLegalMoves(state);
  if (!legal.length) return null;

  let best = legal[0]!;
  let bestScore = -1;
  for (const i of legal) {
    const sim = simulateMove(state, seat, i, state.dice!);
    if (!sim) continue;
    let score = Math.random();
    const after = sim.pieces[seat]![i]!;
    if (after.z === 'done') score += 50;
    if (after.z === 'ring' && state.pieces[seat]![i]!.z === 'base') score += 20;
    if (sim.log.includes('撞飞')) score += 30;
    if (after.z === 'home') score += 10 + after.dist;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return { type: 'move', pieceIndex: best };
}

export function statusLabel(view: Pick<PublicView, 'phase' | 'winner' | 'turn'>): string {
  if (view.phase === 'finished' && view.winner != null) {
    return `${COLOR_NAMES[view.winner]}方胜利`;
  }
  if (view.phase === 'roll') return `${COLOR_NAMES[view.turn]}方掷骰`;
  return `${COLOR_NAMES[view.turn]}方选飞机走动`;
}
