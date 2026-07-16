import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { scrollToTop } from './scrollToTop';

type DifficultyId = 'easy' | 'hard' | 'extreme';

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 14;

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
  const [flagMode, setFlagMode] = useState(false);
  const longPressRef = useRef<{
    timer: number | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    cellKey: string | null;
    didFlag: boolean;
    suppressClick: boolean;
  }>({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    cellKey: null,
    didFlag: false,
    suppressClick: false,
  });

  const difficulty = selected;
  const boardShellRef = useRef<HTMLDivElement>(null);
  const [mobilePlay, setMobilePlay] = useState(false);

  useEffect(() => {
    const syncMobileLayout = () => {
      const inMatch = Boolean(difficulty);
      const isPhone =
        /Mobi|Android|iPhone|iPod|MicroMessenger/i.test(navigator.userAgent) ||
        Math.min(window.innerWidth, window.innerHeight) <= 520;
      setMobilePlay(inMatch && isPhone);
      // 清掉旧版残留的旋转 class，避免微信里整页消失
      document.documentElement.classList.remove('mines-wechat-landscape');
    };
    syncMobileLayout();
    window.addEventListener('resize', syncMobileLayout);
    window.addEventListener('orientationchange', syncMobileLayout);
    return () => {
      document.documentElement.classList.remove('mines-wechat-landscape');
      window.removeEventListener('resize', syncMobileLayout);
      window.removeEventListener('orientationchange', syncMobileLayout);
    };
  }, [difficulty]);

  useEffect(() => {
    const shell = boardShellRef.current;
    if (!shell || !difficulty) return;
    const applySize = () => {
      const style = window.getComputedStyle(shell);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const rect = shell.getBoundingClientRect();
      const contentW = Math.max(0, rect.width - padX);
      const contentH = Math.max(0, rect.height - padY);
      const vw = document.documentElement.clientWidth || window.innerWidth;
      // 严格不超过可视宽度，避免壳子出现左右滚动条
      const maxByViewport = Math.max(120, vw - (mobilePlay ? 28 : 48));
      const side = Math.max(
        120,
        Math.floor(Math.min(contentW || maxByViewport, maxByViewport, contentH > 40 ? contentH : maxByViewport)),
      );
      shell.style.setProperty('--board-side', `${side}px`);
    };
    applySize();
    const ro = new ResizeObserver(() => applySize());
    ro.observe(shell);
    window.addEventListener('resize', applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applySize);
    };
  }, [difficulty, mobilePlay]);

  const resetGame = useCallback((diff: Difficulty) => {
    setBoard(createEmptyBoard(diff.rows, diff.cols));
    setStatus('ready');
    setFlagsLeft(diff.mines);
    setElapsed(0);
    setRevealedPulse(null);
    setFlagMode(false);
  }, []);

  const startDifficulty = (diff: Difficulty) => {
    setSelected(diff);
    resetGame(diff);
    scrollToTop(['.mines-page']);
  };

  // Level-select enter + difficulty switch: reset window and page container scroll.
  useEffect(() => {
    scrollToTop(['.mines-page']);
  }, [difficulty]);

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

  const clearLongPressTimer = () => {
    if (longPressRef.current.timer !== null) {
      window.clearTimeout(longPressRef.current.timer);
      longPressRef.current.timer = null;
    }
  };

  const resetLongPressTracking = () => {
    clearLongPressTimer();
    longPressRef.current.pointerId = null;
    longPressRef.current.cellKey = null;
    longPressRef.current.didFlag = false;
  };

  const toggleFlag = (r: number, c: number) => {
    if (!difficulty || status === 'won' || status === 'lost') return;
    setBoard((prev) => {
      const next = cloneBoard(prev);
      const cell = next[r]![c]!;
      if (cell.revealed) return prev;
      const flaggedCount = next.reduce(
        (sum, row) => sum + row.reduce((rowSum, item) => rowSum + (item.flagged ? 1 : 0), 0),
        0,
      );
      if (!cell.flagged && flaggedCount >= difficulty.mines) return prev;
      cell.flagged = !cell.flagged;
      setFlagsLeft(difficulty.mines - flaggedCount - (cell.flagged ? 1 : -1));
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
    if (longPressRef.current.suppressClick || longPressRef.current.didFlag) {
      longPressRef.current.suppressClick = false;
      longPressRef.current.didFlag = false;
      return;
    }
    if (mobilePlay && flagMode) {
      toggleFlag(r, c);
      return;
    }
    revealCell(r, c);
  };

  const handleContextMenu = (event: MouseEvent, r: number, c: number) => {
    event.preventDefault();
    // 移动端插旗模式已用点击处理；长按已插旗时避免 contextmenu 再拨一次
    if (mobilePlay && flagMode) return;
    if (longPressRef.current.didFlag || longPressRef.current.suppressClick) return;
    toggleFlag(r, c);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, r: number, c: number) => {
    // 桌面鼠标走右键；触摸/触控笔用长按（插旗模式下点按即可，无需长按）
    if (event.pointerType === 'mouse' || (mobilePlay && flagMode)) {
      resetLongPressTracking();
      return;
    }

    clearLongPressTimer();
    longPressRef.current.pointerId = event.pointerId;
    longPressRef.current.startX = event.clientX;
    longPressRef.current.startY = event.clientY;
    longPressRef.current.cellKey = `${r}-${c}`;
    longPressRef.current.didFlag = false;
    longPressRef.current.suppressClick = false;

    longPressRef.current.timer = window.setTimeout(() => {
      longPressRef.current.timer = null;
      longPressRef.current.didFlag = true;
      longPressRef.current.suppressClick = true;
      toggleFlag(r, c);
      try {
        if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
      } catch {
        // ignore
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const lp = longPressRef.current;
    if (lp.pointerId !== event.pointerId || lp.timer === null) return;
    const dx = event.clientX - lp.startX;
    const dy = event.clientY - lp.startY;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      clearLongPressTimer();
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      longPressRef.current.pointerId !== null &&
      event.pointerId !== longPressRef.current.pointerId
    ) {
      return;
    }
    clearLongPressTimer();
    longPressRef.current.pointerId = null;
    longPressRef.current.cellKey = null;
  };

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

  const cellSize = 'minmax(0, 1fr)';

  return (
    <div
      className={`mines-page mines-playing mines-theme-${difficulty.accent}${mobilePlay ? ' is-mobile-play' : ''}`}
    >
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

        <div className={`mines-hud-actions${mobilePlay ? ' is-mobile-actions' : ''}`}>
          {mobilePlay ? (
            <div className="mines-mode-switch" role="group" aria-label="操作模式">
              <button
                type="button"
                className={`mines-ghost-button mines-mode-btn${!flagMode ? ' is-active' : ''}`}
                aria-pressed={!flagMode}
                onClick={() => setFlagMode(false)}
              >
                翻开
              </button>
              <button
                type="button"
                className={`mines-ghost-button mines-mode-btn is-flag${flagMode ? ' is-active' : ''}`}
                aria-pressed={flagMode}
                onClick={() => setFlagMode(true)}
              >
                插旗
              </button>
            </div>
          ) : null}
          <div className="mines-utility-actions">
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
        </div>
      </header>

      <div className="mines-board-shell" ref={boardShellRef}>
        <div
          className={`mines-board mines-board-${difficulty.id}`}
          style={{
            gridTemplateColumns: `repeat(${difficulty.cols}, ${cellSize})`,
            gridTemplateRows: `repeat(${difficulty.rows}, ${cellSize})`,
            ...(mobilePlay
              ? {
                  width: '100%',
                  maxWidth: '100%',
                  height: 'auto',
                  aspectRatio: '1',
                }
              : {}),
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
                  onPointerDown={(event) => handlePointerDown(event, r, c)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerCancel={handlePointerEnd}
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

      <p className="mines-tip">
        {mobilePlay
          ? flagMode
            ? '点击格子插旗'
            : '点击格子翻开'
          : '左键翻开 · 右键插旗 · 第一下保证安全'}
      </p>

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
