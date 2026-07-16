/** 斗地主音效 / 背景音乐（多首 mp3 轮播，无 TTS） */

import type { Card } from './engine/cards';
import { analyzePattern } from './engine/patterns';

let audioCtx: AudioContext | null = null;
let unlocked = false;

/** HTMLAudio 本地 BGM 列表轮播；都缺失时用 WebAudio 轻垫乐兜底 */
let bgmEl: HTMLAudioElement | null = null;
let bgmMode: 'file' | 'synth' | 'none' = 'none';
let playlist: string[] = [];
let playlistReady: boolean | null = null;
let trackIndex = 0;
let synthNodes: {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
} | null = null;
let listeners = new Set<() => void>();

export type DdzAudioSettings = {
  sfx: boolean;
  /** 背景音乐开关（本地 mp3 或 WebAudio 轻垫乐） */
  bgm: boolean;
};

const settings: DdzAudioSettings = {
  sfx: true,
  bgm: false,
};

/** 按顺序轮播；缺哪首会自动跳过 */
const BGM_CANDIDATES = [
  '/doudizhu/bgm-01-wonders-of-the-earth.mp3',
  '/doudizhu/bgm-02-moment-of-peace.mp3',
  '/doudizhu/bgm-03-no-copyright-music.mp3',
  '/doudizhu/bgm-04-escape-your-love.mp3',
  '/doudizhu/bgm-05-carnaval.mp3',
  '/doudizhu/bgm-06-trending-music.mp3',
  '/doudizhu/bgm-07-happy-music.mp3',
  '/doudizhu/bgm-08-bass.mp3',
  '/doudizhu/bgm-09-future-bass.mp3',
  '/doudizhu/bgm-10-summer.mp3',
  '/doudizhu/bgm-11-pop-upbeat.mp3',
  '/doudizhu/bgm.mp3',
];
const BGM_VOLUME = 0.22;
const BGM_TITLES: Record<string, string> = {
  '/doudizhu/bgm-01-wonders-of-the-earth.mp3': 'Wonders of the Earth',
  '/doudizhu/bgm-02-moment-of-peace.mp3': 'Moment of Peace',
  '/doudizhu/bgm-03-no-copyright-music.mp3': 'No Copyright Music',
  '/doudizhu/bgm-04-escape-your-love.mp3': 'Escape Your Love',
  '/doudizhu/bgm-05-carnaval.mp3': 'Carnaval',
  '/doudizhu/bgm-06-trending-music.mp3': 'Trending Music',
  '/doudizhu/bgm-07-happy-music.mp3': 'Happy Music',
  '/doudizhu/bgm-08-bass.mp3': 'Bass',
  '/doudizhu/bgm-09-future-bass.mp3': 'Future Bass',
  '/doudizhu/bgm-10-summer.mp3': 'Summer',
  '/doudizhu/bgm-11-pop-upbeat.mp3': 'Pop Upbeat',
  '/doudizhu/bgm.mp3': '背景音乐',
};

export type DdzBgmState = {
  playing: boolean;
  title: string;
};

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
}

export function subscribeDdzAudio(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 浏览器需用户手势后才能出声 */
export async function unlockDdzAudio() {
  const c = ctx();
  if (c.state === 'suspended') await c.resume();
  unlocked = true;
  if (settings.bgm) await ensureBgmPlaying();
}

export function getDdzAudioSettings() {
  return { ...settings };
}

export function setDdzAudioSettings(partial: Partial<DdzAudioSettings>) {
  Object.assign(settings, partial);
  if (partial.bgm === false) stopBgm();
  else if (partial.bgm === true && unlocked) void ensureBgmPlaying();
  notify();
}

export function isDdzBgmOn() {
  return settings.bgm;
}

export function getDdzBgmState(): DdzBgmState {
  const src = playlist[trackIndex] ?? BGM_CANDIDATES[0]!;
  return {
    playing: settings.bgm && (bgmMode === 'synth' || Boolean(bgmEl && !bgmEl.paused)),
    title: bgmMode === 'synth' ? '轻柔垫乐' : (BGM_TITLES[src] ?? '背景音乐'),
  };
}

export async function toggleDdzBgm() {
  const next = !settings.bgm;
  settings.bgm = next;
  if (!next) {
    if (bgmEl) bgmEl.pause();
    stopSynthBgm();
    bgmMode = 'none';
  } else {
    await unlockDdzAudio();
    await ensureBgmPlaying();
  }
  notify();
  return next;
}

export async function skipDdzBgm(direction: -1 | 1) {
  settings.bgm = true;
  await unlockDdzAudio();
  const list = await resolvePlaylist();
  if (!list.length) {
    stopFileBgm();
    startSynthBgm();
    notify();
    return;
  }
  stopSynthBgm();
  if (!bgmEl) {
    bgmEl = new Audio();
    bgmEl.preload = 'auto';
    bgmEl.volume = BGM_VOLUME;
  }
  playTrackAt(trackIndex + direction);
  notify();
}

async function probeAudioUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'force-cache' });
    if (!res.ok) {
      res.body?.cancel?.();
      return false;
    }
    const type = (res.headers.get('content-type') || '').toLowerCase();
    // 避免 SPA 回退把 index.html 当成音乐
    if (type.includes('text/html') || type.includes('application/json')) {
      res.body?.cancel?.();
      return false;
    }
    res.body?.cancel?.();
    return type.includes('audio') || type.includes('octet-stream') || type === '';
  } catch {
    return false;
  }
}

