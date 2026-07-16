/** 斗地主局内状态机 */

import {
  type Card,
  cardsByIds,
  dealCards,
  removeCards,
  sortCards,
} from './cards';
import { analyzePattern, canBeat, type Pattern } from './patterns';
import {
  applyDelta,
  computeDisplayMultiplier,
  computeScoreDelta,
  INITIAL_SCORE,
  type DoubleFactors,
  type ScoreDelta,
} from './score';

export type Phase = 'bidding' | 'doubling' | 'playing' | 'settled' | 'redeal';

/** 叫抢子阶段：先叫地主 → 再抢地主 → 地主选分 */
export type BidPhase = 'call' | 'grab' | 'score';

export type Seat = 0 | 1 | 2;

/**
 * 协议动作：
 * - call：0=不叫，1=叫地主
 * - grab：0=不抢，1=抢地主
 * - score：1|2|3=选分
 */
export type BidAction = 0 | 1 | 2 | 3;

/**
 * 座位叫抢展示记录：
 * -1 未表态 · 0 不叫 · 1 叫地主 · 2 不抢 · 3 抢地主
 */
export type BidRecord = -1 | 0 | 1 | 2 | 3;

/**
 * 加倍动作 / 展示：
 * -1 未表态 · 0 不加倍 · 1 加倍(×2) · 2 超级加倍(×4)
 */
export type DoubleAction = 0 | 1 | 2;
export type DoubleRecord = -1 | 0 | 1 | 2;

export type PublicTrick = {
  seat: Seat;
  cards: Card[];
  pass: boolean;
};

export type GameState = {
  phase: Phase;
  hands: [Card[], Card[], Card[]];
  bottom: Card[];
  /** 底牌是否已公开给地主 */
  bottomRevealed: boolean;
  scores: ScoreDelta;
  landlord: Seat | null;
  bidScore: number;
  /** 当前叫分轮到谁 */
  turn: Seat;
  /** 叫抢起始座位 */
  bidStart: Seat;
  /** 叫抢子阶段 */
  bidPhase: BidPhase;
  /** 每人叫抢记录，-1 未表态 */
  bids: [BidRecord, BidRecord, BidRecord];
  /** 当前地主候选人（叫/最后抢的人） */
  highestBidder: Seat | null;
  /** 抢地主阶段待表态座位（按顺序） */
  grabQueue: Seat[];
  /** 连续不叫计数（三人都不叫则重发） */
  passBidCount: number;
  /** 每人加倍系数 1/2/4 */
  doubles: DoubleFactors;
  /** 每人加倍展示记录 */
  doubleRecords: [DoubleRecord, DoubleRecord, DoubleRecord];
  /** 加倍阶段待表态座位（农民先、地主后） */
  doubleQueue: Seat[];
  /** 上一手有效出牌 */
  lastPattern: Pattern | null;
  lastPlaySeat: Seat | null;
  /** 本轮连续 pass（两人 pass 后清桌） */
  passCount: number;
  trickHistory: PublicTrick[];
  bombCount: number;
  /** 地主出过牌后农民是否出过（春天判定） */
  landlordPlayed: boolean;
  farmersPlayed: boolean;
  /** 本局是否有人出过非地主牌（反春天：农民一张未出） */
  winner: Seat | null;
  lastDelta: ScoreDelta | null;
  message: string;
};

export type ClientView = {
  phase: Phase;
  mySeat: Seat;
  hand: Card[];
  handCounts: [number, number, number];
  bottom: Card[] | null;
  scores: ScoreDelta;
  landlord: Seat | null;
  bidScore: number;
  bidPhase: BidPhase;
  turn: Seat;
  bids: [BidRecord, BidRecord, BidRecord];
  doubles: DoubleFactors;
  doubleRecords: [DoubleRecord, DoubleRecord, DoubleRecord];
  /** 当前总倍数（叫分×炸弹×加倍积） */
  multiplier: number;
  lastPatternCards: Card[] | null;
  lastPlaySeat: Seat | null;
  passCount: number;
  bombCount: number;
  winner: Seat | null;
  lastDelta: ScoreDelta | null;
  message: string;
  trickHistory: PublicTrick[];
};

