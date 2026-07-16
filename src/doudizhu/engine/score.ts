/** 积分与翻倍结算 */

export const INITIAL_SCORE = 100;

export type ScoreDelta = [number, number, number];

/** 每位玩家的加倍系数：1=不加倍 · 2=加倍 · 4=超级加倍 */
export type DoubleFactors = [number, number, number];

export type SettleInput = {
  landlord: 0 | 1 | 2;
  /** 叫分 1/2/3 */
  bidScore: number;
  /** 本局炸弹+王炸次数（每次×2） */
  bombCount: number;
  /** 春天或反春天 */
  spring: boolean;
  /** 地主是否获胜 */
  landlordWin: boolean;
  /** 三人加倍系数，缺省视为 1 */
  doubles?: DoubleFactors;
};

export function computeBasePoints(input: SettleInput): number {
  let base = Math.max(1, input.bidScore);
  for (let i = 0; i < input.bombCount; i += 1) base *= 2;
  if (input.spring) base *= 2;
  return base;
}

/**
 * 当前展示用总倍数（不含胜负方向）：
 * 叫分 × 炸弹 × 春天 × 各家加倍之积
 */
export function computeDisplayMultiplier(input: {
  bidScore: number;
  bombCount: number;
  spring?: boolean;
  doubles?: DoubleFactors;
}): number {
  let m = Math.max(1, input.bidScore || 1);
  for (let i = 0; i < input.bombCount; i += 1) m *= 2;
  if (input.spring) m *= 2;
  const doubles = input.doubles ?? [1, 1, 1];
  for (const d of doubles) m *= Math.max(1, d || 1);
  return m;
}

/**
 * 返回三人积分变化。
 * 地主与每位农民独立结算：基数 × 该农民加倍 × 地主加倍
 * （两位农民之和即地主得失的两倍绝对值）
 */
export function computeScoreDelta(input: SettleInput): ScoreDelta {
  const base = computeBasePoints(input);
  const delta: ScoreDelta = [0, 0, 0];
  const L = input.landlord;
  const doubles = input.doubles ?? [1, 1, 1];
  const landlordFactor = Math.max(1, doubles[L] || 1);

  for (let i = 0; i < 3; i += 1) {
    if (i === L) continue;
    const farmerFactor = Math.max(1, doubles[i] || 1);
    const amount = base * farmerFactor * landlordFactor;
    if (input.landlordWin) {
      delta[i] = -amount;
      delta[L] += amount;
    } else {
      delta[i] = amount;
      delta[L] -= amount;
    }
  }
  return delta;
}

export function applyDelta(scores: ScoreDelta, delta: ScoreDelta): ScoreDelta {
  return [scores[0] + delta[0], scores[1] + delta[1], scores[2] + delta[2]];
}
