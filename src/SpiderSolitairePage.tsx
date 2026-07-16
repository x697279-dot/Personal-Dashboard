import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scrollToTop } from './scrollToTop';

type Suit = 'S' | 'H' | 'D' | 'C';
type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
type DifficultyId = 'easy' | 'medium' | 'hard';

type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
};

type Difficulty = {
  id: DifficultyId;
  label: string;
  title: string;
  description: string;
  suits: Suit[];
  accent: string;
};

type Selection = {
  col: number;
  index: number;
} | null;

type GameSnapshot = {
  columns: Card[][];
  stock: Card[];
  completed: number;
  moves: number;
};

const difficulties: Difficulty[] = [
  {
    id: 'easy',
    label: '简单',
    title: '单色蛛网',
    description: '仅黑桃一种花色，专注理顺顺子。',
    suits: ['S'],
    accent: 'easy',
  },
  {
    id: 'medium',
    label: '中等',
    title: '双色蛛网',
    description: '黑桃与红心，同色顺子才能收走。',
    suits: ['S', 'H'],
    accent: 'medium',
  },
  {
    id: 'hard',
    label: '困难',
    title: '四色蛛网',
    description: '四花色完整蜘蛛纸牌，挑战最高。',
    suits: ['S', 'H', 'D', 'C'],
    accent: 'hard',
  },
];

const RANK_LABEL: Record<Rank, string> = {
  1: 'A',
  2: '2',
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
};

const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

const RED_SUITS: Suit[] = ['H', 'D'];

function isRed(suit: Suit) {
  return RED_SUITS.includes(suit);
}

function cardText(card: Card) {
  return `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`;
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = next[i]!;
    next[i] = next[j]!;
    next[j] = temp;
  }
  return next;
}

function createDeck(suits: Suit[]): Card[] {
  const cards: Card[] = [];
  const copies = 8 / suits.length;
  let seq = 0;
  for (let copy = 0; copy < copies; copy += 1) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank += 1) {
        cards.push({
          id: `${suit}-${rank}-${copy}-${seq}`,
          suit,
          rank: rank as Rank,
          faceUp: false,
        });
        seq += 1;
      }
    }
  }
  return shuffle(cards);
}

function dealNewGame(suits: Suit[]): GameSnapshot {
  const deck = createDeck(suits);
  const columns: Card[][] = Array.from({ length: 10 }, () => []);

  let cursor = 0;
  for (let round = 0; round < 6; round += 1) {
    for (let col = 0; col < 10; col += 1) {
      if (round === 5 && col >= 4) continue;
      const card = deck[cursor]!;
      cursor += 1;
      columns[col]!.push({ ...card, faceUp: false });
    }
  }

  for (const col of columns) {
    const top = col[col.length - 1];
    if (top) top.faceUp = true;
  }

  return {
    columns,
    stock: deck.slice(cursor).map((card) => ({ ...card, faceUp: false })),
    completed: 0,
    moves: 0,
  };
}

function cloneColumns(columns: Card[][]): Card[][] {
  return columns.map((col) => col.map((card) => ({ ...card })));
}

function isSameSuitRun(cards: Card[], from: number): boolean {
  if (from < 0 || from >= cards.length) return false;
  if (!cards[from]?.faceUp) return false;
  for (let i = from; i < cards.length - 1; i += 1) {
    const a = cards[i]!;
    const b = cards[i + 1]!;
    if (!a.faceUp || !b.faceUp) return false;
    if (a.suit !== b.suit) return false;
    if (a.rank !== b.rank + 1) return false;
  }
  return true;
}

function canPlaceOn(moving: Card, target: Card | undefined) {
  if (!target) return true;
  return target.faceUp && moving.rank === target.rank - 1;
}

function findCompletedRun(column: Card[]): number | null {
  if (column.length < 13) return null;
  const start = column.length - 13;
  const head = column[start]!;
  if (!head.faceUp || head.rank !== 13) return null;
  for (let i = 0; i < 13; i += 1) {
    const card = column[start + i]!;
    if (!card.faceUp) return null;
    if (card.suit !== head.suit) return null;
    if (card.rank !== 13 - i) return null;
  }
  return start;
}

