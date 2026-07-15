/** 斗地主牌型识别与比较 */

import type { Card } from './cards';

export type PatternKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple_one'
  | 'triple_pair'
  | 'straight'
  | 'pair_straight'
  | 'plane'
  | 'plane_single'
  | 'plane_pair'
  | 'four_two_single'
  | 'four_two_pair'
  | 'bomb'
  | 'rocket';

export type Pattern = {
  kind: PatternKind;
  /** 主比较权重（顺子为最大那张，飞机为最大三张等） */
  weight: number;
  /** 顺子/连对/飞机长度 */
  length: number;
  cards: Card[];
};

function countByWeight(cards: Card[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of cards) {
    map.set(c.weight, (map.get(c.weight) ?? 0) + 1);
  }
  return map;
}

function groupsOf(counts: Map<number, number>, size: number): number[] {
  return [...counts.entries()]
    .filter(([, n]) => n === size)
    .map(([w]) => w)
    .sort((a, b) => a - b);
}

function isConsecutive(weights: number[]): boolean {
  if (weights.length < 2) return true;
  for (let i = 1; i < weights.length; i += 1) {
    if (weights[i]! !== weights[i - 1]! + 1) return false;
  }
  return true;
}

/** 不能出现在顺子/连对/飞机中 */
function isStraightForbidden(w: number): boolean {
  return w >= 15; // 2 与王
}

export function analyzePattern(cards: Card[]): Pattern | null {
  const n = cards.length;
  if (n === 0) return null;
  const sorted = [...cards].sort((a, b) => a.weight - b.weight);
  const counts = countByWeight(sorted);
  const weights = [...counts.keys()].sort((a, b) => a - b);

  // 王炸
  if (n === 2 && counts.get(16) === 1 && counts.get(17) === 1) {
    return { kind: 'rocket', weight: 17, length: 1, cards: sorted };
  }

  // 炸弹
  if (n === 4 && counts.size === 1) {
    return { kind: 'bomb', weight: sorted[0]!.weight, length: 1, cards: sorted };
  }

  // 单
  if (n === 1) {
    return { kind: 'single', weight: sorted[0]!.weight, length: 1, cards: sorted };
  }

  // 对
  if (n === 2 && counts.size === 1) {
    return { kind: 'pair', weight: sorted[0]!.weight, length: 1, cards: sorted };
  }

  // 三张
  if (n === 3 && counts.size === 1) {
    return { kind: 'triple', weight: sorted[0]!.weight, length: 1, cards: sorted };
  }

  // 三带一
  if (n === 4) {
    const triples = groupsOf(counts, 3);
    const singles = groupsOf(counts, 1);
    if (triples.length === 1 && singles.length === 1) {
      return { kind: 'triple_one', weight: triples[0]!, length: 1, cards: sorted };
    }
  }

  // 三带对
  if (n === 5) {
    const triples = groupsOf(counts, 3);
    const pairs = groupsOf(counts, 2);
    if (triples.length === 1 && pairs.length === 1) {
      return { kind: 'triple_pair', weight: triples[0]!, length: 1, cards: sorted };
    }
  }

  // 四带二单
  if (n === 6) {
    const fours = groupsOf(counts, 4);
    if (fours.length === 1) {
      const rest = sorted.filter((c) => c.weight !== fours[0]);
      if (rest.length === 2) {
        return { kind: 'four_two_single', weight: fours[0]!, length: 1, cards: sorted };
      }
    }
  }

  // 四带二对
  if (n === 8) {
    const fours = groupsOf(counts, 4);
    const pairs = groupsOf(counts, 2);
    if (fours.length === 1 && pairs.length === 2) {
      return { kind: 'four_two_pair', weight: fours[0]!, length: 1, cards: sorted };
    }
    // 也可能是两炸弹——按四带二对不成立时下面飞机再判
  }

  // 顺子：至少 5 张，全单张连续，无 2/王
  if (n >= 5 && counts.size === n && groupsOf(counts, 1).length === n) {
    if (!weights.some(isStraightForbidden) && isConsecutive(weights)) {
      return { kind: 'straight', weight: weights[weights.length - 1]!, length: n, cards: sorted };
    }
  }

  // 连对：至少 3 对
  if (n >= 6 && n % 2 === 0) {
    const pairs = groupsOf(counts, 2);
    if (pairs.length === n / 2 && pairs.every((w) => !isStraightForbidden(w)) && isConsecutive(pairs)) {
      return { kind: 'pair_straight', weight: pairs[pairs.length - 1]!, length: pairs.length, cards: sorted };
    }
  }

  // 飞机不带翅膀：至少 2 个连续三张
  {
    const triples = groupsOf(counts, 3);
    if (triples.length >= 2 && n === triples.length * 3) {
      if (triples.every((w) => !isStraightForbidden(w)) && isConsecutive(triples)) {
        return { kind: 'plane', weight: triples[triples.length - 1]!, length: triples.length, cards: sorted };
      }
    }
  }

  // 飞机带单：三张数 = 单牌数，总长 = 4 * 飞机长度
  {
    const triples = groupsOf(counts, 3);
    if (triples.length >= 2 && n === triples.length * 4) {
      // 可能有炸弹拆成带牌等情况，简化：取最长连续三张段
      const plane = longestConsecutive(triples.filter((w) => !isStraightForbidden(w)));
      if (plane && plane.length === triples.length && n === plane.length * 4) {
        const wingCount = n - plane.length * 3;
        if (wingCount === plane.length) {
          return { kind: 'plane_single', weight: plane[plane.length - 1]!, length: plane.length, cards: sorted };
        }
      }
      // 四带二误判：若有四张，飞机带单也可能含拆四
      if (plane && plane.length >= 2 && n === plane.length * 4) {
        return { kind: 'plane_single', weight: plane[plane.length - 1]!, length: plane.length, cards: sorted };
      }
    }
  }

  // 飞机带对
  {
    const triples = groupsOf(counts, 3);
    const pairs = groupsOf(counts, 2);
    if (triples.length >= 2 && pairs.length === triples.length && n === triples.length * 5) {
      if (triples.every((w) => !isStraightForbidden(w)) && isConsecutive(triples)) {
        return { kind: 'plane_pair', weight: triples[triples.length - 1]!, length: triples.length, cards: sorted };
      }
    }
  }

  // 更宽松的飞机带单：统计所有 count>=3 的作为机身候选
  {
    const tripleWeights = [...counts.entries()]
      .filter(([, c]) => c >= 3)
      .map(([w]) => w)
      .filter((w) => !isStraightForbidden(w))
      .sort((a, b) => a - b);
    const plane = longestConsecutive(tripleWeights);
    if (plane && plane.length >= 2) {
      const body = plane.length * 3;
      const wings = n - body;
      if (wings === plane.length && n === plane.length * 4) {
        return { kind: 'plane_single', weight: plane[plane.length - 1]!, length: plane.length, cards: sorted };
      }
      if (wings === plane.length * 2) {
        // 带对：剩余必须能组成 plane.length 个对
        const restCounts = new Map(counts);
        for (const w of plane) {
          restCounts.set(w, (restCounts.get(w) ?? 0) - 3);
        }
        let pairSlots = 0;
        for (const [, c] of restCounts) {
          if (c < 0 || c % 2 !== 0) {
            pairSlots = -1;
            break;
          }
          pairSlots += c / 2;
        }
        if (pairSlots === plane.length) {
          return { kind: 'plane_pair', weight: plane[plane.length - 1]!, length: plane.length, cards: sorted };
        }
      }
    }
  }

  return null;
}

