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
  | { type: 'info'; message: string };

export type ClientToServer =
  | { type: 'join'; roomId: string; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'bid'; bid: 0 | 1 | 2 | 3 }
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
  | { type: 'nextRound' }
  | { type: 'chat'; text: string };