/** UI / 语音：叫抢记录文案 */
export function bidRecordLabel(record: number): string {
  if (record === 0) return '不叫';
  if (record === 1) return '叫地主';
  if (record === 2) return '不抢';
  if (record === 3) return '抢地主';
  return '';
}

/** UI / 语音：加倍记录文案 */
export function doubleRecordLabel(record: number): string {
  if (record === 0) return '不加倍';
  if (record === 1) return '加倍';
  if (record === 2) return '超级加倍';
  return '';
}

export function doubleFactorFromAction(action: DoubleAction): number {
  if (action === 1) return 2;
  if (action === 2) return 4;
  return 1;
}

function rngDefault() {
  return Math.random();
}

export function createInitialScores(): ScoreDelta {
  return [INITIAL_SCORE, INITIAL_SCORE, INITIAL_SCORE];
}

export function createNewRound(scores: ScoreDelta, bidStart: Seat = 0, rng: () => number = rngDefault): GameState {
  const dealt = dealCards(rng);
  return {
    phase: 'bidding',
    hands: dealt.hands,
    bottom: dealt.bottom,
    bottomRevealed: false,
    scores,
    landlord: null,
    bidScore: 0,
    turn: bidStart,
    bidStart,
    bidPhase: 'call',
    bids: [-1, -1, -1],
    highestBidder: null,
    grabQueue: [],
    passBidCount: 0,
    doubles: [1, 1, 1],
    doubleRecords: [-1, -1, -1],
    doubleQueue: [],
    lastPattern: null,
    lastPlaySeat: null,
    passCount: 0,
    trickHistory: [],
    bombCount: 0,
    landlordPlayed: false,
    farmersPlayed: false,
    winner: null,
    lastDelta: null,
    message: `座位 ${bidStart + 1} 开始叫地主`,
  };
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat;
}

/** 选分后：发底牌 → 进入加倍（农民先、地主后） */
function enterDoublingPhase(state: GameState, landlordSeat: Seat): GameState {
  const hands = state.hands.map((h) => [...h]) as [Card[], Card[], Card[]];
  hands[landlordSeat] = sortCards([...hands[landlordSeat], ...state.bottom]);
  const farmerA = nextSeat(landlordSeat);
  const farmerB = nextSeat(farmerA);
  const doubleQueue: Seat[] = [farmerA, farmerB, landlordSeat];
  return {
    ...state,
    phase: 'doubling',
    hands,
    landlord: landlordSeat,
    bottomRevealed: true,
    doubles: [1, 1, 1],
    doubleRecords: [-1, -1, -1],
    doubleQueue,
    turn: farmerA,
    lastPattern: null,
    lastPlaySeat: null,
    passCount: 0,
    message: `座位 ${landlordSeat + 1} 成为地主，加倍阶段：座位 ${farmerA + 1} 请选择`,
  };
}

function enterPlayingPhase(state: GameState): GameState {
  const landlord = state.landlord!;
  return {
    ...state,
    phase: 'playing',
    turn: landlord,
    lastPattern: null,
    lastPlaySeat: null,
    passCount: 0,
    message: `加倍结束，座位 ${landlord + 1}（地主）先出牌`,
  };
}

function enterScorePhase(state: GameState, landlordSeat: Seat, bids: [BidRecord, BidRecord, BidRecord]): GameState {
  return {
    ...state,
    bids,
    bidPhase: 'score',
    highestBidder: landlordSeat,
    grabQueue: [],
    turn: landlordSeat,
    message: `座位 ${landlordSeat + 1} 成为地主，请选择分数`,
  };
}

