import type { PublicView, Seat } from '../engine';

export const GOMOKU_DEFAULT_PORT = 3789;

export type LobbyPlayer = {
  seat: Seat;
  name: string;
  ready: boolean;
  connected: boolean;
};

export type GomokuServerToClient =
  | { type: 'welcome'; seat: Seat | 'spectator'; roomId: string; isHost: boolean }
  | {
      type: 'lobby';
      players: [LobbyPlayer, LobbyPlayer];
      spectators: Array<{ name: string }>;
      hostSeat: Seat;
    }
  | {
      type: 'state';
      view: PublicView;
      names: [string, string];
      you: Seat | 'spectator';
    }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string };

export type GomokuClientToServer =
  | { type: 'join'; game: 'gomoku'; roomId: string; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'place'; r: number; c: number }
  | { type: 'requestUndo' }
  | { type: 'respondUndo'; accept: boolean }
  | { type: 'resign' };