function removeCompletedRuns(columns: Card[][]): { columns: Card[][]; removed: number } {
  const next = cloneColumns(columns);
  let removed = 0;

  for (let c = 0; c < next.length; c += 1) {
    let start = findCompletedRun(next[c]!);
    while (start !== null) {
      next[c] = next[c]!.slice(0, start);
      const top = next[c]![next[c]!.length - 1];
      if (top && !top.faceUp) top.faceUp = true;
      removed += 1;
      start = findCompletedRun(next[c]!);
    }
  }

  return { columns: next, removed };
}

function SpiderSolitairePage() {
  const [selectedDiff, setSelectedDiff] = useState<Difficulty | null>(null);
  const [columns, setColumns] = useState<Card[][]>([]);
  const [stock, setStock] = useState<Card[]>([]);
  const [completed, setCompleted] = useState(0);
  const [moves, setMoves] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<GameSnapshot[]>([]);
  const [status, setStatus] = useState<'playing' | 'won'>('playing');
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const dragRef = useRef<Selection>(null);
  const skipClickRef = useRef(false);

  const difficulty = selectedDiff;
  const stockDeals = Math.floor(stock.length / 10);
  const [mobilePlay, setMobilePlay] = useState(false);

  useEffect(() => {
    const syncMobileLayout = () => {
      const inMatch = Boolean(difficulty);
      const isPhone =
        /Mobi|Android|iPhone|iPod|MicroMessenger/i.test(navigator.userAgent) ||
        Math.min(window.innerWidth, window.innerHeight) <= 520;
      setMobilePlay(inMatch && isPhone);
      document.documentElement.classList.remove('spider-wechat-landscape');
    };
    syncMobileLayout();
    window.addEventListener('resize', syncMobileLayout);
    window.addEventListener('orientationchange', syncMobileLayout);
    return () => {
      document.documentElement.classList.remove('spider-wechat-landscape');
      window.removeEventListener('resize', syncMobileLayout);
      window.removeEventListener('orientationchange', syncMobileLayout);
    };
  }, [difficulty]);

  const faceUpStep = mobilePlay ? 14 : 22;
  const faceDownStep = mobilePlay ? 8 : 12;

  const startGame = (diff: Difficulty) => {
    const snapshot = dealNewGame(diff.suits);
    setSelectedDiff(diff);
    setColumns(snapshot.columns);
    setStock(snapshot.stock);
    setCompleted(0);
    setMoves(0);
    setSelection(null);
    setMessage('点选或拖动同花连续牌组到目标列；右上角完成区会自动收走 K→A。');
    setHistory([]);
    setStatus('playing');
    setDragOverCol(null);
    scrollToTop(['.spider-page']);
  };

  // Level-select enter + difficulty switch: reset window and page container scroll.
  useEffect(() => {
    scrollToTop(['.spider-page']);
  }, [difficulty]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-30),
      {
        columns: cloneColumns(columns),
        stock: stock.map((card) => ({ ...card })),
        completed,
        moves,
      },
    ]);
  }, [columns, stock, completed, moves]);

  const applyBoard = (nextColumns: Card[][], nextMoves: number, note?: string) => {
    const { columns: cleaned, removed } = removeCompletedRuns(nextColumns);
    const nextCompleted = completed + removed;
    setColumns(cleaned);
    setMoves(nextMoves);
    setCompleted(nextCompleted);
    setSelection(null);
    setDragOverCol(null);
    if (removed > 0) {
      setMessage(removed > 1 ? `收走了 ${removed} 组完整顺子！` : '收走了一组 K→A 同花顺！');
    } else if (note) {
      setMessage(note);
    }
    if (nextCompleted >= 8) {
      setStatus('won');
      setMessage('八组顺子全部收齐，蜘蛛落网！');
    }
  };

  const tryMove = (fromCol: number, fromIndex: number, toCol: number) => {
    if (fromCol === toCol || status === 'won') return false;
    const source = columns[fromCol]!;
    if (!isSameSuitRun(source, fromIndex)) {
      setMessage('只能移动同花色、连续递减的牌组。');
      return false;
    }

    const moving = source.slice(fromIndex);
    const movingHead = moving[0]!;
    const targetTop = columns[toCol]![columns[toCol]!.length - 1];

    if (!canPlaceOn(movingHead, targetTop)) {
      if (!targetTop) {
        setMessage('空列可以放置任意可移动牌组。');
      } else {
        const need = movingHead.rank + 1;
        const needLabel = need <= 13 ? RANK_LABEL[need as Rank] : '?';
        setMessage(
          `不能把 ${cardText(movingHead)} 放到 ${cardText(targetTop)} 上。要放到「${needLabel}」上面，或放到空列。`,
        );
      }
      return false;
    }

    pushHistory();
    const next = cloneColumns(columns);
    next[fromCol] = source.slice(0, fromIndex);
    const uncovered = next[fromCol]![next[fromCol]!.length - 1];
    if (uncovered && !uncovered.faceUp) uncovered.faceUp = true;
    next[toCol] = [...next[toCol]!, ...moving.map((card) => ({ ...card, faceUp: true }))];
    applyBoard(next, moves + 1, `已移动到第 ${toCol + 1} 列`);
    return true;
  };

  const handleCardClick = (col: number, index: number) => {
    if (status === 'won') return;
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }

    const card = columns[col]![index]!;
    if (!card.faceUp) return;

    if (selection) {
      if (selection.col === col && selection.index === index) {
        setSelection(null);
        setMessage('已取消选择。');
        return;
      }
      if (tryMove(selection.col, selection.index, col)) return;
      if (isSameSuitRun(columns[col]!, index)) {
        setSelection({ col, index });
        setMessage('已改选牌组，再点/拖到目标列（含空列）。');
        return;
      }
      setSelection(null);
      return;
    }

    if (!isSameSuitRun(columns[col]!, index)) {
      setMessage('从这张往下不是同花连续顺，请点更下面能连起来的牌。');
      return;
    }
    setSelection({ col, index });
    setMessage('已选中：再点目标列，或直接拖到目标列/空列。');
  };

  const handleColumnActivate = (col: number) => {
    if (status === 'won' || !selection) return;
    tryMove(selection.col, selection.index, col);
  };

  const handleFoundationClick = () => {
    setMessage('右上角是完成区：同花色 K→A 凑齐后会自动收走，不能手动放入。');
  };

  const dealFromStock = () => {
    if (status === 'won') return;
    if (stock.length < 10) {
      setMessage('发牌堆已空。');
      return;
    }
    if (columns.some((col) => col.length === 0)) {
      setMessage('有空列时不能发牌，请先填满十列。');
      return;
    }

    pushHistory();
    const nextStock = [...stock];
    const deal = nextStock.splice(0, 10);
    const next = cloneColumns(columns);
    for (let i = 0; i < 10; i += 1) {
      next[i]!.push({ ...deal[i]!, faceUp: true });
    }
    setStock(nextStock);
    applyBoard(next, moves + 1, `发牌 · 剩余 ${Math.floor(nextStock.length / 10)} 次`);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((list) => list.slice(0, -1));
    setColumns(cloneColumns(prev.columns));
    setStock(prev.stock.map((card) => ({ ...card })));
    setCompleted(prev.completed);
    setMoves(prev.moves);
    setSelection(null);
    setStatus('playing');
    setMessage('已撤销上一步。');
  };

  const selectedIds = useMemo(() => {
    if (!selection) return new Set<string>();
    const ids = new Set<string>();
    const col = columns[selection.col] ?? [];
    for (let i = selection.index; i < col.length; i += 1) {
      ids.add(col[i]!.id);
    }
    return ids;
  }, [selection, columns]);

  const onDragStartCard = (col: number, index: number, event: DragEvent) => {
    if (status === 'won') {
      event.preventDefault();
      return;
    }
    if (!columns[col]![index]?.faceUp || !isSameSuitRun(columns[col]!, index)) {
      event.preventDefault();
      setMessage('只能拖动同花色、连续递减的牌组。');
      return;
    }
    dragRef.current = { col, index };
    setSelection({ col, index });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${col}:${index}`);
  };

  const onDragOverColumn = (col: number, event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  };

  const onDropColumn = (col: number, event: DragEvent) => {
    event.preventDefault();
    setDragOverCol(null);
    const from = dragRef.current;
    dragRef.current = null;
    skipClickRef.current = true;
    if (!from) return;
    tryMove(from.col, from.index, col);
  };

  if (!difficulty) {
    return (
      <div className="spider-page">
        <div className="spider-felt-glow" />
        <button
          className="spider-back-button"
          type="button"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          返回主页
        </button>

        <section className="spider-hero" aria-label="蜘蛛纸牌难度选择">
          <div className="spider-hero-copy">
            <p className="spider-kicker">SPIDER SOLITAIRE · CAPYLULU</p>
            <h1>
              <span>蜘蛛纸牌</span>
              <span>三档难度</span>
            </h1>
            <p className="spider-subtitle">
              经典十列布局：把同花色 K→A 顺子理齐收走，收满八组即获胜。支持点选与拖放，也可撤销。
            </p>
          </div>

          <div className="spider-level-grid" role="list">
            {difficulties.map((diff) => (
              <button
                key={diff.id}
                type="button"
                role="listitem"
                className={`spider-level-card spider-level-${diff.accent}`}
                onClick={() => startGame(diff)}
              >
                <span className="spider-level-badge">{diff.label}</span>
                <strong>{diff.title}</strong>
                <em>{diff.suits.map((s) => SUIT_SYMBOL[s]).join(' ')}</em>
                <span className="spider-level-desc">{diff.description}</span>
                <span className="spider-level-cta">开始游戏</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`spider-page spider-playing spider-theme-${difficulty.accent}${mobilePlay ? ' is-mobile-play' : ''}`}
    >
      <div className="spider-felt-glow" />

      <header className="spider-hud">
        <div className="spider-hud-title">
          <p className="spider-kicker">SPIDER</p>
          <h1>{difficulty.title}</h1>
        </div>

        <div className="spider-hud-stats">
          <div className="spider-stat">
            <span>已收顺</span>
            <strong>{completed}/8</strong>
          </div>
          <div className="spider-stat">
            <span>步数</span>
            <strong>{moves}</strong>
          </div>
          <div className="spider-stat">
            <span>发牌</span>
            <strong>{stockDeals}</strong>
          </div>
        </div>

        <div className="spider-hud-actions">
          <button type="button" className="spider-ghost-button" onClick={undo} disabled={!history.length}>
            撤销
          </button>
          <button type="button" className="spider-ghost-button" onClick={() => startGame(difficulty)}>
            重开
          </button>
          <button type="button" className="spider-ghost-button" onClick={() => setSelectedDiff(null)}>
            选关
          </button>
          <button
            type="button"
            className="spider-ghost-button"
            onClick={() => {
              window.location.hash = '#/';
            }}
          >
            主页
          </button>
        </div>
      </header>

      <p className="spider-message" role="status">
        {message}
      </p>

      <div className="spider-table">
        <div className="spider-stock-row">
          <button
            type="button"
            className={`spider-stock ${stockDeals === 0 ? 'is-empty' : ''}`}
            onClick={dealFromStock}
            disabled={stockDeals === 0 || status === 'won'}
            aria-label="发牌"
          >
            {stockDeals > 0 ? (
              <>
                <span className="spider-stock-back" />
                <span className="spider-stock-count">{stockDeals}</span>
              </>
            ) : (
              <span className="spider-stock-empty">空</span>
            )}
          </button>

          <button
            type="button"
            className="spider-foundations"
            aria-label="完成区，自动收走同花K到A"
            onClick={handleFoundationClick}
          >
            <span className="spider-foundations-label">完成区 · 自动收走</span>
            <span className="spider-foundations-slots">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className={`spider-foundation ${i < completed ? 'is-filled' : ''}`}>
                  {i < completed ? 'K–A' : ''}
                </span>
              ))}
            </span>
          </button>
        </div>

        <div className="spider-columns" role="group" aria-label="牌桌十列">
          {columns.map((col, colIndex) => {
            const isTarget = Boolean(selection && selection.col !== colIndex) || dragOverCol === colIndex;
            return (
              <div
                key={colIndex}
                className={`spider-column ${col.length === 0 ? 'is-empty' : ''} ${isTarget ? 'is-drop-target' : ''} ${
                  dragOverCol === colIndex ? 'is-drag-over' : ''
                }`}
                onClick={() => handleColumnActivate(colIndex)}
                onDragOver={(event) => onDragOverColumn(colIndex, event)}
                onDragLeave={() => setDragOverCol((curr) => (curr === colIndex ? null : curr))}
                onDrop={(event) => onDropColumn(colIndex, event)}
              >
                {col.length === 0 ? (
                  <div className="spider-column-slot">
                    <span>空列</span>
                  </div>
                ) : null}
                {col.map((card, cardIndex) => {
                  const selected = selectedIds.has(card.id);
                  const offset = cardIndex * (card.faceUp ? faceUpStep : faceDownStep);
                  const canDrag = card.faceUp && isSameSuitRun(col, cardIndex) && status !== 'won';
                  return (
                    <button
                      key={card.id}
                      type="button"
                      draggable={canDrag}
                      className={[
                        'spider-card',
                        card.faceUp ? 'is-face-up' : 'is-face-down',
                        isRed(card.suit) ? 'is-red' : 'is-black',
                        selected ? 'is-selected' : '',
                        canDrag ? 'is-draggable' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ top: offset, zIndex: cardIndex + 1 }}
                      disabled={!card.faceUp || status === 'won'}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCardClick(colIndex, cardIndex);
                      }}
                      onDragStart={(event) => onDragStartCard(colIndex, cardIndex, event)}
                      onDragEnd={() => {
                        dragRef.current = null;
                        setDragOverCol(null);
                      }}
                      aria-label={
                        card.faceUp
                          ? `${SUIT_SYMBOL[card.suit]}${RANK_LABEL[card.rank]}`
                          : '背面牌'
                      }
                    >
                      {card.faceUp ? (
                        <>
                          <span className="spider-card-corner spider-card-corner-tl">
                            <em>{RANK_LABEL[card.rank]}</em>
                            <i>{SUIT_SYMBOL[card.suit]}</i>
                          </span>
                          <span className="spider-card-suit">{SUIT_SYMBOL[card.suit]}</span>
                          <span className="spider-card-corner spider-card-corner-br">
                            <em>{RANK_LABEL[card.rank]}</em>
                            <i>{SUIT_SYMBOL[card.suit]}</i>
                          </span>
                        </>
                      ) : (
                        <span className="spider-card-pattern" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="spider-tip">
        点选或拖放到目标列 · 只能放到比自己大 1 的牌上 · 右上角完成区不能手动放牌
      </p>

      {status === 'won' ? (
        <div className="spider-result-overlay" role="dialog" aria-modal="true">
          <div className="spider-result-card">
            <p className="spider-kicker">CLEARED</p>
            <h2>蜘蛛落网！</h2>
            <p>
              {difficulty.label} · 用了 <strong>{moves}</strong> 步
            </p>
            <div className="spider-result-actions">
              <button type="button" onClick={() => startGame(difficulty)}>
                再来一局
              </button>
              <button type="button" className="secondary" onClick={() => setSelectedDiff(null)}>
                换个难度
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  window.location.hash = '#/';
                }}
              >
                返回主页
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { SpiderSolitairePage };
