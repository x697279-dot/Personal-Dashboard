import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Segmented, Space } from 'antd';
import {
  COLOR_KEYS,
  COLOR_NAMES,
  ENTRY,
  HOME_LEN,
  PER_SIDE,
  RING,
  TAKEOFF_LABELS,
  chooseAiAction,
  createGame,
  movePiece,
  ringCell,
  rollDice,
  statusLabel,
  toPublicView,
  type FlyingState,
  type Piece,
  type PlayerCount,
  type PublicView,
  type Seat,
  type TakeoffMode,
} from './flying/engine';
import { connectFlying, looksLikePrivateHost } from './flying/net/client';
import type { FlyingServerToClient, LobbyPlayer } from './flying/net/protocol';
import { scrollToTop } from './scrollToTop';

type Screen = 'menu' | 'local-setup' | 'local' | 'lan-setup' | 'lan';
type Role = Seat | 'spectator';

function defaultLanHost() {
  if (typeof location === 'undefined') return '127.0.0.1';
  if (location.protocol === 'https:') return 'xjy-ws.onrender.com';
  const host = location.hostname;
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  return '127.0.0.1';
}

function delay(ms: number) {
  return new Promise<void>((r) => {
    window.setTimeout(r, ms);
  });
}

/** 环道 52 格坐标 */
function ringPoint(index: number): { x: number; y: number } {
  const side = Math.floor(index / PER_SIDE);
  const t = index % PER_SIDE;
  const a = 9.5;
  const b = 90.5;
  const step = (b - a) / PER_SIDE;
  if (side === 0) return { x: a + step * (t + 0.5), y: a };
  if (side === 1) return { x: b, y: a + step * (t + 0.5) };
  if (side === 2) return { x: b - step * (t + 0.5), y: b };
  return { x: a, y: b - step * (t + 0.5) };
}

function homePoint(seat: Seat, dist: number): { x: number; y: number } {
  const entry = ringPoint(ENTRY[seat]!);
  const t = (dist + 1) / (HOME_LEN + 1.35);
  return { x: entry.x + (50 - entry.x) * t, y: entry.y + (50 - entry.y) * t };
}

function baseOrigin(seat: Seat) {
  return [
    { x: 17.5, y: 17.5 },
    { x: 72.5, y: 17.5 },
    { x: 72.5, y: 72.5 },
    { x: 17.5, y: 72.5 },
  ][seat]!;
}

function basePoint(seat: Seat, pieceIndex: number): { x: number; y: number } {
  const o = baseOrigin(seat);
  const col = pieceIndex % 2;
  const row = Math.floor(pieceIndex / 2);
  return { x: o.x + 3.2 + col * 6.6, y: o.y + 3.2 + row * 6.6 };
}

/** 同格棋子错开，避免踩子看不清 */
function stackOffset(stackIndex: number, stackTotal: number) {
  if (stackTotal <= 1) return { x: 0, y: 0 };
  const a = (stackIndex / stackTotal) * Math.PI * 2 - Math.PI / 2;
  const r = 1.15;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

const PIP_MAP: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 22],
    [72, 22],
    [28, 50],
    [72, 50],
    [28, 78],
    [72, 78],
  ],
};

function useDiceAnim() {
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const play = (final: number, ms = 920) =>
    new Promise<void>((resolve) => {
      clearTimers();
      setRolling(true);
      const start = Date.now();
      const tick = () => {
        setShown(1 + Math.floor(Math.random() * 6));
        if (Date.now() - start < ms) {
          timers.current.push(window.setTimeout(tick, 68));
        } else {
          setShown(final);
          setRolling(false);
          resolve();
        }
      };
      tick();
    });

  return { rolling, shown, play, setShown };
}

