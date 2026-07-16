/** 前后端共用协议类型（前端引用；服务端用纯 JS 镜像字段） */

import type { ClientView, Seat } from '../engine/game';
import type { ScoreDelta } from '../engine/score';

export const DOUDIZHU_DEFAULT_PORT = 3789;

export type ServerToClient =
  | { type: 'welcome'; seat: Seat; roomId: string; isHost: boolean }
  | { type: 'lobby'; players: Array<{ seat: Seat; name: string; ready: boolean; connected: boolean }>; hostSeat: Seat }
  | { type: 'state'; view: ClientView; names: [string, string, string] }
  | { type: 'scores'; scores: ScoreDelta }
  | { type: 'error'; message: string }
  | { type: 'chat'; seat: Seat; text: string }
  | { type: 'info'; message: string }
  | { type: 'swapRequest'; fromSeat: Seat; fromName: string };

export type ClientToServer =
  | { type: 'join'; roomId: string; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'changeSeat'; targetSeat: Seat }
  | { type: 'requestSwap'; targetSeat: Seat }
  | { type: 'respondSwap'; fromSeat: Seat; accept: boolean }
  | { type: 'start' }
  /** call: 0不叫/1叫地主；grab: 0不抢/1抢地主；score: 1|2|3分 */
  | { type: 'bid'; bid: 0 | 1 | 2 | 3 }
  /** 0不加倍 / 1加倍(×2) / 2超级加倍(×4) */
  | { type: 'double'; action: 0 | 1 | 2 }
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
  | { type: 'nextRound' }
  | { type: 'chat'; text: string };
