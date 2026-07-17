import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Space } from 'antd';
import {
  BOARD_SIZE,
  TURN_MS,
  applyTimeout,
  chooseAiMove,
  createGame,
  placeStone,
  resign,
  requestUndo,
  respondUndo,
  statusLabel,
  toPublicView,
  type GomokuState,
  type PublicView,
  type Seat,
} from './gomoku/engine';
import { connectGomoku, looksLikePrivateHost } from './gomoku/net/client';
import type { GomokuServerToClient, LobbyPlayer } from './gomoku/net/protocol';
import { scrollToTop } from './scrollToTop';

type Screen = 'menu' | 'solo' | 'lan-setup' | 'lan';
type Role = Seat | 'spectator';

function defaultLanHost() {
  if (typeof location === 'undefined') return '127.0.0.1';
  if (location.protocol === 'https:') return 'xjy-ws.onrender.com';
  const host = location.hostname;
  // 手机用局域网 IP 打开页面时，WS 也应指向同一台电脑，不能填 127.0.0.1
  if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  return '127.0.0.1';
}

const defaultOnlineHost = defaultLanHost();

const STAR_POINTS: Array<[number, number]> = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
];

/** 与 styles.css 中 --pad: calc(var(--gap) * 0.58) 保持一致 */
const BOARD_PAD_RATIO = 0.58;

function BoardView({
  view,
  canPlace,
  previewStone,
  onPlace,
}: {
  view: PublicView;
  canPlace: boolean;
  /** 拖动预览棋子颜色：1 黑 · 2 白 */
  previewStone: 1 | 2;
  onPlace: (r: number, c: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const last = view.lastMove;
  const n = BOARD_SIZE;

  const snapFromPointer = (clientX: number, clientY: number) => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    // width = 2*pad + gap*(n-1), pad = ratio*gap
    const gap = rect.width / (n - 1 + 2 * BOARD_PAD_RATIO);
    const pad = BOARD_PAD_RATIO * gap;
    const x = clientX - rect.left - pad;
    const y = clientY - rect.top - pad;
    const c = Math.max(0, Math.min(n - 1, Math.round(x / gap)));
    const r = Math.max(0, Math.min(n - 1, Math.round(y / gap)));
    return { r, c };
  };

  const endDrag = (clientX: number, clientY: number) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pos = snapFromPointer(clientX, clientY);
    setHover(null);
    if (!canPlace || !pos) return;
    if (view.board[pos.r]?.[pos.c] !== 0) return;
    onPlace(pos.r, pos.c);
  };

  const gridMax = n - 1;

  return (
    <div
      ref={boardRef}
      className={`gomoku-board${canPlace ? ' is-interactive' : ''}`}
      role="grid"
      aria-label="五子棋棋盘，按住拖动到交叉点松手落子"
      style={{ ['--gomoku-n' as string]: n }}
      onPointerDown={(e) => {
        if (!canPlace || e.button !== 0) return;
        e.preventDefault();
        draggingRef.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setHover(snapFromPointer(e.clientX, e.clientY));
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        setHover(snapFromPointer(e.clientX, e.clientY));
      }}
      onPointerUp={(e) => endDrag(e.clientX, e.clientY)}
      onPointerCancel={() => {
        draggingRef.current = false;
        setHover(null);
      }}
    >
      <svg className="gomoku-lines" viewBox={`0 0 ${gridMax} ${gridMax}`} aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <line key={`h${i}`} x1={0} y1={i} x2={gridMax} y2={i} />
        ))}
        {Array.from({ length: n }, (_, i) => (
          <line key={`v${i}`} x1={i} y1={0} x2={i} y2={gridMax} />
        ))}
        {STAR_POINTS.map(([r, c]) => (
          <circle key={`s${r}-${c}`} cx={c} cy={r} r={0.12} />
        ))}
      </svg>

      {view.board.map((row, r) =>
        row.map((cell, c) => {
          if (cell === 0) return null;
          const isLast = Boolean(last && last.r === r && last.c === c);
          return (
            <span
              key={`${r}-${c}`}
              className={`gomoku-stone ${cell === 1 ? 'is-black' : 'is-white'}${isLast ? ' is-last' : ''}`}
              style={{
                left: `calc(var(--pad) + var(--gap) * ${c})`,
                top: `calc(var(--pad) + var(--gap) * ${r})`,
              }}
            />
          );
        }),
      )}

      {canPlace && hover && view.board[hover.r]?.[hover.c] === 0 ? (
        <span
          className={`gomoku-stone is-ghost ${previewStone === 1 ? 'is-black' : 'is-white'}`}
          style={{
            left: `calc(var(--pad) + var(--gap) * ${hover.c})`,
            top: `calc(var(--pad) + var(--gap) * ${hover.r})`,
          }}
        />
      ) : null}
    </div>
  );
}

