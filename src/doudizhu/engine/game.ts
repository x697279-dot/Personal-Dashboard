/** 斗地主局内状态机 */

import {
  type Card,
  cardsByIds,
  dealCards,
  removeCards,
  sortCards,
} from './cards';
import { analyzePattern, canBeat, type Pattern } from './patterns';
import { applyDelta, computeScoreDelta, INITIAL_SCORE, type ScoreDelta } from './score';

export type Phase = 'bidding' | 'playing' | 'settled' | 'redeal';

export type Seat = 0 | 1 | 2;

export type BidAction = 0 | 1 | 2 | 3; // 0=不叫

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
  /** 每人叫分记录，-1 未表态 */
  bids: [number, number, number];
  /** 叫抢轮次中最高分座位 */
  highestBidder: Seat | null;
  /** 连续不叫计数（三人都不叫则重发） */
  passBidCount: number;
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
  turn: Seat;
  bids: [number, number, number];
  lastPatternCards: Card[] | null;
  lastPlaySeat: Seat | null;
  passCount: number;
  bombCount: number;
  winner: Seat | null;
  lastDelta: ScoreDelta | null;
  message: string;
  trickHistory: PublicTrick[];
};

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
    bids: [-1, -1, -1],
    highestBidder: null,
    passBidCount: 0,
    lastPattern: null,
    lastPlaySeat: null,
    passCount: 0,
    trickHistory: [],
    bombCount: 0,
    landlordPlayed: false,
    farmersPlayed: false,
    winner: null,
    lastDelta: null,
    message: `座位 ${bidStart + 1} 开始叫分`,
  };
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat;
}

function assignLandlord(state: GameState, seat: Seat): GameState {
  const hands = state.hands.map((h) => [...h]) as [Card[], Card[], Card[]];
  hands[seat] = sortCards([...hands[seat], ...state.bottom]);
  return {
    ...state,
    phase: 'playing',
    hands,
    landlord: seat,
    bottomRevealed: true,
    turn: seat,
    lastPattern: null,
    lastPlaySeat: null,
    passCount: 0,
    message: `座位 ${seat + 1} 成为地主，出牌`,
  };
}

export function applyBid(state: GameState, seat: Seat, bid: BidAction): GameState {
  if (state.phase !== 'bidding') return { ...state, message: '当前不是叫分阶段' };
  if (state.turn !== seat) return { ...state, message: '还没轮到你叫分' };
  if (bid !== 0 && bid <= state.bidScore) {
    return { ...state, message: `必须高于当前 ${state.bidScore} 分，或不叫` };
  }

  const bids = [...state.bids] as [number, number, number];
  bids[seat] = bid;

  let bidScore = state.bidScore;
  let highestBidder = state.highestBidder;
  let passBidCount = state.passBidCount;

  if (bid === 0) {
    passBidCount += 1;
  } else {
    bidScore = bid;
    highestBidder = seat;
    passBidCount = 0;
  }

  // 叫 3 分直接当地主
  if (bid === 3) {
    return assignLandlord({ ...state, bids, bidScore, highestBidder, passBidCount }, seat);
  }

  // 三人都不叫（本轮所有人都表态且最高仍为 0）
  const allSpoke = bids.every((b) => b !== -1);
  if (allSpoke && highestBidder === null) {
    return {
      ...state,
      phase: 'redeal',
      bids,
      bidScore: 0,
      passBidCount,
      message: '无人叫分，重新发牌',
    };
  }

  // 若已有人叫过分，且其余两人都“不叫/已表态且不高于”，结束叫抢
  // 简化经典：每人最多表态一次（叫或不叫），三人轮完后最高分者当地主
  if (allSpoke && highestBidder !== null) {
    return assignLandlord({ ...state, bids, bidScore, highestBidder, passBidCount }, highestBidder);
  }

  const turn = nextSeat(seat);
  return {
    ...state,
    bids,
    bidScore,
    highestBidder,
    passBidCount,
    turn,
    message: bid === 0 ? `座位 ${seat + 1} 不叫` : `座位 ${seat + 1} 叫 ${bid} 分`,
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
  return {
    phase: state.phase,
    mySeat,
    hand: state.hands[mySeat],
    handCounts: [state.hands[0].length, state.hands[1].length, state.hands[2].length],
    bottom: state.bottomRevealed || state.phase === 'settled' ? state.bottom : null,
    scores: state.scores,
    landlord: state.landlord,
    bidScore: state.bidScore,
    turn: state.turn,
    bids: state.bids,
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
