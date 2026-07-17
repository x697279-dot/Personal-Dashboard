import type { PlayerCount, PublicView, Seat, TakeoffMode } from '../engine';

export const FLYING_DEFAULT_PORT = 3789;

export type LobbyPlayer = {
  seat: Seat;
  name: string;
  ready: boolean;
  connected: boolean;
};

export type FlyingServerToClient =
  | { type: 'welcome'; seat: Seat | 'spectator'; roomId: string; isHost: boolean }
  | {
      type: 'lobby';
      players: LobbyPlayer[];
      spectators: Array<{ name: string }>;
      hostSeat: Seat;
      playerCount: PlayerCount;
      takeoffMode: TakeoffMode;
    }
  | {
      type: 'state';
      view: PublicView;
      names: string[];
      you: Seat | 'spectator';
    }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string };

export type FlyingClientToServer =
  | { type: 'join'; game: 'flying'; roomId: string; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'setPlayerCount'; count: PlayerCount }
  | { type: 'setTakeoffMode'; mode: TakeoffMode }
  | { type: 'start' }
  | { type: 'roll' }
  | { type: 'move'; pieceIndex: number };