export function applyBid(state: GameState, seat: Seat, bid: BidAction): GameState {
  if (state.phase !== 'bidding') return { ...state, message: '当前不是叫抢阶段' };
  if (state.turn !== seat) return { ...state, message: '还没轮到你' };

  const bidPhase = state.bidPhase ?? 'call';

  // —— 选分：仅地主候选人可选 1/2/3 ——
  if (bidPhase === 'score') {
    if (seat !== state.highestBidder) return { ...state, message: '只有地主可以选分' };
    if (bid < 1 || bid > 3) return { ...state, message: '请选择 1 / 2 / 3 分' };
    return enterDoublingPhase(
      {
        ...state,
        bidScore: bid,
        message: `座位 ${seat + 1} 选 ${bid} 分`,
      },
      seat,
    );
  }

  // —— 叫地主 ——
  if (bidPhase === 'call') {
    if (bid !== 0 && bid !== 1) return { ...state, message: '请选择叫地主或不叫' };

    const bids = [...state.bids] as [BidRecord, BidRecord, BidRecord];
    bids[seat] = bid === 0 ? 0 : 1;

    if (bid === 1) {
      // 有人叫：进入抢地主，后续两家按座位顺序表态
      const grabQueue: Seat[] = [nextSeat(seat), nextSeat(nextSeat(seat))];
      return {
        ...state,
        bids,
        bidPhase: 'grab',
        highestBidder: seat,
        grabQueue,
        passBidCount: 0,
        turn: grabQueue[0]!,
        message: `座位 ${seat + 1} 叫地主`,
      };
    }

    const passBidCount = state.passBidCount + 1;
    const allPassed = bids.every((b) => b === 0);
    if (allPassed) {
      return {
        ...state,
        phase: 'redeal',
        bids,
        bidScore: 0,
        passBidCount,
        highestBidder: null,
        grabQueue: [],
        message: '无人叫地主，重新发牌',
      };
    }

    return {
      ...state,
      bids,
      passBidCount,
      turn: nextSeat(seat),
      message: `座位 ${seat + 1} 不叫`,
    };
  }

  // —— 抢地主 ——
  if (bid !== 0 && bid !== 1) return { ...state, message: '请选择抢地主或不抢' };

  const bids = [...state.bids] as [BidRecord, BidRecord, BidRecord];
  bids[seat] = bid === 0 ? 2 : 3;

  let highestBidder = state.highestBidder;
  if (bid === 1) highestBidder = seat;

  const grabQueue = state.grabQueue.filter((s) => s !== seat);
  if (grabQueue.length === 0) {
    const landlordSeat = highestBidder ?? seat;
    return enterScorePhase({ ...state, highestBidder: landlordSeat }, landlordSeat, bids);
  }

  return {
    ...state,
    bids,
    highestBidder,
    grabQueue,
    turn: grabQueue[0]!,
    message: bid === 0 ? `座位 ${seat + 1} 不抢` : `座位 ${seat + 1} 抢地主`,
  };
}

export function applyDouble(state: GameState, seat: Seat, action: DoubleAction): GameState {
  if (state.phase !== 'doubling') return { ...state, message: '当前不是加倍阶段' };
  if (state.turn !== seat) return { ...state, message: '还没轮到你加倍' };
  if (action !== 0 && action !== 1 && action !== 2) {
    return { ...state, message: '请选择不加倍 / 加倍 / 超级加倍' };
  }

  const doubles = [...(state.doubles ?? [1, 1, 1])] as DoubleFactors;
  const doubleRecords = [...(state.doubleRecords ?? [-1, -1, -1])] as [
    DoubleRecord,
    DoubleRecord,
    DoubleRecord,
  ];
  doubles[seat] = doubleFactorFromAction(action);
  doubleRecords[seat] = action;

  const label = doubleRecordLabel(action);
  const doubleQueue = (state.doubleQueue ?? []).filter((s) => s !== seat);

  if (doubleQueue.length === 0) {
    return enterPlayingPhase({
      ...state,
      doubles,
      doubleRecords,
      doubleQueue: [],
      message: `座位 ${seat + 1} ${label}`,
    });
  }

  return {
    ...state,
    doubles,
    doubleRecords,
    doubleQueue,
    turn: doubleQueue[0]!,
    message: `座位 ${seat + 1} ${label}，下一位座位 ${doubleQueue[0]! + 1}`,
  };
}