async function resolvePlaylist(): Promise<string[]> {
  if (playlistReady != null) return playlist;
  const found: string[] = [];
  for (const url of BGM_CANDIDATES) {
    // bgm.mp3 仅在没有编号曲目时作为兜底，避免和 bgm-01 重复播同一首
    if (url.endsWith('/bgm.mp3') && found.length > 0) continue;
    if (await probeAudioUrl(url)) found.push(url);
  }
  playlist = found;
  playlistReady = true;
  trackIndex = Math.floor(Math.random() * Math.max(found.length, 1));
  return playlist;
}

function stopSynthBgm() {
  if (!synthNodes) return;
  const { oscA, oscB, lfo, gain } = synthNodes;
  const now = ctx().currentTime;
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    oscA.stop(now + 0.3);
    oscB.stop(now + 0.3);
    lfo.stop(now + 0.3);
  } catch {
    // ignore
  }
  synthNodes = null;
}

function startSynthBgm() {
  if (synthNodes) return;
  const c = ctx();
  const now = c.currentTime;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.035, now + 1.2);
  gain.connect(c.destination);

  const oscA = c.createOscillator();
  const oscB = c.createOscillator();
  oscA.type = 'sine';
  oscB.type = 'sine';
  // 轻柔五度垫乐
  oscA.frequency.setValueAtTime(196, now); // G3
  oscB.frequency.setValueAtTime(293.66, now); // D4
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08;
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(oscA.frequency);
  lfoGain.connect(oscB.frequency);

  oscA.connect(gain);
  oscB.connect(gain);
  oscA.start(now);
  oscB.start(now);
  lfo.start(now);

  synthNodes = { oscA, oscB, lfo, gain };
  bgmMode = 'synth';
}

function stopFileBgm() {
  if (!bgmEl) return;
  try {
    bgmEl.onended = null;
    bgmEl.pause();
    bgmEl.currentTime = 0;
  } catch {
    // ignore
  }
}

function stopBgm() {
  stopFileBgm();
  stopSynthBgm();
  bgmMode = 'none';
}

function playTrackAt(index: number, attempts = 0) {
  if (!playlist.length || !bgmEl) return;
  if (attempts >= playlist.length) {
    stopFileBgm();
    startSynthBgm();
    return;
  }
  trackIndex = ((index % playlist.length) + playlist.length) % playlist.length;
  const src = playlist[trackIndex]!;
  bgmEl.src = src;
  bgmEl.loop = false;
  bgmEl.volume = BGM_VOLUME;
  bgmEl.onended = () => {
    if (!settings.bgm) return;
    playTrackAt(trackIndex + 1);
  };
  bgmEl.onplay = notify;
  bgmEl.onpause = notify;
  notify();
  void bgmEl.play().then(
    () => {
      bgmMode = 'file';
      notify();
    },
    () => {
      // 单曲失败则试下一首；全部失败回退合成
      playTrackAt(trackIndex + 1, attempts + 1);
    },
  );
}

async function ensureBgmPlaying() {
  if (!settings.bgm || !unlocked) return;

  const list = await resolvePlaylist();
  if (list.length) {
    stopSynthBgm();
    if (!bgmEl) {
      bgmEl = new Audio();
      bgmEl.preload = 'auto';
      bgmEl.volume = BGM_VOLUME;
    }
    // 已在播文件曲目则不打断
    if (bgmMode === 'file' && !bgmEl.paused && bgmEl.src) return;
    // 暂停后从原进度继续，不重新载入曲目
    if (bgmEl.src && bgmEl.paused && bgmEl.currentTime > 0) {
      try {
        await bgmEl.play();
        bgmMode = 'file';
        notify();
        return;
      } catch {
        // 播放失败则重新载入当前曲目
      }
    }
    playTrackAt(trackIndex);
    return;
  }

  stopFileBgm();
  startSynthBgm();
}

/** @deprecated TTS 已移除；保留空实现以免旧调用报错 */
export function speakDdz(_text?: string, _rate?: number) {
  // no-op：不再使用 speechSynthesis「蚊子音」
}

/** 出牌短音效（无语音） */
export function playCardSfx(kind: 'play' | 'pass' | 'bomb' | 'bid' = 'play') {
  if (!settings.sfx || !unlocked) return;
  const c = ctx();
  const now = c.currentTime;
  const gain = c.createGain();
  gain.connect(c.destination);

  const osc = c.createOscillator();
  osc.type = kind === 'bomb' || kind === 'pass' ? 'square' : 'triangle';
  osc.connect(gain);

  if (kind === 'bomb') {
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.36);
    return;
  }

  if (kind === 'pass') {
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.05, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
    return;
  }

  if (kind === 'bid') {
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
    return;
  }

  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.start(now);
  osc.stop(now + 0.15);
}

export function announcePlay(cards: Card[]) {
  const pattern = analyzePattern(cards);
  if (!pattern) return;
  const bombLike = pattern.kind === 'bomb' || pattern.kind === 'rocket';
  playCardSfx(bombLike ? 'bomb' : 'play');
}

export function announcePass() {
  playCardSfx('pass');
}

export function announceBid(bid: 0 | 1 | 2 | 3) {
  playCardSfx('bid');
  void bid;
}

/** 叫抢展示记录：0不叫 1叫地主 2不抢 3抢地主 */
export function announceBidRecord(record: 0 | 1 | 2 | 3) {
  announceBid(record);
}

export function announceScore(_score: 1 | 2 | 3) {
  playCardSfx('bid');
}

/** 加倍：0不加倍 1加倍 2超级加倍 */
export function announceDouble(_action: 0 | 1 | 2) {
  playCardSfx('bid');
}
