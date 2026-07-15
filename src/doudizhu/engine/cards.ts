/** 斗地主牌面与发牌 */

export type Suit = 'S' | 'H' | 'D' | 'C' | 'J';

/** 3-15=2, 16=小王, 17=大王 */
export type RankWeight = number;

export type Card = {
  id: string;
  suit: Suit;
  /** 展示用：3-10,J,Q,K,A,2,SJ,BJ */
  label: string;
  /** 比较权重 */
  weight: RankWeight;
};

export const WEIGHT_LABEL: Record<number, string> = {
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
  15: '2',
  16: '小王',
  17: '大王',
};

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANK_WEIGHTS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export function createDeck(): Card[] {
  const cards: Card[] = [];
  let seq = 0;
  for (const suit of SUITS) {
    for (const weight of RANK_WEIGHTS) {
      cards.push({
        id: `${suit}-${weight}-${seq}`,
        suit,
        label: WEIGHT_LABEL[weight]!,
        weight,
      });
      seq += 1;
    }
  }
  cards.push({ id: `J-16-${seq}`, suit: 'J', label: '小王', weight: 16 });
  seq += 1;
  cards.push({ id: `J-17-${seq}`, suit: 'J', label: '大王', weight: 17 });
  return cards;
}

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
  }
  return next;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    return a.suit.localeCompare(b.suit);
  });
}

export function sortCardsDesc(cards: Card[]): Card[] {
  return sortCards(cards).reverse();
}

export type DealResult = {
  hands: [Card[], Card[], Card[]];
  bottom: Card[];
};

export function dealCards(rng: () => number = Math.random): DealResult {
  const deck = shuffle(createDeck(), rng);
  return {
    hands: [sortCards(deck.slice(0, 17)), sortCards(deck.slice(17, 34)), sortCards(deck.slice(34, 51))],
    bottom: sortCards(deck.slice(51, 54)),
  };
}

export function removeCards(hand: Card[], played: Card[]): Card[] {
  const ids = new Set(played.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
}

export function cardsByIds(hand: Card[], ids: string[]): Card[] | null {
  const map = new Map(hand.map((c) => [c.id, c]));
  const result: Card[] = [];
  for (const id of ids) {
    const card = map.get(id);
    if (!card) return null;
    result.push(card);
    map.delete(id);
  }
  return result;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}