export function applyPlay(state: GameState, seat: Seat, cardIds: string[]): GameState {
  if (state.phase !== 'playing') return { ...state, message: '当前不是出牌阶段' };
  if (state.turn !== seat) return { ...state, message: '还没轮到你出牌' };

  const cards = cardsByIds(state.hands[seat], cardIds);
  if (!cards || cards.length === 0) return { ...state, message: '选牌无效' };

  const pattern = analyzePattern(cards);
  if (!pattern) return { ...state, message: '不是合法牌型' };
  if (!canBeat(pattern, state.lastPattern)) {
    return { ...state, message: '压不住上家的牌' };
  }

  const hands = state.hands.map((h, i) => (i === seat ? removeCards(h, cards) : [...h])) as [
    Card[],
    Card[],
    Card[],
  ];

  let bombCount = state.bombCount;
  if (pattern.kind === 'bomb' || pattern.kind === 'rocket') bombCount += 1;

  let landlordPlayed = state.landlordPlayed;
  let farmersPlayed = state.farmersPlayed;
  if (state.landlord !== null) {
    if (seat === state.landlord) landlordPlayed = true;
    else farmersPlayed = true;
  }

  const trickHistory = [...state.trickHistory, { seat, cards, pass: false }];

  // 获胜
  if (hands[seat].length === 0) {
    const landlord = state.landlord!;
    const landlordWin = seat === landlord;
    const landlordPlayCount =
      trickHistory.filter((t) => !t.pass && t.seat === landlord).length;
    const spring = landlordWin && !farmersPlayed;
    const antiSpring = !landlordWin && landlordPlayCount <= 1;

    const delta = computeScoreDelta({
      landlord,
      bidScore: Math.max(1, state.bidScore),
      bombCount,
      spring: spring || antiSpring,
      landlordWin,
      doubles: state.doubles ?? [1, 1, 1],
    });

    return {
      ...state,
      phase: 'settled',
      hands,
      bombCount,
      landlordPlayed,
      farmersPlayed,
      lastPattern: pattern,
      lastPlaySeat: seat,
      passCount: 0,
      trickHistory,
      winner: seat,
      lastDelta: delta,
      scores: applyDelta(state.scores, delta),
      turn: seat,
      message: landlordWin
        ? `地主获胜！${spring ? '春天！' : ''}积分结算`
        : `农民获胜！${antiSpring ? '反春天！' : ''}积分结算`,
    };
  }

  return {
    ...state,
    hands,
    bombCount,
    landlordPlayed,
    farmersPlayed,
    lastPattern: pattern,
    lastPlaySeat: seat,
    passCount: 0,
    trickHistory,
    turn: nextSeat(seat),
    message: `座位 ${seat + 1} 出牌`,
  };
}

export function applyPass(state: GameState, seat: Seat): GameState {
  if (state.phase !== 'playing') return { ...state, message: '当前不是出牌阶段' };
  if (state.turn !== seat) return { ...state, message: '还没轮到你' };
  if (!state.lastPattern) return { ...state, message: '首家必须出牌' };

  const passCount = state.passCount + 1;
  const trickHistory = [...state.trickHistory, { seat, cards: [], pass: true }];

  // 两家都 pass，回到最后出牌者，清桌自由出
  if (passCount >= 2) {
    return {
      ...state,
      passCount: 0,
      lastPattern: null,
      turn: state.lastPlaySeat!,
      trickHistory,
      message: '无人要得起，重新出牌',
    };
  }

  return {
    ...state,
    passCount,
    turn: nextSeat(seat),
    trickHistory,
    message: `座位 ${seat + 1} 不出`,
  };
}

export function toClientView(state: GameState, mySeat: Seat): ClientView {
  const doubles = state.doubles ?? [1, 1, 1];
  const doubleRecords = state.doubleRecords ?? [-1, -1, -1];
  return {
    phase: state.phase,
    mySeat,
    hand: state.hands[mySeat],
    handCounts: [state.hands[0].length, state.hands[1].length, state.hands[2].length],
    bottom: state.bottomRevealed || state.phase === 'settled' ? state.bottom : null,
    scores: state.scores,
    landlord: state.landlord,
    bidScore: state.bidScore,
    bidPhase: state.bidPhase ?? 'call',
    turn: state.turn,
    bids: state.bids,
    doubles,
    doubleRecords,
    multiplier: computeDisplayMultiplier({
      bidScore: state.bidScore,
      bombCount: state.bombCount,
      doubles,
    }),
    lastPatternCards: state.lastPattern?.cards ?? null,
    lastPlaySeat: state.lastPlaySeat,
    passCount: state.passCount,
    bombCount: state.bombCount,
    winner: state.winner,
    lastDelta: state.lastDelta,
    message: state.message,
    trickHistory: state.trickHistory.slice(-12),
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(raw: string): GameState {
  return JSON.parse(raw) as GameState;
}
