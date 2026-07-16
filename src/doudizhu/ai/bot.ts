/** 多档斗地主 AI */

import type { Card } from '../engine/cards';
import { sortCards } from '../engine/cards';
import type { DoubleAction, GameState, Seat } from '../engine/game';
import { analyzePattern, canBeat, type Pattern } from '../engine/patterns';

export type AiDifficulty = 'easy' | 'normal' | 'hard';

export type AiAction =
  | { type: 'bid'; bid: 0 | 1 | 2 | 3 }
  | { type: 'double'; action: DoubleAction }
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' };

function countWeight(hand: Card[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of hand) m.set(c.weight, (m.get(c.weight) ?? 0) + 1);
  return m;
}

function handStrength(hand: Card[]): number {
  const counts = countWeight(hand);
  let score = 0;
  if ((counts.get(16) ?? 0) && (counts.get(17) ?? 0)) score += 8;
  for (const [w, n] of counts) {
    if (n === 4) score += 5;
    if (w >= 15) score += n * 1.5;
    if (w >= 13) score += n * 0.5;
  }
  return score;
}

/** 生成跟牌或自由出牌候选（由小到大） */
export function listLegalPlays(hand: Card[], prev: Pattern | null): Card[][] {
  const results: Card[][] = [];
  const n = hand.length;
  if (n === 0) return results;

  // 枚举子集对中小牌局可行：17 张子集爆炸，改为按牌型构造
  const byW = new Map<number, Card[]>();
  for (const c of sortCards(hand)) {
    const list = byW.get(c.weight) ?? [];
    list.push(c);
    byW.set(c.weight, list);
  }
  const weights = [...byW.keys()].sort((a, b) => a - b);

  const pushIf = (cards: Card[]) => {
    const p = analyzePattern(cards);
    if (p && canBeat(p, prev)) results.push(cards);
  };

  // 单
  for (const w of weights) {
    pushIf([byW.get(w)![0]!]);
  }
  // 对
  for (const w of weights) {
    const g = byW.get(w)!;
    if (g.length >= 2) pushIf(g.slice(0, 2));
  }
  // 三 / 三带一 / 三带对
  for (const w of weights) {
    const g = byW.get(w)!;
    if (g.length >= 3) {
      pushIf(g.slice(0, 3));
      for (const ow of weights) {
        if (ow === w) continue;
        const og = byW.get(ow)!;
        if (og.length >= 1) pushIf([...g.slice(0, 3), og[0]!]);
        if (og.length >= 2) pushIf([...g.slice(0, 3), ...og.slice(0, 2)]);
      }
    }
  }
  // 炸弹
  for (const w of weights) {
    const g = byW.get(w)!;
    if (g.length >= 4) pushIf(g.slice(0, 4));
  }
  // 王炸
  if ((byW.get(16)?.length ?? 0) >= 1 && (byW.get(17)?.length ?? 0) >= 1) {
    pushIf([byW.get(16)![0]!, byW.get(17)![0]!]);
  }

  // 顺子 5-12
  const singleWeights = weights.filter((w) => w < 15);
  for (let len = 5; len <= Math.min(12, singleWeights.length); len += 1) {
    for (let i = 0; i + len <= singleWeights.length; i += 1) {
      const slice = singleWeights.slice(i, i + len);
      if (slice.every((w, idx) => idx === 0 || w === slice[idx - 1]! + 1)) {
        const cards = slice.map((w) => byW.get(w)![0]!);
        pushIf(cards);
      }
    }
  }

  // 连对 3+
  const pairWeights = weights.filter((w) => w < 15 && (byW.get(w)?.length ?? 0) >= 2);
  for (let len = 3; len <= pairWeights.length; len += 1) {
    for (let i = 0; i + len <= pairWeights.length; i += 1) {
      const slice = pairWeights.slice(i, i + len);
      if (slice.every((w, idx) => idx === 0 || w === slice[idx - 1]! + 1)) {
        const cards = slice.flatMap((w) => byW.get(w)!.slice(0, 2));
        pushIf(cards);
      }
    }
  }

  // 飞机（不带 / 带单简易）
  const tripleWeights = weights.filter((w) => w < 15 && (byW.get(w)?.length ?? 0) >= 3);
  for (let len = 2; len <= tripleWeights.length; len += 1) {
    for (let i = 0; i + len <= tripleWeights.length; i += 1) {
      const slice = tripleWeights.slice(i, i + len);
      if (!slice.every((w, idx) => idx === 0 || w === slice[idx - 1]! + 1)) continue;
      const body = slice.flatMap((w) => byW.get(w)!.slice(0, 3));
      pushIf(body);
      // 带单
      const wingPool = hand.filter((c) => !slice.includes(c.weight) || (byW.get(c.weight)?.length ?? 0) > 3);
      if (wingPool.length >= len) {
        pushIf([...body, ...sortCards(wingPool).slice(0, len)]);
      }
    }
  }

  // 去重
  const seen = new Set<string>();
  const unique: Card[][] = [];
  for (const play of results) {
    const key = play
      .map((c) => c.id)
      .sort()
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(play);
  }

  // 自由出牌时限制为“较小”的候选，避免爆炸
  unique.sort((a, b) => {
    const pa = analyzePattern(a)!;
    const pb = analyzePattern(b)!;
    const bombA = pa.kind === 'bomb' || pa.kind === 'rocket' ? 1 : 0;
    const bombB = pb.kind === 'bomb' || pb.kind === 'rocket' ? 1 : 0;
    if (bombA !== bombB) return bombA - bombB;
    if (a.length !== b.length) return b.length - a.length;
    return pa.weight - pb.weight;
  });

  return unique;
}