function longestConsecutive(weights: number[]): number[] | null {
  if (!weights.length) return null;
  const uniq = [...new Set(weights)].sort((a, b) => a - b);
  let best: number[] = [uniq[0]!];
  let cur: number[] = [uniq[0]!];
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i] === uniq[i - 1]! + 1) {
      cur.push(uniq[i]!);
    } else {
      if (cur.length > best.length) best = cur;
      cur = [uniq[i]!];
    }
  }
  if (cur.length > best.length) best = cur;
  return best.length >= 2 ? best : null;
}

/** 比较：下一手是否能压过上一手。prev 为空表示自由出牌，只需合法牌型 */
export function canBeat(next: Pattern, prev: Pattern | null): boolean {
  if (!prev) return true;
  if (next.kind === 'rocket') return true;
  if (prev.kind === 'rocket') return false;
  if (next.kind === 'bomb' && prev.kind !== 'bomb') return true;
  if (next.kind === 'bomb' && prev.kind === 'bomb') return next.weight > prev.weight;
  if (prev.kind === 'bomb') return false;
  if (next.kind !== prev.kind) return false;
  if (next.length !== prev.length) return false;
  return next.weight > prev.weight;
}

export function patternLabel(p: Pattern): string {
  const map: Record<PatternKind, string> = {
    single: '单张',
    pair: '对子',
    triple: '三张',
    triple_one: '三带一',
    triple_pair: '三带对',
    straight: '顺子',
    pair_straight: '连对',
    plane: '飞机',
    plane_single: '飞机带单',
    plane_pair: '飞机带对',
    four_two_single: '四带二',
    four_two_pair: '四带两对',
    bomb: '炸弹',
    rocket: '王炸',
  };
  return map[p.kind];
}
