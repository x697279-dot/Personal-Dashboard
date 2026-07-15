/** 斗地主音效 / 出牌语音播报 */

import type { Card } from './engine/cards';
import { analyzePattern, patternLabel, type Pattern } from './engine/patterns';

let audioCtx: AudioContext | null = null;
let unlocked = false;
let voicesReady = false;
let speakTimer: number | null = null;

export type DdzAudioSettings = {
  sfx: boolean;
  voice: boolean;
};

const settings: DdzAudioSettings = {
  sfx: true,
  voice: true,
};

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function ensureVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const load = () => {
    const list = window.speechSynthesis.getVoices();
    if (list.length) voicesReady = true;
  };
  load();
  window.speechSynthesis.addEventListener('voiceschanged', load);
}

if (typeof window !== 'undefined') ensureVoices();

/** 浏览器需用户手势后才能出声（含语音解锁） */
export async function unlockDdzAudio() {
  const c = ctx();
  if (c.state === 'suspended') await c.resume();
  unlocked = true;
  ensureVoices();
  // Chrome：必须在用户手势里先 warm-up speechSynthesis，否则后续出牌念不出来
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const warm = new SpeechSynthesisUtterance('嗯');
      warm.lang = 'zh-CN';
      warm.volume = 0.01;
      warm.rate = 2;
      window.speechSynthesis.speak(warm);
      window.setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }, 80);
    } catch {
      // ignore
    }
  }
}

export function getDdzAudioSettings() {
  return { ...settings };
}

export function setDdzAudioSettings(partial: Partial<DdzAudioSettings>) {
  Object.assign(settings, partial);
}

function speechRank(weight: number): string {
  const map: Record<number, string> = {
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
    11: '勾',
    12: '圈',
    13: '凯',
    14: '尖',
    15: '二',
    16: '小王',
    17: '大王',
  };
  return map[weight] ?? String(weight);
}

/** 出牌语音文案，例如「对三」「炸弹」 */
export function playAnnounceText(cards: Card[]): string {
  const pattern = analyzePattern(cards);
  if (!pattern) return '';
  return patternAnnounceText(pattern);
}

export function patternAnnounceText(pattern: Pattern): string {
  const rank = speechRank(pattern.weight);
  switch (pattern.kind) {
    case 'single':
      return rank;
    case 'pair':
      return `对${rank}`;
    case 'triple':
      return `三个${rank}`;
    case 'triple_one':
      return '三带一';
    case 'triple_pair':
      return '三带对';
    case 'straight':
      return '顺子';
    case 'pair_straight':
      return '连对';
    case 'plane':
    case 'plane_single':
    case 'plane_pair':
      return '飞机';
    case 'four_two_single':
    case 'four_two_pair':
      return '四带二';
    case 'bomb':
      return '炸弹';
    case 'rocket':
      return '王炸';
    default:
      return patternLabel(pattern);
  }
}

function pickZhVoice(): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => /zh-CN|zh_CN/i.test(v.lang) && /Xiaoxiao|Xiaoyi|Huihui|Yaoyao|Tingting|女/i.test(v.name)) ||
    voices.find((v) => /zh-CN|zh_CN/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null
  );
}

export function speakDdz(text: string, rate = 1.05) {
  if (!settings.voice || !text || typeof window === 'undefined') return;
  if (!('speechSynthesis' in window)) return;

  if (speakTimer != null) {
    window.clearTimeout(speakTimer);
    speakTimer = null;
  }

  try {
    // Chrome：cancel 后立刻 speak 经常丢字，稍延后播报
    window.speechSynthesis.cancel();
    speakTimer = window.setTimeout(() => {
      speakTimer = null;
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-CN';
        u.rate = rate;
        u.pitch = 1;
        u.volume = 1;
        const zh = pickZhVoice();
        if (zh) u.voice = zh;
        // 短句再补一点尾音，避免被截断
        if (text.length <= 2) u.text = `${text}。`;
        window.speechSynthesis.speak(u);
        // Chrome 偶发 speaking 卡住，轻推一下
        window.setTimeout(() => {
          if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
        }, 120);
      } catch {
        // ignore
      }
    }, voicesReady ? 60 : 120);
  } catch {
    // ignore
  }
}

/** 出牌短音效 */
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
  // 音效后再念，避免和 cancel 抢
  window.setTimeout(() => {
    speakDdz(patternAnnounceText(pattern), bombLike ? 0.95 : 1.05);
  }, 40);
}

export function announcePass() {
  playCardSfx('pass');
  window.setTimeout(() => speakDdz('不出'), 40);
}

export function announceBid(bid: 0 | 1 | 2 | 3) {
  playCardSfx('bid');
  window.setTimeout(() => {
    if (bid === 0) speakDdz('不叫');
    else speakDdz(`${bid === 1 ? '一' : bid === 2 ? '二' : '三'}分`);
  }, 40);
}
