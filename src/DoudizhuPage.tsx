import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseAction, listLegalPlays, type AiDifficulty } from './doudizhu/ai/bot';
import {
  applyBid,
  applyPass,
  applyPlay,
  createInitialScores,
  createNewRound,
  toClientView,
  type GameState,
  type Seat,
} from './doudizhu/engine/game';
import { isRedSuit, type Card } from './doudizhu/engine/cards';
import { analyzePattern, patternLabel } from './doudizhu/engine/patterns';
import { connectDoudizhu, looksLikePrivateHost } from './doudizhu/net/client';
import { DOUDIZHU_DEFAULT_PORT, type ServerToClient } from './doudizhu/net/protocol';
import type { ClientView } from './doudizhu/engine/game';
import type { ScoreDelta } from './doudizhu/engine/score';

type Screen = 'menu' | 'solo-setup' | 'solo' | 'lan-setup' | 'lan';

const TURN_SECONDS = 15;

const AI_LABEL: Record<AiDifficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

/** 默认三人头像：你 / 电脑A / 电脑B（联机按座位复用） */
const DEFAULT_AVATARS: [string, string, string] = [
  '/doudizhu/avatar-you.png',
  '/doudizhu/avatar-a.png',
  '/doudizhu/avatar-b.png',
];

function seatName(seat: Seat, names?: [string, string, string]) {
  return names?.[seat] ?? `座位${seat + 1}`;
}

function seatAvatar(seat: Seat, avatars?: [string, string, string]) {
  return (avatars ?? DEFAULT_AVATARS)[seat];
}

function PlayerAvatar({
  seat,
  avatars,
  landlord,
  size = 'md',
}: {
  seat: Seat;
  avatars?: [string, string, string];
  landlord?: Seat | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`ddz-avatar ddz-avatar-${size} ${landlord === seat ? 'is-landlord' : ''}`}>
      <img src={seatAvatar(seat, avatars)} alt="" draggable={false} />
      {landlord === seat ? <em className="ddz-avatar-crown" aria-hidden>👑</em> : null}
    </span>
  );
}

/** 提示：返回建议选中的牌 id，或建议不出 */
function getPlayHint(view: ClientView): { cardIds: string[]; suggestPass: boolean; tip: string } {
  const prev = view.lastPatternCards?.length ? analyzePattern(view.lastPatternCards) : null;
  const plays = listLegalPlays(view.hand, prev);
  if (!plays.length) {
    if (prev) return { cardIds: [], suggestPass: true, tip: '没有能压过的牌，建议不出' };
    return { cardIds: [], suggestPass: false, tip: '暂无可用提示' };
  }

  const nonBombs = plays.filter((p) => {
    const kind = analyzePattern(p)?.kind;
    return kind !== 'bomb' && kind !== 'rocket';
  });
  const pick = (nonBombs.length ? nonBombs : plays)[0]!;
  const pattern = analyzePattern(pick);
  return {
    cardIds: pick.map((c) => c.id),
    suggestPass: false,
    tip: `建议出：${pick.map((c) => c.label).join(' ')}${pattern ? `（${patternLabel(pattern)}）` : ''}`,
  };
}

type SeatAction = {
  seat: Seat;
  cards: Card[];
  pass: boolean;
};

/** 取每位玩家在本轮（清桌后）最近一次出牌/不出 */
function latestActions(history: ClientView['trickHistory']): Record<Seat, SeatAction | null> {
  const result: Record<Seat, SeatAction | null> = { 0: null, 1: null, 2: null };
  // 从最近一次「两人连续 pass 清桌」之后开始算本轮
  let start = 0;
  let passes = 0;
  for (let i = 0; i < history.length; i += 1) {
    const t = history[i]!;
    if (t.pass) {
      passes += 1;
      if (passes >= 2) {
        start = i + 1;
        passes = 0;
      }
    } else {
      passes = 0;
    }
  }
  for (let i = start; i < history.length; i += 1) {
    const t = history[i]!;
    result[t.seat] = t;
  }
  return result;
}