export function chooseBid(state: GameState, seat: Seat, difficulty: AiDifficulty): AiAction {
  const strength = handStrength(state.hands[seat]);
  const phase = state.bidPhase ?? 'call';

  if (phase === 'call') {
    let call = false;
    if (difficulty === 'easy') call = strength >= 12;
    else if (difficulty === 'normal') call = strength >= 9;
    else call = strength >= 7;
    return { type: 'bid', bid: call ? 1 : 0 };
  }

  if (phase === 'grab') {
    let grab = false;
    if (difficulty === 'easy') grab = strength >= 14;
    else if (difficulty === 'normal') grab = strength >= 11;
    else grab = strength >= 9;
    return { type: 'bid', bid: grab ? 1 : 0 };
  }

  // 选分
  let target: 1 | 2 | 3 = 1;
  if (difficulty === 'easy') {
    if (strength >= 12) target = 2;
  } else if (difficulty === 'normal') {
    if (strength >= 10) target = 2;
    if (strength >= 15) target = 3;
  } else {
    if (strength >= 8) target = 2;
    if (strength >= 13) target = 3;
  }
  return { type: 'bid', bid: target };
}

/** 加倍：手牌强则加倍/超加；地主更敢超加 */
export function chooseDouble(state: GameState, seat: Seat, difficulty: AiDifficulty): AiAction {
  const strength = handStrength(state.hands[seat]);
  const isLandlord = state.landlord === seat;
  let action: DoubleAction = 0;

  if (difficulty === 'easy') {
    if (strength >= 14) action = 1;
    else if (strength >= 11 && Math.random() < 0.35) action = 1;
  } else if (difficulty === 'normal') {
    if (strength >= 16) action = isLandlord ? 2 : 1;
    else if (strength >= 12) action = 1;
    else if (strength >= 9 && Math.random() < 0.4) action = 1;
  } else {
    if (strength >= 14) action = 2;
    else if (strength >= 11) action = 1;
    else if (strength >= 8 && Math.random() < 0.45) action = 1;
    if (isLandlord && strength >= 12 && action === 1 && Math.random() < 0.5) action = 2;
  }

  return { type: 'double', action };
}

export function choosePlay(state: GameState, seat: Seat, difficulty: AiDifficulty): AiAction {
  const hand = state.hands[seat];
  const prev = state.lastPattern;
  const plays = listLegalPlays(hand, prev);

  if (!plays.length) {
    if (prev) return { type: 'pass' };
    // 必须出：出最小单张
    const smallest = sortCards(hand)[0]!;
    return { type: 'play', cardIds: [smallest.id] };
  }

  const nonBombs = plays.filter((p) => {
    const kind = analyzePattern(p)!.kind;
    return kind !== 'bomb' && kind !== 'rocket';
  });
  const bombs = plays.filter((p) => {
    const kind = analyzePattern(p)!.kind;
    return kind === 'bomb' || kind === 'rocket';
  });

  const pick = (list: Card[][]) => list[0]!;

  if (difficulty === 'easy') {
    if (prev && Math.random() < 0.25 && nonBombs.length) {
      // 有时故意过（仅跟牌时）
      if (Math.random() < 0.15) return { type: 'pass' };
    }
    const pool = nonBombs.length ? nonBombs : bombs;
    return { type: 'play', cardIds: pick(pool).map((c) => c.id) };
  }

  if (difficulty === 'normal') {
    if (prev && nonBombs.length === 0) {
      // 只剩炸弹：手牌少或对手可能走时才炸
      if (hand.length > 8 && Math.random() < 0.6) return { type: 'pass' };
    }
    if (!prev) {
      // 自由出：优先较长非炸弹
      const long = [...nonBombs].sort((a, b) => b.length - a.length);
      return { type: 'play', cardIds: pick(long.length ? long : plays).map((c) => c.id) };
    }
    return { type: 'play', cardIds: pick(nonBombs.length ? nonBombs : bombs).map((c) => c.id) };
  }

  // hard
  const landlord = state.landlord;
  const isFarmer = landlord !== null && seat !== landlord;
  const teammate = isFarmer ? (([0, 1, 2] as Seat[]).find((s) => s !== seat && s !== landlord) as Seat) : null;

  if (prev && nonBombs.length === 0) {
    const enemyHand =
      landlord === seat
        ? Math.min(state.hands[next(seat)].length, state.hands[next(next(seat))].length)
        : state.hands[landlord!].length;
    if (enemyHand > 2 && hand.length > 6) return { type: 'pass' };
  }

  // 农民：若上家是队友且出的不大，偶而过牌
  if (prev && isFarmer && state.lastPlaySeat === teammate && prev.weight < 14 && nonBombs.length) {
    if (Math.random() < 0.45) return { type: 'pass' };
  }

  if (!prev) {
    const long = [...(nonBombs.length ? nonBombs : plays)].sort((a, b) => b.length - a.length || analyzePattern(a)!.weight - analyzePattern(b)!.weight);
    return { type: 'play', cardIds: pick(long).map((c) => c.id) };
  }

  return { type: 'play', cardIds: pick(nonBombs.length ? nonBombs : bombs).map((c) => c.id) };
}

function next(seat: Seat): Seat {
  return ((seat + 1) % 3) as Seat;
}

export function chooseAction(state: GameState, seat: Seat, difficulty: AiDifficulty): AiAction {
  if (state.phase === 'bidding') return chooseBid(state, seat, difficulty);
  if (state.phase === 'doubling') return chooseDouble(state, seat, difficulty);
  if (state.phase === 'playing') return choosePlay(state, seat, difficulty);
  return { type: 'pass' };
}