function useCountdown(deadline: number, active: boolean) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active || !deadline) {
      setLeft(0);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [deadline, active]);
  return left;
}

function GomokuPage() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [solo, setSolo] = useState<GomokuState | null>(null);
  const [soloMsg, setSoloMsg] = useState('');
  const aiThinking = useRef(false);

  const [lanName, setLanName] = useState('玩家');
  const [lanRoom, setLanRoom] = useState('gomoku1');
  const [lanHost, setLanHost] = useState(defaultOnlineHost);
  const [lanPort, setLanPort] = useState(
    typeof location !== 'undefined' && location.protocol === 'https:' ? '443' : '3789',
  );
  const [lanMsg, setLanMsg] = useState('');
  const [lanRole, setLanRole] = useState<Role | null>(null);
  const [lanHostSeat, setLanHostSeat] = useState<Seat>(0);
  const [lanLobby, setLanLobby] = useState<[LobbyPlayer, LobbyPlayer] | null>(null);
  const [lanSpectators, setLanSpectators] = useState<Array<{ name: string }>>([]);
  const [lanView, setLanView] = useState<PublicView | null>(null);
  const [lanNames, setLanNames] = useState<[string, string]>(['黑方', '白方']);
  const socketRef = useRef<ReturnType<typeof connectGomoku> | null>(null);

  useEffect(() => {
    scrollToTop(['.gomoku-page']);
    return () => {
      socketRef.current?.close();
    };
  }, []);

  const soloView = useMemo(() => (solo ? toPublicView(solo) : null), [solo]);
  const activeView = screen === 'solo' ? soloView : screen === 'lan' ? lanView : null;
  const countdown = useCountdown(
    activeView?.turnDeadline ?? 0,
    Boolean(activeView && activeView.status === 'playing'),
  );

  // 人机：AI 行棋
  useEffect(() => {
    if (screen !== 'solo' || !solo || solo.status !== 'playing') return;
    if (solo.turn !== 1) return; // AI 固定白棋
    if (aiThinking.current) return;
    aiThinking.current = true;
    const id = window.setTimeout(() => {
      setSolo((prev) => {
        if (!prev || prev.turn !== 1 || prev.status !== 'playing') return prev;
        const move = chooseAiMove(prev, 1);
        if (!move) return prev;
        const result = placeStone(prev, 1, move.r, move.c);
        return result.ok ? result.state : prev;
      });
      aiThinking.current = false;
    }, 380);
    return () => {
      window.clearTimeout(id);
      aiThinking.current = false;
    };
  }, [screen, solo]);

  // 人机：本地超时
  useEffect(() => {
    if (screen !== 'solo' || !solo || solo.status !== 'playing') return;
    const id = window.setInterval(() => {
      setSolo((prev) => {
        if (!prev || prev.status !== 'playing') return prev;
        return applyTimeout(prev);
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [screen, solo?.status, solo?.turnDeadline]);

  const startSolo = () => {
    setSolo(createGame());
    setSoloMsg('你执黑先行 · 电脑执白');
    setScreen('solo');
    scrollToTop(['.gomoku-page']);
  };

  const soloPlace = (r: number, c: number) => {
    if (!solo || solo.turn !== 0) return;
    const result = placeStone(solo, 0, r, c);
    if (!result.ok) {
      setSoloMsg(result.error);
      return;
    }
    setSolo(result.state);
    setSoloMsg(result.state.status === 'playing' ? '电脑思考中…' : statusLabel(result.state.status));
  };

  const connectLan = () => {
    socketRef.current?.close();
    const pageHttps = location.protocol === 'https:';
    if (pageHttps && looksLikePrivateHost(lanHost)) {
      setLanMsg('HTTPS 站点无法直连局域网 IP，请填 xjy-ws.onrender.com');
      return;
    }
    setLanMsg('连接中…');
    setLanRole(null);
    setLanLobby(null);
    setLanView(null);
    try {
      const sock = connectGomoku(lanHost, lanPort, {
        onOpen: () => {
          sock.send({ type: 'join', game: 'gomoku', roomId: lanRoom.trim() || 'gomoku1', name: lanName.trim() || '玩家' });
        },
        onClose: () => setLanMsg('连接已断开'),
        onError: () => setLanMsg('连接失败，请检查地址/服务是否启动'),
        onMessage: (msg: GomokuServerToClient) => {
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
            setLanMsg(msg.seat === 'spectator' ? '已进入观战' : `已入座 · ${msg.seat === 0 ? '黑方' : '白方'}`);
            setScreen('lan');
            return;
          }
          if (msg.type === 'lobby') {
            setLanLobby(msg.players);
            setLanSpectators(msg.spectators);
            setLanHostSeat(msg.hostSeat);
            return;
          }
          if (msg.type === 'state') {
            setLanView(msg.view);
            setLanNames(msg.names);
            setLanRole(msg.you);
            if (msg.view.status !== 'playing') {
              setLanMsg(statusLabel(msg.view.status));
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

  if (screen === 'menu') {
    return (
      <div className="gomoku-page">
        <Button onClick={() => { window.location.hash = '#/'; }}>返回主页</Button>
        <section className="gomoku-hero">
          <p className="gomoku-kicker">GOMOKU · CAPYLULU</p>
          <h1>
            <span>五子棋</span>
            <span>1v1 对弈</span>
          </h1>
          <p className="gomoku-subtitle">15×15 标准棋盘 · 30 秒行棋 · 悔棋需对方同意 · 支持观战</p>
          <div className="gomoku-mode-grid">
            <button type="button" className="gomoku-mode-card" onClick={startSolo}>
              <span className="gomoku-mode-badge">SOLO</span>
              <strong>人机对战</strong>
              <em>你执黑，电脑执白，本地练手</em>
            </button>
            <button type="button" className="gomoku-mode-card" onClick={() => setScreen('lan-setup')}>
              <span className="gomoku-mode-badge">ONLINE</span>
              <strong>联机对战</strong>
              <em>两人开房 · 第三人起自动观战</em>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (screen === 'lan-setup') {
    const https = location.protocol === 'https:';
    return (
      <div className="gomoku-page">
        <Button onClick={() => setScreen('menu')}>返回</Button>
        <section className="gomoku-setup">
          <h2>联机五子棋</h2>
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
            <Input
              value={lanHost}
              placeholder={https ? 'xjy-ws.onrender.com' : '192.168.1.8'}
              onChange={(e) => setLanHost(e.target.value)}
            />
          </label>
          <label className="fly-antd-field">
            端口
            <Input value={lanPort} readOnly={https} disabled={https} onChange={(e) => setLanPort(e.target.value)} />
          </label>
          <Button type="primary" size="large" block onClick={connectLan}>
            连接并加入
          </Button>
          {lanMsg ? <p className="gomoku-msg">{lanMsg}</p> : null}
        </section>
      </div>
    );
  }

  if (screen === 'solo' && soloView) {
    const canPlace = soloView.status === 'playing' && soloView.turn === 0;
    return (
      <div className="gomoku-page gomoku-playing">
        <header className="gomoku-hud">
          <Button size="small" onClick={() => setScreen('menu')}>
            退出
          </Button>
          <div className="gomoku-hud-meta">
            <strong>人机 · 你执黑</strong>
            <span>
              {soloView.status === 'playing'
                ? `${soloView.turn === 0 ? '你的回合' : '电脑回合'} · ${countdown}s`
                : statusLabel(soloView.status)}
            </span>
          </div>
          <Space wrap size="small">
            <Button
              disabled={soloView.status !== 'playing' || soloView.turn === 0 || !soloView.moves.length}
              onClick={() => {
                if (!solo) return;
                const req = requestUndo(solo, 0);
                if (!req.ok) {
                  setSoloMsg(req.error);
                  return;
                }
                const res = respondUndo(req.state, 1, true);
                if (res.ok) {
                  setSolo(res.state);
                  setSoloMsg('已悔棋');
                }
              }}
            >
              悔棋
            </Button>
            <Button
              disabled={soloView.status !== 'playing'}
              onClick={() => {
                if (!solo) return;
                setSolo(resign(solo, 0));
                setSoloMsg('你认输了');
              }}
            >
              认输
            </Button>
            <Button onClick={startSolo}>重开</Button>
          </Space>
        </header>
        <div className="gomoku-timer-bar">
          <i style={{ width: `${soloView.status === 'playing' ? (countdown / (TURN_MS / 1000)) * 100 : 0}%` }} />
        </div>
        <BoardView view={soloView} canPlace={canPlace} previewStone={1} onPlace={soloPlace} />
        <p className="gomoku-tip">{soloMsg || '按住拖动到交叉点，松手落子（最边缘也可下）'}</p>
      </div>
    );
  }

  // lan
  const meReady = lanRole !== null && lanRole !== 'spectator' && Boolean(lanLobby?.[lanRole]?.ready);
  const bothReady = Boolean(lanLobby?.[0]?.ready && lanLobby?.[1]?.ready && lanLobby[0].connected && lanLobby[1].connected);
  const canLanPlace =
    Boolean(lanView) &&
    lanView!.status === 'playing' &&
    lanRole !== null &&
    lanRole !== 'spectator' &&
    lanView!.turn === lanRole &&
    !lanView!.pendingUndo;

  return (
    <div className="gomoku-page gomoku-playing">
      <header className="gomoku-hud">
        <Button
          size="small"
          onClick={() => {
            socketRef.current?.close();
            setScreen('lan-setup');
            setLanView(null);
            setLanLobby(null);
          }}
        >
          断开
        </Button>
        <div className="gomoku-hud-meta">
          <strong>
            房间 {lanRoom}
            {lanRole === 'spectator' ? ' · 观战' : lanRole === 0 ? ' · 黑方' : lanRole === 1 ? ' · 白方' : ''}
          </strong>
          <span>{lanMsg}</span>
        </div>
        {lanSpectators.length > 0 ? (
          <div className="gomoku-watch-badge" title={lanSpectators.map((s) => s.name).join('、')}>
            {lanSpectators.length === 1
              ? `${lanSpectators[0]!.name} 正在观战`
              : `${lanSpectators.length}人正在观战`}
          </div>
        ) : null}
      </header>

      {!lanView ? (
        <section className="gomoku-lobby">
          <h2>房间大厅</h2>
          <div className="gomoku-lobby-seats">
            {([0, 1] as Seat[]).map((seat) => {
              const p = lanLobby?.[seat];
              return (
                <article key={seat} className={`gomoku-lobby-seat ${p?.ready ? 'is-ready' : ''} ${lanRole === seat ? 'is-me' : ''}`}>
                  <strong>
                    {seat === 0 ? '黑方' : '白方'}
                    {lanRole === seat ? ' · 我' : ''}
                    {lanHostSeat === seat ? ' · 房主' : ''}
                  </strong>
                  <span>{p?.name || '等待加入…'}</span>
                  <em>{!p?.name ? '空位' : !p.connected ? '离线' : p.ready ? '已准备' : '已入座'}</em>
                </article>
              );
            })}
          </div>
          {lanSpectators.length ? (
            <p className="gomoku-spectators">观战：{lanSpectators.map((s) => s.name).join('、')}</p>
          ) : null}
          <Space wrap className="gomoku-lobby-actions">
            {lanRole !== null && lanRole !== 'spectator' ? (
              <Button onClick={() => socketRef.current?.send({ type: 'ready', ready: !meReady })}>
                {meReady ? '取消准备' : '准备'}
              </Button>
            ) : null}
            {lanIsHost ? (
              <Button type="primary" disabled={!bothReady} onClick={() => socketRef.current?.send({ type: 'start' })}>
                开始对局
              </Button>
            ) : (
              <p className="gomoku-msg">等待房主开始…</p>
            )}
          </Space>
        </section>
      ) : (
        <>
          <div className="gomoku-match-meta">
            <span className={lanView.turn === 0 ? 'is-turn' : ''}>● {lanNames[0]}</span>
            <span>
              {lanView.status === 'playing'
                ? `${lanView.turn === 0 ? '黑' : '白'}方行棋 · ${countdown}s`
                : statusLabel(lanView.status)}
            </span>
            <span className={lanView.turn === 1 ? 'is-turn' : ''}>○ {lanNames[1]}</span>
          </div>
          <div className="gomoku-timer-bar">
            <i style={{ width: `${lanView.status === 'playing' ? (countdown / (TURN_MS / 1000)) * 100 : 0}%` }} />
          </div>
          {lanView.pendingUndo ? (
            <div className="gomoku-undo-banner">
              <p>
                {lanNames[lanView.pendingUndo.fromSeat]} 请求悔棋
                {lanRole !== 'spectator' && lanRole !== lanView.pendingUndo.fromSeat
                  ? ' · 请选择'
                  : ' · 等待回应'}
              </p>
              {lanRole !== 'spectator' && lanRole !== lanView.pendingUndo.fromSeat ? (
                <Space>
                  <Button type="primary" onClick={() => socketRef.current?.send({ type: 'respondUndo', accept: true })}>
                    同意
                  </Button>
                  <Button onClick={() => socketRef.current?.send({ type: 'respondUndo', accept: false })}>拒绝</Button>
                </Space>
              ) : null}
            </div>
          ) : null}
          <BoardView
            view={lanView}
            canPlace={canLanPlace}
            previewStone={lanView.turn === 0 ? 1 : 2}
            onPlace={(r, c) => socketRef.current?.send({ type: 'place', r, c })}
          />
          {canLanPlace ? (
            <p className="gomoku-tip">按住拖动到交叉点，松手落子（最边缘也可下）</p>
          ) : null}
          {lanRole !== 'spectator' && lanView.status === 'playing' ? (
            <Space wrap className="gomoku-bottom-actions">
              <Button
                disabled={Boolean(lanView.pendingUndo) || !lanView.moves.length || lanView.turn === lanRole}
                onClick={() => socketRef.current?.send({ type: 'requestUndo' })}
              >
                悔棋
              </Button>
              <Button onClick={() => socketRef.current?.send({ type: 'resign' })}>认输</Button>
            </Space>
          ) : null}
          {lanView.status !== 'playing' ? (
            <div className="gomoku-end-dock">
              <span>{statusLabel(lanView.status)}</span>
              {lanRole !== null && lanRole !== 'spectator' ? (
                <Space wrap>
                  <Button onClick={() => socketRef.current?.send({ type: 'ready', ready: !meReady })}>
                    {meReady ? '取消准备' : '准备下一局'}
                  </Button>
                  {lanIsHost ? (
                    <Button type="primary" disabled={!bothReady} onClick={() => socketRef.current?.send({ type: 'start' })}>
                      开始下一局
                    </Button>
                  ) : (
                    <em>{bothReady ? '等待房主开局…' : '等待双方准备…'}</em>
                  )}
                </Space>
              ) : (
                <em>观战中</em>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export { GomokuPage };
