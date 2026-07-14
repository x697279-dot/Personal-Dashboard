import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DifficultyId = 'easy' | 'hard' | 'extreme';

type Cell = {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacent: number;
};

type Difficulty = {
  id: DifficultyId;
  label: string;
  title: string;
  description: string;
  rows: number;
  cols: number;
  mines: number;
  accent: string;
};

const difficulties: Difficulty[] = [
  {
    id: 'easy',
    label: '简单',
    title: '晴空草甸',
    description: '9×9 · 10 颗雷，适合热身入门。',
    rows: 9,
    cols: 9,
    mines: 10,
    accent: 'easy',
  },
  {
    id: 'hard',
    label: '困难',
    title: '密林迷雾',
    description: '16×16 · 40 颗雷，需要冷静推理。',
    rows: 16,
    cols: 16,
    mines: 40,
    accent: 'hard',
  },
  {
    id: 'extreme',
    label: '超难',
    title: '深渊雷域',
    description: '24×24 · 99 颗雷，极限挑战。',
    rows: 24,
    cols: 24,
    mines: 99,
    accent: 'extreme',
  },
];

type GameStatus = 'ready' | 'playing' | 'won' | 'lost';

function createEmptyBoard(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      adjacent: 0,
    })),
  );
}

function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function inBounds(rows: number, cols: number, r: number, c: number) {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

function neighbors(rows: number, cols: number, r: number, c: number) {
  const result: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(rows, cols, nr, nc)) result.push([nr, nc]);
    }
  }
  return result;
}

function placeMines(board: Cell[][], mines: number, safeR: number, safeC: number) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const forbidden = new Set<string>([`${safeR},${safeC}`]);
  for (const [nr, nc] of neighbors(rows, cols, safeR, safeC)) {
    forbidden.add(`${nr},${nc}`);
  }

  const positions: Array<[number, number]> = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!forbidden.has(`${r},${c}`)) positions.push([r, c]);
    }
  }

  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = positions[i]!;
    positions[i] = positions[j]!;
    positions[j] = temp;
  }

  const mineCount = Math.min(mines, positions.length);
  for (let i = 0; i < mineCount; i += 1) {
    const [r, c] = positions[i]!;
    board[r]![c]!.mine = true;
  }

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (board[r]![c]!.mine) {
        board[r]![c]!.adjacent = 0;
        continue;
      }
      board[r]![c]!.adjacent = neighbors(rows, cols, r, c).filter(([nr, nc]) => board[nr]![nc]!.mine).length;
    }
  }
}

function floodReveal(board: Cell[][], startR: number, startC: number) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const stack: Array<[number, number]> = [[startR, startC]];

  while (stack.length) {
    const [r, c] = stack.pop()!;
    const cell = board[r]![c]!;
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.mine || cell.adjacent > 0) continue;
    for (const [nr, nc] of neighbors(rows, cols, r, c)) {
      const next = board[nr]![nc]!;
      if (!next.revealed && !next.flagged) stack.push([nr, nc]);
    }
  }
}

function hasAnyMines(board: Cell[][]) {
  return board.some((row) => row.some((cell) => cell.mine));
}

