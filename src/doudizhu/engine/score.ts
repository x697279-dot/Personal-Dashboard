/** 积分与翻倍结算 */

export const INITIAL_SCORE = 100;

export type ScoreDelta = [number, number, number];

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
};

export function computeBasePoints(input: SettleInput): number {
  let base = Math.max(1, input.bidScore);
  for (let i = 0; i < input.bombCount; i += 1) base *= 2;
  if (input.spring) base *= 2;
  return base;
}

/** 返回三人积分变化（相对当前分的增减） */
export function computeScoreDelta(input: SettleInput): ScoreDelta {
  const base = computeBasePoints(input);
  const delta: ScoreDelta = [0, 0, 0];
  const L = input.landlord;

  if (input.landlordWin) {
    for (let i = 0; i < 3; i += 1) {
      if (i === L) delta[i] = base * 2;
      else delta[i] = -base;
    }
  } else {
    for (let i = 0; i < 3; i += 1) {
      if (i === L) delta[i] = -base * 2;
      else delta[i] = base;
    }
  }
  return delta;
}

export function applyDelta(scores: ScoreDelta, delta: ScoreDelta): ScoreDelta {
  return [scores[0] + delta[0], scores[1] + delta[1], scores[2] + delta[2]];
}