function CardView({
  card,
  selected,
  onToggle,
  small,
}: {
  card: Card;
  selected?: boolean;
  onToggle?: () => void;
  small?: boolean;
}) {
  const red = isRedSuit(card.suit) || card.suit === 'J';
  return (
    <button
      type="button"
      className={`ddz-card ${red ? 'is-red' : 'is-black'} ${selected ? 'is-selected' : ''} ${small ? 'is-small' : ''}`}
      onClick={onToggle}
      disabled={!onToggle}
    >
      <span className="ddz-card-label">{card.label}</span>
      <span className="ddz-card-suit">
        {card.suit === 'S' ? '♠' : card.suit === 'H' ? '♥' : card.suit === 'D' ? '♦' : card.suit === 'C' ? '♣' : '★'}
      </span>
    </button>
  );
}

function PlayPile({
  label,
  action,
  isTurn,
  countdown,
}: {
  label: string;
  action: SeatAction | null;
  isTurn?: boolean;
  countdown?: number | null;
}) {
  return (
    <div className={`ddz-play-pile ${isTurn ? 'is-turn' : ''}`}>
      <div className="ddz-play-pile-head">
        <strong>{label}</strong>
        {isTurn && countdown != null ? <span className="ddz-countdown">{countdown}s</span> : null}
      </div>
      <div className="ddz-play-pile-body">
        {action?.pass ? (
          <span className="ddz-pass-tag">不出</span>
        ) : action?.cards.length ? (
          action.cards.map((c) => <CardView key={c.id} card={c} small />)
        ) : (
          <span className="ddz-play-empty">等待出牌</span>
        )}
      </div>
    </div>
  );
}