function DiceWidget({ value, rolling }: { value: number | null; rolling: boolean }) {
  const face = value && value >= 1 && value <= 6 ? value : 1;
  const pips = value ? PIP_MAP[face] : [];
  return (
    <div className={`fly-dice-wrap${rolling ? ' is-rolling' : ''}${value ? ' has-value' : ''}`} aria-live="polite">
      <div className="fly-dice-cube" aria-label={rolling ? '骰子滚动中' : value ? `点数 ${value}` : '等待掷骰'}>
        {pips.map(([x, y], i) => (
          <i key={i} className="fly-dice-pip" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        {!value && !rolling ? <span className="fly-dice-q">?</span> : null}
      </div>
    </div>
  );
}

function BoardView({
  view,
  names,
  canAct,
  onSelectPiece,
  capturePulse,
}: {
  view: PublicView;
  names: string[];
  canAct: boolean;
  onSelectPiece: (pieceIndex: number) => void;
  capturePulse: boolean;
}) {
  const legal = new Set(view.legalMoves ?? []);
  const cellTone = ['red', 'yellow', 'blue', 'green'] as const;

  // 同格堆叠索引
  const stackKey = (seat: number, piece: Piece) => {
    if (piece.z === 'ring') return `r:${ringCell(seat as Seat, piece.dist)}`;
    if (piece.z === 'home') return `h:${seat}:${piece.dist}`;
    if (piece.z === 'done') return `d:${seat}`;
    return `b:${seat}`;
  };
  const stacks = new Map<string, Array<{ seat: number; pi: number }>>();
  view.pieces.forEach((row, seat) => {
    (row ?? []).forEach((piece, pi) => {
      if (piece.z === 'base') return;
      const key = stackKey(seat, piece);
      const list = stacks.get(key) ?? [];
      list.push({ seat, pi });
      stacks.set(key, list);
    });
  });

  const doorFrom = [
    { x: 28, y: 20 },
    { x: 80, y: 28 },
    { x: 72, y: 80 },
    { x: 20, y: 72 },
  ];

  return (
    <div className={`fly-board-shell${capturePulse ? ' is-capture' : ''}`}>
      <svg className="fly-board" viewBox="0 0 100 100" role="img" aria-label="飞行棋棋盘">
        <defs>
          <linearGradient id="flyWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0d9a8" />
            <stop offset="45%" stopColor="#e2b87a" />
            <stop offset="100%" stopColor="#c99552" />
          </linearGradient>
          <filter id="flySoft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.4" stdDeviation="0.35" floodOpacity="0.25" />
          </filter>
          <marker id="flyArrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
            <path d="M0,0 L4,2 L0,4 Z" fill="#92400e" />
          </marker>
        </defs>

        <rect className="fly-board-bg" x="1.2" y="1.2" width="97.6" height="97.6" rx="4" />
        <rect x="8" y="8" width="84" height="84" rx="2" fill="none" stroke="rgba(120,70,20,0.12)" strokeWidth="0.4" />

        {/* 基地 */}
        {(
          [
            [14, 14, 'red'],
            [64, 14, 'yellow'],
            [64, 64, 'blue'],
            [14, 64, 'green'],
          ] as const
        ).map(([x, y, key]) => (
          <g key={key}>
            <rect className={`fly-base fly-base-${key}`} x={x} y={y} width="22" height="22" rx="3" />
            {[0, 1, 2, 3].map((i) => {
              const bp = basePoint(
                key === 'red' ? 0 : key === 'yellow' ? 1 : key === 'blue' ? 2 : 3,
                i,
              );
              return (
                <circle key={i} className="fly-hangar" cx={bp.x} cy={bp.y} r="2.5" />
              );
            })}
          </g>
        ))}

        {/* 门口箭头：基地 → 起飞格 */}
        {([0, 1, 2, 3] as Seat[]).map((seat) => {
          const to = ringPoint(ENTRY[seat]!);
          const from = doorFrom[seat]!;
          return (
            <line
              key={`door-${seat}`}
              className={`fly-door fly-door-${COLOR_KEYS[seat]}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              markerEnd="url(#flyArrow)"
            />
          );
        })}

        {/* 环道 */}
        {Array.from({ length: RING }, (_, i) => {
          const p = ringPoint(i);
          const isEntry = ENTRY.includes(i);
          const seatAtDoor = ENTRY.indexOf(i);
          const tone = isEntry && seatAtDoor >= 0 ? COLOR_KEYS[seatAtDoor as Seat] : cellTone[i % 4];
          return (
            <rect
              key={`r${i}`}
              className={`fly-cell fly-cell-${tone}${isEntry ? ' is-entry' : ''}`}
              x={p.x - 1.45}
              y={p.y - 1.45}
              width="2.9"
              height="2.9"
              rx="0.55"
              filter={isEntry ? 'url(#flySoft)' : undefined}
            />
          );
        })}

        {/* 终点道 */}
        {([0, 1, 2, 3] as Seat[]).map((seat) =>
          Array.from({ length: HOME_LEN }, (_, d) => {
            const p = homePoint(seat, d);
            return (
              <rect
                key={`h${seat}-${d}`}
                className={`fly-home fly-home-${COLOR_KEYS[seat]}`}
                x={p.x - 1.25}
                y={p.y - 1.25}
                width="2.5"
                height="2.5"
                rx="0.45"
              />
            );
          }),
        )}

        <polygon className="fly-center-tri fly-home-red" points="50,43.5 43.5,50 50,50" />
        <polygon className="fly-center-tri fly-home-yellow" points="50,43.5 56.5,50 50,50" />
        <polygon className="fly-center-tri fly-home-blue" points="50,56.5 56.5,50 50,50" />
        <polygon className="fly-center-tri fly-home-green" points="50,56.5 43.5,50 50,50" />
        <circle cx="50" cy="50" r="2.2" fill="#fff8eb" stroke="#b45309" strokeWidth="0.35" />

        {/* 棋子 */}
        {view.pieces.map((row, seat) =>
          (row ?? []).map((piece, pi) => {
            let pt =
              piece.z === 'base'
                ? basePoint(seat as Seat, pi)
                : piece.z === 'done'
                  ? {
                      x: 50 + (seat === 0 || seat === 3 ? -4.2 : 4.2) + ((pi % 2) * 2 - 1) * 1.1,
                      y: 50 + (seat === 0 || seat === 1 ? -4.2 : 4.2) + (Math.floor(pi / 2) * 2 - 1) * 1.1,
                    }
                  : piece.z === 'ring'
                    ? ringPoint(ringCell(seat as Seat, piece.dist))
                    : homePoint(seat as Seat, piece.dist);

            if (piece.z !== 'base' && piece.z !== 'done') {
              const key = stackKey(seat, piece);
              const group = stacks.get(key) ?? [];
              const idx = group.findIndex((g) => g.seat === seat && g.pi === pi);
              const off = stackOffset(Math.max(0, idx), group.length);
              pt = { x: pt.x + off.x, y: pt.y + off.y };
            }

            const mineSelectable =
              canAct && view.phase === 'move' && view.turn === (seat as Seat) && legal.has(pi);

            return (
              <g
                key={`p${seat}-${pi}`}
                className={`fly-piece fly-piece-${COLOR_KEYS[seat as Seat]}${mineSelectable ? ' is-legal' : ''}`}
                transform={`translate(${pt.x} ${pt.y})`}
                filter="url(#flySoft)"
                onClick={() => {
                  if (mineSelectable) onSelectPiece(pi);
                }}
                role={mineSelectable ? 'button' : undefined}
              >
                <circle className="fly-piece-disk" r="2.05" />
                <circle className="fly-piece-shine" cx="-0.55" cy="-0.55" r="0.7" />
                <text y="0.75" textAnchor="middle">
                  {pi + 1}
                </text>
              </g>
            );
          }),
        )}

        {[
          [15.5, 12.2, 0],
          [84.5, 12.2, 1],
          [84.5, 91.8, 2],
          [15.5, 91.8, 3],
        ].map(([x, y, seat]) =>
          seat < view.playerCount ? (
            <text
              key={`n${seat}`}
              className={`fly-name${view.turn === seat ? ' is-turn' : ''}`}
              x={x as number}
              y={y as number}
              textAnchor={seat === 0 || seat === 3 ? 'start' : 'end'}
            >
              {names[seat as number] || COLOR_NAMES[seat as Seat]}
            </text>
          ) : null,
        )}
      </svg>
      {capturePulse ? <div className="fly-capture-banner">撞飞！对方回基地</div> : null}
    </div>
  );
}

function FlyingChessPage() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [localCount, setLocalCount] = useState<PlayerCount>(2);
  const [localAi, setLocalAi] = useState(true);
  const [localTakeoff, setLocalTakeoff] = useState<TakeoffMode>('246');
  const [local, setLocal] = useState<FlyingState | null>(null);
  const [localNames, setLocalNames] = useState<string[]>(['我', '电脑']);
  const aiBusy = useRef(false);
  const dice = useDiceAnim();
  const [capturePulse, setCapturePulse] = useState(false);
  const captureTimer = useRef(0);
  const lastLanDice = useRef<number | null>(null);

  const [lanName, setLanName] = useState('玩家');
  const [lanRoom, setLanRoom] = useState('fly1');
  const [lanHost, setLanHost] = useState(defaultLanHost());
  const [lanPort, setLanPort] = useState(
    typeof location !== 'undefined' && location.protocol === 'https:' ? '443' : '3789',
  );
  const [lanMsg, setLanMsg] = useState('');
  const [lanRole, setLanRole] = useState<Role | null>(null);
  const [lanHostSeat, setLanHostSeat] = useState<Seat>(0);
  const [lanCount, setLanCount] = useState<PlayerCount>(4);
  const [lanTakeoff, setLanTakeoff] = useState<TakeoffMode>('246');
  const [lanLobby, setLanLobby] = useState<LobbyPlayer[]>([]);
  const [lanSpectators, setLanSpectators] = useState<Array<{ name: string }>>([]);
  const [lanView, setLanView] = useState<PublicView | null>(null);
  const [lanNames, setLanNames] = useState<string[]>([]);
  const socketRef = useRef<ReturnType<typeof connectFlying> | null>(null);
  const spectators = lanSpectators ?? [];
  const lobby = lanLobby ?? [];

  const pulseCapture = (log: string) => {
    if (!log.includes('撞飞')) return;
    setCapturePulse(true);
    window.clearTimeout(captureTimer.current);
    captureTimer.current = window.setTimeout(() => setCapturePulse(false), 1200);
  };

  useEffect(() => {
    scrollToTop(['.fly-page']);
    return () => {
      socketRef.current?.close();
      window.clearTimeout(captureTimer.current);
    };
  }, []);

  const localView = useMemo(() => (local ? toPublicView(local) : null), [local]);
  const localRef = useRef(local);
  localRef.current = local;

  useEffect(() => {
    if (local?.log) pulseCapture(local.log);
  }, [local?.log]);

  // 本地 AI：不依赖 dice.rolling，避免掷骰动画反复打断导致一直重掷
  useEffect(() => {
    if (screen !== 'local' || !localAi || localCount !== 2) return;
    if (!local || local.phase === 'finished' || local.turn !== 1) return;
    if (aiBusy.current) return;

    let cancelled = false;
    aiBusy.current = true;

    const run = async () => {
      await delay(360);
      while (!cancelled) {
        const cur = localRef.current;
        if (!cur || cur.turn !== 1 || cur.phase === 'finished') break;

        if (cur.phase === 'roll') {
          const forced = 1 + Math.floor(Math.random() * 6);
          await dice.play(forced, 780);
          if (cancelled) break;
          setLocal((prev) => {
            if (!prev || prev.turn !== 1 || prev.phase !== 'roll') return prev;
            const r = rollDice(prev, 1, forced);
            if (r.ok) {
              localRef.current = r.state;
              return r.state;
            }
            return prev;
          });
          await delay(60);
          continue;
        }

        if (cur.phase === 'move') {
          const act = chooseAiAction(cur, 1);
          if (!act || act.type !== 'move') break;
          await delay(320);
          if (cancelled) break;
          setLocal((prev) => {
            if (!prev || prev.turn !== 1 || prev.phase !== 'move') return prev;
            const r = movePiece(prev, 1, act.pieceIndex);
            if (r.ok) {
              localRef.current = r.state;
              return r.state;
            }
            return prev;
          });
          await delay(60);
          continue;
        }

        break;
      }
      if (!cancelled) aiBusy.current = false;
    };

    void run();
    return () => {
      cancelled = true;
      aiBusy.current = false;
    };
  }, [screen, localAi, localCount, local?.turn, local?.phase, local?.dice]);

  const startLocal = () => {
    const names =
      localAi && localCount === 2
        ? ['我', '电脑']
        : Array.from({ length: localCount }, (_, i) => `${COLOR_NAMES[i]}方`);
    setLocalNames(names);
    setLocal(createGame(localCount, localTakeoff));
    dice.setShown(null);
    setScreen('local');
  };

  const rollLocal = async () => {
    if (!local || dice.rolling || local.phase !== 'roll') return;
    const seat = local.turn;
    const forced = 1 + Math.floor(Math.random() * 6);
    await dice.play(forced);
    setLocal((prev) => {
      if (!prev || prev.phase !== 'roll' || prev.turn !== seat) return prev;
      const r = rollDice(prev, seat, forced);
      return r.ok ? r.state : prev;
    });
  };

  const connectLan = () => {
    socketRef.current?.close();
    if (location.protocol === 'https:' && looksLikePrivateHost(lanHost)) {
      setLanMsg('HTTPS 站点无法直连局域网 IP，请填 xjy-ws.onrender.com');
      return;
    }
    setLanMsg('连接中…');
    setLanRole(null);
    setLanLobby([]);
    setLanView(null);
    lastLanDice.current = null;
    try {
      const sock = connectFlying(lanHost, lanPort, {
        onOpen: () => {
          sock.send({ type: 'join', game: 'flying', roomId: lanRoom.trim() || 'fly1', name: lanName.trim() || '玩家' });
        },
        onClose: () => setLanMsg('连接已断开'),
        onError: () => setLanMsg('连接失败，请检查地址/服务'),
        onMessage: (msg: FlyingServerToClient) => {
          if (msg.type === 'error') {
            setLanMsg(msg.message);
            return;
          }
          if (msg.type === 'info') {
            setLanMsg(msg.message);
            return;
          }
          if (msg.type === 'welcome') {
            setLanRole(msg.seat);
            setLanMsg(msg.seat === 'spectator' ? '已进入观战' : `已入座 · ${COLOR_NAMES[msg.seat]}方`);
            setScreen('lan');
            return;
          }
          if (msg.type === 'lobby') {
            setLanLobby(msg.players ?? []);
            setLanSpectators(msg.spectators ?? []);
            setLanHostSeat(msg.hostSeat);
            setLanCount(msg.playerCount);
            if (msg.takeoffMode) setLanTakeoff(msg.takeoffMode);
            return;
          }
          if (msg.type === 'state') {
            setLanView(msg.view);
            setLanNames(msg.names);
            setLanRole(msg.you);
            setLanMsg(msg.view.log);
            pulseCapture(msg.view.log);
            if (msg.view.dice != null && msg.view.dice !== lastLanDice.current) {
              lastLanDice.current = msg.view.dice;
              void dice.play(msg.view.dice, 880);
            }
            if (msg.view.dice == null && msg.view.phase === 'roll') {
              lastLanDice.current = null;
            }
          }
        },
      });
      socketRef.current = sock;
      setLanMsg(`正在连接 ${sock.url}`);
    } catch (e) {
      setLanMsg(e instanceof Error ? e.message : '连接失败');
    }
  };

  const lanIsHost = lanRole !== null && lanRole !== 'spectator' && lanRole === lanHostSeat;
  const allReady = lobby.length === lanCount && lobby.every((p) => p.name && p.ready && p.connected);

  if (screen === 'menu') {
    return (
      <div className="fly-page">
        <Button className="fly-back" onClick={() => { window.location.hash = '#/'; }}>
          返回主页
        </Button>
        <section className="fly-hero">
          <p className="fly-kicker">FLYING CHESS · CAPYLULU</p>
          <h1>
            <span>飞行棋</span>
            <span>轻量版</span>
          </h1>
          <p className="fly-subtitle">自家门口起飞 · 踩子回营 · 掷骰动画 · 2～4 人家庭局</p>
          <div className="fly-mode-grid">
            <button type="button" className="fly-mode-card" onClick={() => setScreen('local-setup')}>
              <span className="fly-mode-badge">LOCAL</span>
              <strong>同屏 / 人机</strong>
              <em>一台设备轮流玩，或 1v1 电脑</em>
            </button>
            <button type="button" className="fly-mode-card" onClick={() => setScreen('lan-setup')}>
              <span className="fly-mode-badge">ONLINE</span>
              <strong>联机房间</strong>
              <em>2～4 人在线同步，满员可观战</em>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (screen === 'local-setup') {
    return (
      <div className="fly-page">
        <Button className="fly-back" onClick={() => setScreen('menu')}>
          返回
        </Button>
        <section className="fly-setup fly-setup-rich">
          <div className="fly-setup-head">
            <p className="fly-kicker">LOCAL MATCH</p>
            <h2>本地飞行棋</h2>
            <span>选好人数与起飞规则，从自家门口起飞开玩</span>
          </div>
          <div className="fly-field">
            <span className="fly-field-label">人数</span>
            <Segmented
              block
              value={localCount}
              onChange={(v) => setLocalCount(v as PlayerCount)}
              options={[
                { label: '2 人', value: 2 },
                { label: '3 人', value: 3 },
                { label: '4 人', value: 4 },
              ]}
            />
          </div>
          <div className="fly-field">
            <span className="fly-field-label">起飞点数</span>
            <Segmented
              block
              value={localTakeoff}
              onChange={(v) => setLocalTakeoff(v as TakeoffMode)}
              options={[
                { label: TAKEOFF_LABELS['246'], value: '246' },
                { label: TAKEOFF_LABELS['56'], value: '56' },
                { label: TAKEOFF_LABELS['6'], value: '6' },
              ]}
            />
          </div>
          {localCount === 2 ? (
            <div className="fly-check-card">
              <Checkbox checked={localAi} onChange={(e) => setLocalAi(e.target.checked)}>
                <span className="fly-check-copy">
                  <strong>第二位由电脑操控</strong>
                  <em>人机对战，黄方自动走子</em>
                </span>
              </Checkbox>
            </div>
          ) : (
            <p className="fly-hint">多人同屏：轮到谁谁掷骰、点飞机</p>
          )}
          <Button type="primary" size="large" block onClick={startLocal}>
            开始对局
          </Button>
        </section>
      </div>
    );
  }

  if (screen === 'lan-setup') {
    const https = location.protocol === 'https:';
    return (
      <div className="fly-page">
        <Button className="fly-back" onClick={() => setScreen('menu')}>
          返回
        </Button>
        <section className="fly-setup fly-setup-rich">
          <div className="fly-setup-head">
            <p className="fly-kicker">ONLINE ROOM</p>
            <h2>联机飞行棋</h2>
          </div>
          <label className="fly-antd-field">
            昵称
            <Input value={lanName} maxLength={12} onChange={(e) => setLanName(e.target.value)} />
          </label>
          <label className="fly-antd-field">
            房间号
            <Input value={lanRoom} onChange={(e) => setLanRoom(e.target.value)} />
          </label>
          <label className="fly-antd-field">
            服务器地址
            <Input value={lanHost} onChange={(e) => setLanHost(e.target.value)} />
          </label>
          <label className="fly-antd-field">
            端口
            <Input value={lanPort} readOnly={https} disabled={https} onChange={(e) => setLanPort(e.target.value)} />
          </label>
          <Button type="primary" size="large" block onClick={connectLan}>
            连接并加入
          </Button>
          {lanMsg ? <p className="fly-msg">{lanMsg}</p> : null}
        </section>
      </div>
    );
  }

  if (screen === 'local' && localView) {
    const humanTurn = !(localAi && localCount === 2 && localView.turn !== 0);
    const canAct = humanTurn && localView.phase !== 'finished' && !dice.rolling;
    return (
      <div className="fly-page fly-playing">
        <header className="fly-hud">
          <Button size="small" onClick={() => setScreen('menu')}>
            退出
          </Button>
          <div className="fly-hud-meta">
            <strong>{statusLabel(localView)}</strong>
            <span>{localView.log}</span>
          </div>
          <DiceWidget value={dice.shown ?? localView.dice} rolling={dice.rolling} />
        </header>
        <BoardView
          view={localView}
          names={localNames}
          canAct={canAct && localView.phase === 'move'}
          onSelectPiece={(pi) => {
            if (!local || dice.rolling) return;
            const r = movePiece(local, local.turn, pi);
            if (r.ok) setLocal(r.state);
          }}
          capturePulse={capturePulse}
        />
        <Space wrap className="fly-actions-antd" size="middle">
          <Button
            type="primary"
            size="large"
            disabled={!canAct || localView.phase !== 'roll'}
            onClick={() => void rollLocal()}
          >
            {dice.rolling ? '骰子滚动中…' : '掷骰子'}
          </Button>
          <Button size="large" onClick={startLocal}>
            重开
          </Button>
        </Space>
        <p className="fly-tip">
          {localView.phase === 'move' && canAct
            ? '点亮的飞机可走 · 踩到对手会撞飞回基地'
            : `门口起飞 ${TAKEOFF_LABELS[localView.takeoffMode]} · 撞飞/6 点再掷 · 终点需正好`}
        </p>
      </div>
    );
  }

  const meReady = lanRole !== null && lanRole !== 'spectator' && Boolean(lobby[lanRole]?.ready);
  const canLanAct =
    Boolean(lanView) &&
    lanRole !== null &&
    lanRole !== 'spectator' &&
    lanView!.phase !== 'finished' &&
    lanView!.turn === lanRole &&
    !dice.rolling;

  return (
    <div className="fly-page fly-playing">
      <header className="fly-hud">
        <Button
          size="small"
          onClick={() => {
            socketRef.current?.close();
            setScreen('lan-setup');
            setLanView(null);
            setLanLobby([]);
            setLanSpectators([]);
          }}
        >
          断开
        </Button>
        <div className="fly-hud-meta">
          <strong>
            房间 {lanRoom}
            {lanRole === 'spectator' ? ' · 观战' : lanRole != null ? ` · ${COLOR_NAMES[lanRole]}方` : ''}
          </strong>
          <span>{lanMsg}</span>
        </div>
        {spectators.length > 0 ? (
          <div className="fly-watch-badge">
            {spectators.length === 1
              ? `${spectators[0]!.name} 正在观战`
              : `${spectators.length}人正在观战`}
          </div>
        ) : null}
        <DiceWidget value={dice.shown ?? lanView?.dice ?? null} rolling={dice.rolling} />
      </header>

      {!lanView ? (
        <section className="fly-lobby fly-setup-rich">
          <div className="fly-setup-head">
            <h2>房间大厅 · {lanCount} 人局</h2>
            <span>起飞点数 {TAKEOFF_LABELS[lanTakeoff]} · 从自家门口起飞</span>
          </div>
          {lanIsHost ? (
            <>
              <div className="fly-field">
                <span className="fly-field-label">人数</span>
                <Segmented
                  block
                  value={lanCount}
                  onChange={(v) => socketRef.current?.send({ type: 'setPlayerCount', count: v as PlayerCount })}
                  options={[
                    { label: '2人', value: 2 },
                    { label: '3人', value: 3 },
                    { label: '4人', value: 4 },
                  ]}
                />
              </div>
              <div className="fly-field">
                <span className="fly-field-label">起飞</span>
                <Segmented
                  block
                  value={lanTakeoff}
                  onChange={(v) => socketRef.current?.send({ type: 'setTakeoffMode', mode: v as TakeoffMode })}
                  options={[
                    { label: TAKEOFF_LABELS['246'], value: '246' },
                    { label: TAKEOFF_LABELS['56'], value: '56' },
                    { label: TAKEOFF_LABELS['6'], value: '6' },
                  ]}
                />
              </div>
            </>
          ) : null}
          <div className="fly-lobby-seats">
            {lobby.map((p) => (
              <article
                key={p.seat}
                className={`fly-lobby-seat fly-seat-${COLOR_KEYS[p.seat]}${p.ready ? ' is-ready' : ''}${lanRole === p.seat ? ' is-me' : ''}`}
              >
                <strong>
                  {COLOR_NAMES[p.seat]}方
                  {lanRole === p.seat ? ' · 我' : ''}
                  {lanHostSeat === p.seat ? ' · 房主' : ''}
                </strong>
                <span>{p.name || '等待加入…'}</span>
                <em>{!p.name ? '空位' : !p.connected ? '离线' : p.ready ? '已准备' : '已入座'}</em>
              </article>
            ))}
          </div>
          <Space wrap className="fly-actions-antd">
            {lanRole !== null && lanRole !== 'spectator' ? (
              <Button onClick={() => socketRef.current?.send({ type: 'ready', ready: !meReady })}>
                {meReady ? '取消准备' : '准备'}
              </Button>
            ) : null}
            {lanIsHost ? (
              <Button type="primary" disabled={!allReady} onClick={() => socketRef.current?.send({ type: 'start' })}>
                开始对局
              </Button>
            ) : (
              <p className="fly-msg">等待房主开始…</p>
            )}
          </Space>
        </section>
      ) : (
        <>
          <BoardView
            view={lanView}
            names={lanNames}
            canAct={canLanAct && lanView.phase === 'move'}
            onSelectPiece={(pi) => socketRef.current?.send({ type: 'move', pieceIndex: pi })}
            capturePulse={capturePulse}
          />
          <Space wrap className="fly-actions-antd" size="middle">
            {canLanAct && lanView.phase === 'roll' ? (
              <Button
                type="primary"
                size="large"
                disabled={dice.rolling}
                onClick={() => socketRef.current?.send({ type: 'roll' })}
              >
                {dice.rolling ? '骰子滚动中…' : '掷骰子'}
              </Button>
            ) : null}
            {lanView.phase === 'finished' && lanRole !== 'spectator' ? (
              <>
                <Button onClick={() => socketRef.current?.send({ type: 'ready', ready: !meReady })}>
                  {meReady ? '取消准备' : '准备下一局'}
                </Button>
                {lanIsHost ? (
                  <Button type="primary" disabled={!allReady} onClick={() => socketRef.current?.send({ type: 'start' })}>
                    开始下一局
                  </Button>
                ) : null}
              </>
            ) : null}
          </Space>
          <p className="fly-tip">{lanView.log}</p>
        </>
      )}
    </div>
  );
}

export { FlyingChessPage };