function checkWin(board: Cell[][]) {
  let hasMine = false;
  let hasSafeCell = false;
  for (const row of board) {
    for (const cell of row) {
      if (cell.mine) {
        hasMine = true;
        continue;
      }
      hasSafeCell = true;
      if (!cell.revealed) return false;
    }
  }
  return hasMine && hasSafeCell;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function MinesweeperGamePage() {
  const [selected, setSelected] = useState<Difficulty | null>(null);
  const [board, setBoard] = useState<Cell[][]>([]);
  const [status, setStatus] = useState<GameStatus>('ready');
  const [flagsLeft, setFlagsLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [revealedPulse, setRevealedPulse] = useState<string | null>(null);
  const longPressRef = useRef<{ timer: number | null; armed: boolean }>({ timer: null, armed: false });

  const difficulty = selected;

  const resetGame = useCallback((diff: Difficulty) => {
    setBoard(createEmptyBoard(diff.rows, diff.cols));
    setStatus('ready');
    setFlagsLeft(diff.mines);
    setElapsed(0);
    setRevealedPulse(null);
  }, []);

  const startDifficulty = (diff: Difficulty) => {
    setSelected(diff);
    resetGame(diff);
  };

  useEffect(() => {
    if (!difficulty || status !== 'playing') return;
    const id = window.setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [difficulty, status]);

  const remainingSafe = useMemo(() => {
    if (!difficulty) return 0;
    let revealed = 0;
    for (const row of board) {
      for (const cell of row) {
        if (cell.revealed && !cell.mine) revealed += 1;
      }
    }
    return difficulty.rows * difficulty.cols - difficulty.mines - revealed;
  }, [board, difficulty]);

  const clearLongPress = () => {
    if (longPressRef.current.timer !== null) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const toggleFlag = (r: number, c: number) => {
    if (!difficulty || status === 'won' || status === 'lost') return;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      const cell = next[r]![c]!;
      if (cell.revealed) return prev;
      if (!cell.flagged && flagsLeft <= 0) return prev;
      cell.flagged = !cell.flagged;
      setFlagsLeft((count) => count + (cell.flagged ? -1 : 1));
      if (status === 'ready') setStatus('playing');
      return next;
    });
  };

  const revealCell = (r: number, c: number) => {
    if (!difficulty || status === 'won' || status === 'lost') return;

    setBoard((prev) => {
      if (!prev.length) return prev;
      const working = cloneBoard(prev);
      const clicked = working[r]?.[c];
      if (!clicked || clicked.revealed || clicked.flagged) return prev;

      // 用棋盘状态判断是否已布雷，避免 Strict Mode 双调用导致空盘全开
      if (!hasAnyMines(working)) {
        placeMines(working, difficulty.mines, r, c);
        setStatus('playing');
      }

      const cell = working[r]![c]!;
      if (cell.mine) {
        for (const row of working) {
          for (const item of row) {
            if (item.mine) item.revealed = true;
          }
        }
        cell.revealed = true;
        setStatus('lost');
        setRevealedPulse(`${r}-${c}`);
        return working;
      }

      floodReveal(working, r, c);
      setRevealedPulse(`${r}-${c}`);

      if (checkWin(working)) {
        for (const row of working) {
          for (const item of row) {
            if (item.mine) item.flagged = true;
          }
        }
        setFlagsLeft(0);
        setStatus('won');
      } else if (status === 'ready') {
        setStatus('playing');
      }

      return working;
    });
  };

  const handleCellClick = (r: number, c: number) => {
    if (longPressRef.current.armed) {
      longPressRef.current.armed = false;
      return;
    }
    revealCell(r, c);
  };

  const handleContextMenu = (event: MouseEvent, r: number, c: number) => {
    event.preventDefault();
    toggleFlag(r, c);
  };

  const handlePointerDown = (r: number, c: number) => {
    clearLongPress();
    longPressRef.current.armed = false;
    longPressRef.current.timer = window.setTimeout(() => {
      longPressRef.current.armed = true;
      toggleFlag(r, c);
    }, 420);
  };

  const handlePointerUp = () => clearLongPress();

  if (!difficulty) {
    return (
      <div className="mines-page">
        <div className="mines-orb mines-orb-a" />
        <div className="mines-orb mines-orb-b" />
        <div className="mines-grid-bg" aria-hidden="true" />

        <button
          className="mines-back-button"
          type="button"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          返回主页
        </button>

        <section className="mines-hero" aria-label="扫雷关卡选择">
          <div className="mines-hero-copy">
            <p className="mines-kicker">MINEFIELD · CAPYLULU</p>
            <h1>
              <span>扫雷</span>
              <span>三关挑战</span>
            </h1>
            <p className="mines-subtitle">
              左键翻开格子，右键或长按插旗。第一下永远安全，清掉全部安全格即可通关。
            </p>
          </div>

          <div className="mines-level-grid" role="list">
            {difficulties.map((diff) => (
              <button
                key={diff.id}
                type="button"
                role="listitem"
                className={`mines-level-card mines-level-${diff.accent}`}
                onClick={() => startDifficulty(diff)}
              >
                <span className="mines-level-badge">{diff.label}</span>
                <strong>{diff.title}</strong>
                <em>
                  {diff.rows}×{diff.cols} · {diff.mines} 雷
                </em>
                <span className="mines-level-desc">{diff.description}</span>
                <span className="mines-level-cta">开始挑战</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const cellSize =
    difficulty.id === 'easy' ? 'minmax(36px, 1fr)' : difficulty.id === 'hard' ? 'minmax(26px, 1fr)' : 'minmax(18px, 1fr)';

  return (
    <div className={`mines-page mines-playing mines-theme-${difficulty.accent}`}>
      <div className="mines-orb mines-orb-a" />
      <div className="mines-orb mines-orb-b" />

      <header className="mines-hud">
        <div className="mines-hud-title">
          <p className="mines-kicker">MINEFIELD</p>
          <h1>{difficulty.title}</h1>
        </div>

        <div className="mines-hud-stats">
          <div className="mines-stat">
            <span>剩余雷</span>
            <strong>{flagsLeft}</strong>
          </div>
          <div className="mines-stat">
            <span>用时</span>
            <strong>{formatTime(elapsed)}</strong>
          </div>
          <div className="mines-stat">
            <span>待翻开</span>
            <strong>{remainingSafe}</strong>
          </div>
        </div>

        <div className="mines-hud-actions">
          <button type="button" className="mines-ghost-button" onClick={() => resetGame(difficulty)}>
            重开
          </button>
          <button type="button" className="mines-ghost-button" onClick={() => setSelected(null)}>
            选关
          </button>
          <button
            type="button"
            className="mines-ghost-button"
            onClick={() => {
              window.location.hash = '#/';
            }}
          >
            主页
          </button>
        </div>
      </header>

      <div className="mines-board-shell">
        <div
          className={`mines-board mines-board-${difficulty.id}`}
          style={{
            gridTemplateColumns: `repeat(${difficulty.cols}, ${cellSize})`,
            gridTemplateRows: `repeat(${difficulty.rows}, ${cellSize})`,
          }}
          role="grid"
          aria-label={`${difficulty.label}扫雷棋盘`}
        >
          {board.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r}-${c}`;
              const showNumber = cell.revealed && !cell.mine && cell.adjacent > 0;
              const classes = [
                'mines-cell',
                cell.revealed ? 'is-revealed' : 'is-hidden',
                cell.flagged ? 'is-flagged' : '',
                cell.revealed && cell.mine ? 'is-mine' : '',
                status === 'lost' && cell.mine ? 'is-exploded-field' : '',
                revealedPulse === key ? 'is-pulse' : '',
                showNumber ? `num-${cell.adjacent}` : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  role="gridcell"
                  aria-label={
                    cell.flagged
                      ? `已插旗 第${r + 1}行第${c + 1}列`
                      : cell.revealed
                        ? cell.mine
                          ? '地雷'
                          : cell.adjacent
                            ? `周围${cell.adjacent}颗雷`
                            : '空格'
                        : `未翻开 第${r + 1}行第${c + 1}列`
                  }
                  disabled={status === 'won' || status === 'lost'}
                  onClick={() => handleCellClick(r, c)}
                  onContextMenu={(event) => handleContextMenu(event, r, c)}
                  onPointerDown={() => handlePointerDown(r, c)}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                >
                  {cell.flagged && !cell.revealed ? <span className="mines-flag" /> : null}
                  {cell.revealed && cell.mine ? <span className="mines-bomb" /> : null}
                  {showNumber ? cell.adjacent : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <p className="mines-tip">左键翻开 · 右键/长按插旗 · 第一下保证安全</p>

      {status === 'won' || status === 'lost' ? (
        <div className="mines-result-overlay" role="dialog" aria-modal="true">
          <div className={`mines-result-card ${status === 'won' ? 'is-win' : 'is-lose'}`}>
            <p className="mines-kicker">{status === 'won' ? 'CLEAR' : 'BOOM'}</p>
            <h2>{status === 'won' ? '全部扫清！' : '踩到地雷了'}</h2>
            <p>
              {difficulty.label}关 · 用时 <strong>{formatTime(elapsed)}</strong>
            </p>
            <div className="mines-result-actions">
              <button type="button" onClick={() => resetGame(difficulty)}>
                再来一局
              </button>
              <button type="button" className="secondary" onClick={() => setSelected(null)}>
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

export { MinesweeperGamePage };