function ScoreBar({
  scores,
  landlord,
  names,
  avatars,
}: {
  scores: ScoreDelta;
  landlord: Seat | null;
  names?: [string, string, string];
  avatars?: [string, string, string];
}) {
  return (
    <div className="ddz-scores">
      {([0, 1, 2] as Seat[]).map((seat) => (
        <div key={seat} className={`ddz-score-pill ${landlord === seat ? 'is-landlord' : ''}`}>
          <PlayerAvatar seat={seat} avatars={avatars} landlord={landlord} size="sm" />
          <div className="ddz-score-meta">
            <span>
              {seatName(seat, names)}
              {landlord === seat ? ' · 地主' : landlord !== null ? ' · 农民' : ''}
            </span>
            <strong>{scores[seat]}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function TableView({
  view,
  names,
  avatars,
  selectedIds,
  onToggleCard,
  onBid,
  onPlay,
  onPass,
  onHint,
  onNext,
  controlsEnabled,
  canNext = true,
  onTimeout,
  hintTip,
}: {
  view: ClientView;
  names?: [string, string, string];
  avatars?: [string, string, string];
  selectedIds: string[];
  onToggleCard: (id: string) => void;
  onBid: (bid: 0 | 1 | 2 | 3) => void;
  onPlay: () => void;
  onPass: () => void;
  onHint: () => void;
  onNext?: () => void;
  controlsEnabled: boolean;
  canNext?: boolean;
  onTimeout?: () => void;
  hintTip?: string;
}) {
  const myTurn = controlsEnabled && view.turn === view.mySeat;
  const left = ((view.mySeat + 2) % 3) as Seat;
  const right = ((view.mySeat + 1) % 3) as Seat;
  const actions = useMemo(() => latestActions(view.trickHistory), [view.trickHistory]);
  const [countdown, setCountdown] = useState(TURN_SECONDS);
  const timeoutFired = useRef(false);
  const turnKey = `${view.phase}-${view.turn}-${view.trickHistory.length}`;

  useEffect(() => {
    if (view.phase !== 'bidding' && view.phase !== 'playing') {
      setCountdown(0);
      return;
    }
    timeoutFired.current = false;
    setCountdown(TURN_SECONDS);
    const id = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [turnKey, view.phase]);

  useEffect(() => {
    if (countdown !== 0) return;
    if (view.phase !== 'bidding' && view.phase !== 'playing') return;
    if (!myTurn || !onTimeout || timeoutFired.current) return;
    timeoutFired.current = true;
    onTimeout();
  }, [countdown, myTurn, onTimeout, view.phase]);

  return (
    <div className="ddz-table">
      <div className="ddz-table-top">
        <ScoreBar scores={view.scores} landlord={view.landlord} names={names} avatars={avatars} />
        <div className="ddz-bottom-dock" title="地主底牌">
          <span>底牌</span>
          <div className="ddz-bottom-cards">
            {view.bottom
              ? view.bottom.map((c) => <CardView key={c.id} card={c} small />)
              : [0, 1, 2].map((i) => <div key={i} className="ddz-card-back" />)}
          </div>
          <em>
            叫分 {view.bidScore || '-'} · 炸弹×{view.bombCount}
          </em>
        </div>
      </div>

      <div className="ddz-battlefield">
        <div className="ddz-side ddz-side-left">
          <div className={`ddz-opponent ${view.turn === left ? 'is-turn' : ''}`}>
            <PlayerAvatar seat={left} avatars={avatars} landlord={view.landlord} size="lg" />
            <div className="ddz-opponent-meta">
              <p>{seatName(left, names)}</p>
              <strong>{view.handCounts[left]} 张</strong>
              {view.phase === 'bidding' && view.bids[left] !== -1 ? (
                <span className="ddz-bid-tag">{view.bids[left] === 0 ? '不叫' : `${view.bids[left]}分`}</span>
              ) : null}
            </div>
          </div>
          <PlayPile
            label={`${seatName(left, names)} 本轮`}
            action={actions[left]}
            isTurn={view.turn === left}
            countdown={view.turn === left ? countdown : null}
          />
        </div>

        <div className="ddz-side ddz-side-center">
          <div className="ddz-turn-banner">
            {view.phase === 'settled' ? (
              <span>本局结束</span>
            ) : view.turn === view.mySeat ? (
              <span className="is-mine">你的回合 · {countdown}s</span>
            ) : (
              <span>
                {seatName(view.turn, names)} 思考中 · {countdown}s
              </span>
            )}
          </div>
          <p className="ddz-status" role="status">
            {view.message}
            {view.phase === 'settled' && view.lastDelta
              ? ` · 本局 ${view.lastDelta.map((d, i) => `${names?.[i as Seat] ?? `座${i + 1}`}${d >= 0 ? '+' : ''}${d}`).join(' / ')}`
              : ''}
          </p>
        </div>

        <div className="ddz-side ddz-side-right">
          <div className={`ddz-opponent ${view.turn === right ? 'is-turn' : ''}`}>
            <PlayerAvatar seat={right} avatars={avatars} landlord={view.landlord} size="lg" />
            <div className="ddz-opponent-meta">
              <p>{seatName(right, names)}</p>
              <strong>{view.handCounts[right]} 张</strong>
              {view.phase === 'bidding' && view.bids[right] !== -1 ? (
                <span className="ddz-bid-tag">{view.bids[right] === 0 ? '不叫' : `${view.bids[right]}分`}</span>
              ) : null}
            </div>
          </div>
          <PlayPile
            label={`${seatName(right, names)} 本轮`}
            action={actions[right]}
            isTurn={view.turn === right}
            countdown={view.turn === right ? countdown : null}
          />
        </div>
      </div>

      <div className="ddz-my-zone">
        <div className="ddz-my-head">
          <PlayerAvatar seat={view.mySeat} avatars={avatars} landlord={view.landlord} size="md" />
          <PlayPile
            label="你本轮出牌"
            action={actions[view.mySeat]}
            isTurn={view.turn === view.mySeat}
            countdown={view.turn === view.mySeat ? countdown : null}
          />
        </div>

        <div className="ddz-hand">
          {view.hand.map((card) => (
            <CardView
              key={card.id}
              card={card}
              selected={selectedIds.includes(card.id)}
              onToggle={controlsEnabled ? () => onToggleCard(card.id) : undefined}
            />
          ))}
        </div>

        <div className="ddz-actions">
          {view.phase === 'bidding' && myTurn ? (
            <>
              <button type="button" className="ddz-btn ddz-btn-ghost" onClick={() => onBid(0)}>
                不叫
              </button>
              {([1, 2, 3] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  className="ddz-btn ddz-btn-bid"
                  disabled={b <= view.bidScore}
                  onClick={() => onBid(b)}
                >
                  {b} 分
                </button>
              ))}
            </>
          ) : null}

          {view.phase === 'playing' && myTurn ? (
            <>
              <button
                type="button"
                className="ddz-btn ddz-btn-play"
                onClick={onPlay}
                disabled={!selectedIds.length}
              >
                出牌
              </button>
              <button type="button" className="ddz-btn ddz-btn-hint" onClick={onHint}>
                提示出牌
              </button>
              <button
                type="button"
                className="ddz-btn ddz-btn-pass"
                onClick={onPass}
                disabled={!view.lastPatternCards}
              >
                不出
              </button>
            </>
          ) : null}

          {hintTip ? <p className="ddz-hint-tip">{hintTip}</p> : <p className="ddz-hint-tip is-empty" aria-hidden />}

          {view.phase === 'settled' ? (
            canNext ? (
              <button type="button" className="ddz-btn ddz-btn-play" onClick={onNext}>
                下一局
              </button>
            ) : (
              <p className="ddz-muted">等待房主开下一局…</p>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DoudizhuPage() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<AiDifficulty>('normal');
  const [aiDiffs, setAiDiffs] = useState<[AiDifficulty, AiDifficulty]>(['normal', 'normal']);

  // solo
  const [soloState, setSoloState] = useState<GameState | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hintTip, setHintTip] = useState('');
  const soloBusy = useRef(false);
  const AI_TURN_MS = 1400;

  // lan / online
  const pageIsHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const defaultOnlineHost = import.meta.env.VITE_DOUDIZHU_WS_HOST ?? '';
  const [lanHost, setLanHost] = useState(defaultOnlineHost || (pageIsHttps ? '' : '127.0.0.1'));
  const [lanPort, setLanPort] = useState(pageIsHttps ? '443' : String(DOUDIZHU_DEFAULT_PORT));
  const [lanName, setLanName] = useState('玩家');
  const [lanRoom, setLanRoom] = useState('room1');
  const [lanView, setLanView] = useState<ClientView | null>(null);
  const [lanNames, setLanNames] = useState<[string, string, string]>(['', '', '']);
  const [lanLobby, setLanLobby] = useState<Array<{ seat: Seat; name: string; ready: boolean; connected: boolean }>>([]);
  const [lanIsHost, setLanIsHost] = useState(false);
  const [lanSeat, setLanSeat] = useState<Seat | null>(null);
  const [lanMsg, setLanMsg] = useState('');
  const socketRef = useRef<ReturnType<typeof connectDoudizhu> | null>(null);

  const soloView = useMemo(() => (soloState ? toClientView(soloState, 0) : null), [soloState]);

  const startSolo = () => {
    const state = createNewRound(createInitialScores(), 0);
    setSoloState(state);
    setSelectedIds([]);
    setScreen('solo');
  };

  /** 只执行当前 AI 的一步，便于轮流展示 */
  const stepAiOnce = useCallback(
    (state: GameState): GameState => {
      if ((state.phase !== 'bidding' && state.phase !== 'playing') || state.turn === 0) {
        return state;
      }
      const seat = state.turn;
      const diff = seat === 1 ? aiDiffs[0] : aiDiffs[1];
      const action = chooseAction(state, seat, diff);
      let cur =
        action.type === 'bid'
          ? applyBid(state, seat, action.bid)
          : action.type === 'pass'
            ? applyPass(state, seat)
            : applyPlay(state, seat, action.cardIds);

      if (cur.phase === 'redeal') {
        cur = createNewRound(cur.scores, ((cur.bidStart + 1) % 3) as Seat);
      }
      return cur;
    },
    [aiDiffs],
  );

  useEffect(() => {
    if (screen !== 'solo' || !soloState) return;
    if (soloState.phase !== 'bidding' && soloState.phase !== 'playing') return;
    if (soloState.turn === 0) return;
    if (soloBusy.current) return;
    soloBusy.current = true;
    const timer = window.setTimeout(() => {
      setSoloState((prev) => {
        if (!prev || prev.turn === 0) return prev;
        if (prev.phase !== 'bidding' && prev.phase !== 'playing') return prev;
        return stepAiOnce(prev);
      });
      soloBusy.current = false;
    }, AI_TURN_MS);
    return () => {
      window.clearTimeout(timer);
      soloBusy.current = false;
    };
  }, [screen, soloState, stepAiOnce]);

  const applyHint = (view: ClientView) => {
    const hint = getPlayHint(view);
    setHintTip(hint.tip);
    if (hint.suggestPass) {
      setSelectedIds([]);
      return;
    }
    if (hint.cardIds.length) setSelectedIds(hint.cardIds);
  };

  const patchSolo = (next: GameState) => {
    let cur = next;
    if (cur.phase === 'redeal') {
      cur = createNewRound(cur.scores, ((cur.bidStart + 1) % 3) as Seat);
    }
    setSoloState(cur);
    setSelectedIds([]);
    setHintTip('');
  };

  const toggleCard = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const connectLan = () => {
    const host = lanHost.trim();
    if (!host) {
      setLanMsg(pageIsHttps ? '请填写公网联机地址（如 xxx.onrender.com）' : '请填写服务器地址');
      return;
    }
    if (pageIsHttps && looksLikePrivateHost(host)) {
      setLanMsg('HTTPS 站点无法直连局域网 IP。请部署联机服务到公网（见下方说明），或改用本机 http 开发页联机。');
      return;
    }

    socketRef.current?.close();
    setLanMsg('连接中...');
    setLanView(null);
    setLanLobby([]);
    try {
      const sock = connectDoudizhu(host, Number(lanPort) || (pageIsHttps ? 443 : DOUDIZHU_DEFAULT_PORT), {
        onOpen: () => {
          setLanMsg('已连接，正在加入房间...');
          sock.send({ type: 'join', roomId: lanRoom.trim() || 'room1', name: lanName.trim() || '玩家' });
        },
        onClose: () => setLanMsg('连接已断开'),
        onError: () =>
          setLanMsg(
            pageIsHttps
              ? '连接失败：请确认公网联机服务已启动且支持 WSS'
              : '连接失败，请确认已启动 npm run doudizhu-server',
          ),
        onMessage: (msg: ServerToClient) => {
          if (msg.type === 'welcome') {
            setLanSeat(msg.seat);
            setLanIsHost(msg.isHost);
            setScreen('lan');
            setLanMsg(`已入座 ${msg.seat + 1}`);
          } else if (msg.type === 'lobby') {
            setLanLobby(msg.players);
          } else if (msg.type === 'state') {
            setLanView(msg.view);
            setLanNames(msg.names);
            setSelectedIds([]);
            setHintTip('');
          } else if (msg.type === 'error') {
            setLanMsg(msg.message);
          } else if (msg.type === 'info') {
            setLanMsg(msg.message);
          }
        },
      });
      socketRef.current = sock;
    } catch (err) {
      setLanMsg(err instanceof Error ? err.message : '无法连接');
    }
  };

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  if (screen === 'menu') {
    return (
      <div className="ddz-page">
        <button type="button" className="ddz-back" onClick={() => { window.location.hash = '#/'; }}>
          返回主页
        </button>
        <section className="ddz-hero">
          <p className="ddz-kicker">DOU DIZHU · CAPYLULU</p>
          <h1>
            <span>斗地主</span>
            <span>双模式开打</span>
          </h1>
          <p className="ddz-subtitle">标准叫抢与牌型 · 初始积分 100 · 可负分 · 单机多档 AI / 联机三人同房</p>
          <div className="ddz-mode-grid">
            <button type="button" className="ddz-mode-card ddz-mode-solo" onClick={() => setScreen('solo-setup')}>
              <span className="ddz-mode-badge">SOLO</span>
              <strong>单机斗地主</strong>
              <em>你 vs 两位 AI，可选难度</em>
            </button>
            <button type="button" className="ddz-mode-card ddz-mode-lan" onClick={() => setScreen('lan-setup')}>
              <span className="ddz-mode-badge">ONLINE</span>
              <strong>联机对战</strong>
              <em>局域网或公网房间，三人同房开打</em>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (screen === 'solo-setup') {
    return (
      <div className="ddz-page">
        <button type="button" className="ddz-back" onClick={() => setScreen('menu')}>
          返回
        </button>
        <section className="ddz-setup">
          <h2>单机设置</h2>
          <p>你固定坐在座位 1，对战两位电脑。</p>
          <label>
            上家 AI
            <select value={aiDiffs[0]} onChange={(e) => setAiDiffs([e.target.value as AiDifficulty, aiDiffs[1]])}>
              {(Object.keys(AI_LABEL) as AiDifficulty[]).map((k) => (
                <option key={k} value={k}>
                  {AI_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            下家 AI
            <select value={aiDiffs[1]} onChange={(e) => setAiDiffs([aiDiffs[0], e.target.value as AiDifficulty])}>
              {(Object.keys(AI_LABEL) as AiDifficulty[]).map((k) => (
                <option key={k} value={k}>
                  {AI_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            快捷：双方同难度
            <select
              value={difficulty}
              onChange={(e) => {
                const d = e.target.value as AiDifficulty;
                setDifficulty(d);
                setAiDiffs([d, d]);
              }}
            >
              {(Object.keys(AI_LABEL) as AiDifficulty[]).map((k) => (
                <option key={k} value={k}>
                  {AI_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ddz-primary" onClick={startSolo}>
            开始游戏
          </button>
        </section>
      </div>
    );
  }

  if (screen === 'lan-setup') {
    return (
      <div className="ddz-page">
        <button type="button" className="ddz-back" onClick={() => setScreen('menu')}>
          返回
        </button>
        <section className="ddz-setup">
          <h2>联机对战</h2>
          {pageIsHttps ? (
            <p>
              你正在 HTTPS 站点（如 Vercel）。请把联机服务部署到公网（Render / Railway 等），然后填写域名；页面会自动使用{' '}
              <code>wss://</code>。局域网 IP 在此站不可用。
            </p>
          ) : (
            <p>
              局域网：房主运行 <code>npm run doudizhu-server</code>，填写局域网 IP、端口 3789。
              <br />
              线上：填写已部署的联机服务域名，端口一般填 443。
            </p>
          )}
          <label>
            昵称
            <input value={lanName} onChange={(e) => setLanName(e.target.value)} maxLength={12} />
          </label>
          <label>
            房间号
            <input value={lanRoom} onChange={(e) => setLanRoom(e.target.value)} />
          </label>
          <label>
            服务器地址
            <input
              value={lanHost}
              onChange={(e) => setLanHost(e.target.value)}
              placeholder={pageIsHttps ? 'your-app.onrender.com' : '192.168.1.8'}
            />
          </label>
          <label>
            端口
            <input
              value={lanPort}
              onChange={(e) => setLanPort(e.target.value)}
              placeholder={pageIsHttps ? '443' : String(DOUDIZHU_DEFAULT_PORT)}
            />
          </label>
          <button type="button" className="ddz-primary" onClick={connectLan}>
            连接并加入
          </button>
          {lanMsg ? <p className="ddz-lan-msg">{lanMsg}</p> : null}
        </section>
      </div>
    );
  }

  if (screen === 'solo' && soloView) {
    return (
      <div className="ddz-page ddz-playing">
        <div className="ddz-topbar">
          <button type="button" className="ddz-back-inline" onClick={() => setScreen('menu')}>
            退出
          </button>
          <h1>单机斗地主</h1>
          <span>
            AI {AI_LABEL[aiDiffs[0]]}/{AI_LABEL[aiDiffs[1]]}
          </span>
        </div>
        <TableView
          view={soloView}
          names={['你', `电脑A(${AI_LABEL[aiDiffs[0]]})`, `电脑B(${AI_LABEL[aiDiffs[1]]})`]}
          avatars={DEFAULT_AVATARS}
          selectedIds={selectedIds}
          onToggleCard={toggleCard}
          controlsEnabled
          hintTip={hintTip}
          onHint={() => applyHint(soloView)}
          onBid={(bid) => soloState && patchSolo(applyBid(soloState, 0, bid))}
          onPlay={() => soloState && patchSolo(applyPlay(soloState, 0, selectedIds))}
          onPass={() => soloState && patchSolo(applyPass(soloState, 0))}
          onTimeout={() => {
            if (!soloState || soloState.turn !== 0) return;
            if (soloState.phase === 'bidding') {
              patchSolo(applyBid(soloState, 0, 0));
              return;
            }
            if (soloState.phase === 'playing') {
              if (soloState.lastPattern) patchSolo(applyPass(soloState, 0));
              else {
                const first = soloState.hands[0][0];
                if (first) patchSolo(applyPlay(soloState, 0, [first.id]));
              }
            }
          }}
          onNext={() => {
            if (!soloState) return;
            const next = createNewRound(soloState.scores, (((soloState.landlord ?? 0) + 1) % 3) as Seat);
            setSoloState(next);
            setSelectedIds([]);
            setHintTip('');
          }}
        />
      </div>
    );
  }

  if (screen === 'lan') {
    const allReady = lanLobby.length === 3 && lanLobby.every((p) => p.ready && p.connected);
    return (
      <div className="ddz-page ddz-playing">
        <div className="ddz-topbar">
          <button
            type="button"
            className="ddz-back-inline"
            onClick={() => {
              socketRef.current?.close();
              setScreen('lan-setup');
            }}
          >
            断开
          </button>
          <h1>局域网 · {lanRoom}</h1>
          <span>{lanMsg}</span>
        </div>

        {!lanView ? (
          <section className="ddz-lobby">
            <h2>房间大厅</h2>
            <ul>
              {lanLobby.map((p) => (
                <li key={p.seat}>
                  座位 {p.seat + 1}：{p.name || '空'} {p.ready ? '✓就绪' : '…'} {!p.connected ? '(离线)' : ''}
                  {lanSeat === p.seat ? '（我）' : ''}
                </li>
              ))}
            </ul>
            <div className="ddz-actions">
              <button
                type="button"
                className="ddz-btn ddz-btn-ghost"
                onClick={() => socketRef.current?.send({ type: 'ready', ready: true })}
              >
                准备
              </button>
              {lanIsHost ? (
                <button
                  type="button"
                  className="ddz-btn ddz-btn-play"
                  disabled={!allReady}
                  onClick={() => socketRef.current?.send({ type: 'start' })}
                >
                  开始游戏
                </button>
              ) : (
                <p className="ddz-muted">等待房主开始…</p>
              )}
            </div>
          </section>
        ) : (
          <TableView
            view={lanView}
            names={lanNames}
            avatars={DEFAULT_AVATARS}
            selectedIds={selectedIds}
            onToggleCard={toggleCard}
            controlsEnabled
            hintTip={hintTip}
            onHint={() => applyHint(lanView)}
            onBid={(bid) => socketRef.current?.send({ type: 'bid', bid })}
            onPlay={() => socketRef.current?.send({ type: 'play', cardIds: selectedIds })}
            onPass={() => socketRef.current?.send({ type: 'pass' })}
            onTimeout={() => {
              if (!lanView || lanView.turn !== lanView.mySeat) return;
              if (lanView.phase === 'bidding') {
                socketRef.current?.send({ type: 'bid', bid: 0 });
                return;
              }
              if (lanView.phase === 'playing') {
                if (lanView.lastPatternCards) socketRef.current?.send({ type: 'pass' });
                else if (lanView.hand[0]) socketRef.current?.send({ type: 'play', cardIds: [lanView.hand[0].id] });
              }
            }}
            onNext={() => {
              if (lanIsHost) socketRef.current?.send({ type: 'nextRound' });
            }}
            canNext={lanIsHost}
          />
        )}
      </div>
    );
  }

  return null;
}

export { DoudizhuPage };
