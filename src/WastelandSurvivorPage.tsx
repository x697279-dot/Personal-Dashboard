import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  createWastelandThreeGame,
  type SkillId,
  type WastelandGameHandle,
  type WastelandHudState,
  type WastelandRunResult,
  type WastelandUpgradeChoice,
} from './wasteland/createWastelandThreeGame';

const saveKey = 'wasteland-survivor-save-v1';
const autoFireKey = 'wasteland-auto-fireball-v1';

const defaultRunResult: WastelandRunResult = {
  bestKills: 0,
  totalScrap: 0,
  gearLevel: 0,
};

const docModules = [
  ['地图探索', 'Three.js 大世界俯视角废土城市（500×500），使用 public/generated_assets 切图（地块/精灵/摆件/特效），28 个探索点、虚拟摇杆与小地图。'],
  ['状态机', 'playing、levelup、gameover、victory 四个主状态；升级时暂停物理世界，选择后恢复。'],
  ['技能系统', '火球默认自动释放（左下可开关）；右侧每个技能键独立点击释放；H5 左下摇杆移动，Web/H5 均可用 1~5 快捷键。'],
  ['技能融合', '当前支持火球 + 雷电链融合为传说技能“雷火球”，后续可继续扩展冰火、导弹集束、激光折射等融合。'],
  ['怪物系统', '普通怪参考 small mutant creature：绿色毒性变异、cute but dangerous、top down enemy、cartoon style。'],
  ['Boss系统', '红色重甲机甲 Boss，蒸汽引擎设计、多武器、导弹发射器、高细节手游 Boss 方向。'],
  ['装备/存档', '废料、最佳击杀和装备等级写入 localStorage，装备等级会提升开局生命和火力。'],
  ['美术规范', 'Q版废土战士、绿色毒变怪物、卡通渲染、高品质手绘风格、细节丰富的游戏美术资源。'],
] as const;

const skillPromptTags = [
  '火球', '爆裂火球', '雷火球', '流星火雨', '燃烧地带', '激光', '折射激光', '扫射激光', '聚能光束', '离子射线',
  '导弹', '集束导弹', '追踪导弹', '燃烧导弹', '电磁导弹', '雷电链', '雷暴场', '落雷', '电弧新星', '静电护盾',
  '无人机', '治疗无人机', '炮台无人机', '电磁无人机', '导弹无人机', '攻击力', '攻速', '暴击率', '暴击伤害', '移动速度',
  '生命值', '护甲', '拾取范围', '经验加成', '冷却缩减', '范围扩大', '穿透', '分裂弹', '吸血', '复活核心',
] as const;

const skillNames: Record<SkillId, string> = {
  fireball: '火球',
  laser: '激光',
  missile: '导弹',
  lightning: '雷电链',
  drone: '无人机',
  attack: '攻击',
  fireRate: '攻速',
  crit: '暴击',
  moveSpeed: '移速',
  maxHp: '生命',
  magnet: '磁吸',
  armor: '护甲',
  thunderFireball: '雷火球',
};

const CASTABLE_SKILLS: SkillId[] = ['fireball', 'laser', 'missile', 'lightning', 'thunderFireball'];

function loadAutoFireball(defaultValue: boolean) {
  try {
    const raw = window.localStorage.getItem(autoFireKey);
    if (raw === null) return defaultValue;
    return raw === 'true';
  } catch {
    return defaultValue;
  }
}

function saveAutoFireball(enabled: boolean) {
  window.localStorage.setItem(autoFireKey, String(enabled));
}

function loadSave(): WastelandRunResult {
  try {
    const raw = window.localStorage.getItem(saveKey);
    if (!raw) return defaultRunResult;
    const parsed = JSON.parse(raw) as Partial<WastelandRunResult>;
    return {
      bestKills: Number(parsed.bestKills) || 0,
      totalScrap: Number(parsed.totalScrap) || 0,
      gearLevel: Number(parsed.gearLevel) || 0,
    };
  } catch {
    return defaultRunResult;
  }
}

function saveProgress(result: WastelandRunResult) {
  window.localStorage.setItem(saveKey, JSON.stringify(result));
}

function createInitialHud(): WastelandHudState {
  return {
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    nextXp: 12,
    kills: 0,
    time: 0,
    wave: 1,
    status: 'playing',
    bossHp: 0,
    bossMaxHp: 0,
    bossX: 0,
    bossZ: 0,
    skills: {
      fireball: 1,
      laser: 0,
      missile: 0,
      lightning: 0,
      drone: 0,
      attack: 0,
      fireRate: 0,
      crit: 0,
      moveSpeed: 0,
      maxHp: 0,
      magnet: 0,
      armor: 0,
      thunderFireball: 0,
    },
    mapX: 0,
    mapZ: 0,
    worldSize: 500,
    pois: [],
    discoveredPois: 1,
    totalPois: 28,
    latestDiscovery: '',
    skillCooldowns: {},
    autoFireball: true,
  };
}

const poiColors: Record<string, string> = {
  camp: '#84cc16',
  supply: '#facc15',
  ruins: '#94a3b8',
  forest: '#166534',
  metro: '#22d3ee',
  scrapyard: '#f97316',
  hospital: '#e2e8f0',
  'boss-gate': '#ef4444',
};

function WastelandMinimap({ hud }: { hud: WastelandHudState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = hud.worldSize / 2;
    const scale = (size - 24) / hud.worldSize;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(26, 46, 31, 0.95)');
    gradient.addColorStop(1, 'rgba(8, 12, 7, 0.98)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(163, 230, 53, 0.12)';
    for (let grid = -half; grid <= half; grid += 50) {
      const gx = size / 2 + grid * scale;
      const gz = size / 2 + grid * scale;
      ctx.beginPath();
      ctx.moveTo(gx, 8);
      ctx.lineTo(gx, size - 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, gz);
      ctx.lineTo(size - 8, gz);
      ctx.stroke();
    }

    hud.pois.forEach((poi) => {
      const px = size / 2 + poi.x * scale;
      const pz = size / 2 + poi.z * scale;
      ctx.beginPath();
      ctx.fillStyle = poi.discovered ? (poiColors[poi.kind] ?? '#a3e635') : 'rgba(148, 163, 184, 0.45)';
      ctx.arc(px, pz, poi.discovered ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (hud.bossMaxHp > 0) {
      const bossPx = size / 2 + hud.bossX * scale;
      const bossPz = size / 2 + hud.bossZ * scale;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.arc(bossPx, bossPz, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#fff1f2';
      ctx.lineWidth = 1.5;
      ctx.arc(bossPx, bossPz, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const playerPx = size / 2 + hud.mapX * scale;
    const playerPz = size / 2 + hud.mapZ * scale;
    ctx.beginPath();
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.arc(playerPx, playerPz, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    ctx.strokeStyle = 'rgba(163, 230, 53, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();
  }, [hud.mapX, hud.mapZ, hud.bossX, hud.bossZ, hud.bossMaxHp, hud.pois, hud.worldSize]);

  return (
    <div className="wasteland-minimap" aria-label="小地图">
      <canvas ref={canvasRef} width={132} height={132} />
      <span className="wasteland-minimap-label">
        探索 {hud.discoveredPois}/{hud.totalPois}
      </span>
    </div>
  );
}

function WastelandBossPointer({ hud }: { hud: WastelandHudState }) {
  if (hud.bossMaxHp <= 0) return null;

  const dx = hud.bossX - hud.mapX;
  const dz = hud.bossZ - hud.mapZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 36) return null;

  const angleDeg = (Math.atan2(-dz, dx) * 180) / Math.PI;

  return (
    <div className="wasteland-boss-pointer" aria-live="polite">
      <div
        className="wasteland-boss-pointer-badge"
        style={{ '--boss-angle': `${angleDeg}deg` } as CSSProperties}
      >
        <span className="wasteland-boss-pointer-arrow" aria-hidden />
        <strong>机甲 Boss</strong>
        <em>{Math.round(distance)}m</em>
      </div>
    </div>
  );
}

function WastelandSkillPadButton({
  skillId,
  cooldown,
  variant,
  slotIndex,
  badge,
  ready,
  onActivate,
}: {
  skillId: SkillId;
  cooldown?: { remaining: number; total: number };
  variant: 'primary' | 'secondary';
  slotIndex?: number;
  badge?: string;
  ready: boolean;
  onActivate: () => void;
}) {
  const remaining = cooldown?.remaining ?? 0;
  const total = cooldown?.total ?? 1;
  const cdPct = total > 0 ? remaining / total : 0;

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!ready) return;
    onActivate();
  };

  return (
    <button
      type="button"
      className={[
        'wasteland-skill-pad-btn',
        `wasteland-skill-pad-btn--${variant}`,
        slotIndex !== undefined ? `wasteland-skill-pad-btn--slot-${slotIndex}` : '',
        `wasteland-skill-pad-icon--${skillId}`,
        !ready ? 'wasteland-skill-pad-btn--cooldown' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={!ready}
      onPointerDown={handlePointerDown}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`释放${skillNames[skillId]}`}
      style={{ '--cd-pct': cdPct } as CSSProperties}
    >
      <span className="wasteland-skill-pad-fill" aria-hidden />
      <span className="wasteland-skill-pad-glyph" aria-hidden />
      {badge ? <span className="wasteland-skill-pad-num">{badge}</span> : null}
      {remaining > 0 ? <em className="wasteland-skill-pad-cd">{remaining.toFixed(1)}</em> : null}
    </button>
  );
}

function WastelandSkillControls({
  hud,
  autoFireball,
  onToggleAutoFireball,
  onCast,
}: {
  hud: WastelandHudState;
  autoFireball: boolean;
  onToggleAutoFireball: (enabled: boolean) => void;
  onCast: (skillId: SkillId) => void;
}) {
  const activeSkills = CASTABLE_SKILLS.filter((id) => hud.skills[id] > 0);
  const secondarySkills = activeSkills.filter((id) => id !== 'fireball');

  const isReady = (skillId: SkillId) => {
    const remaining = hud.skillCooldowns[skillId]?.remaining ?? 0;
    return remaining <= 0 && hud.status === 'playing';
  };

  return (
    <>
      <div className="wasteland-skill-names" aria-label="已获技能">
        {activeSkills.map((id) => (
          <span key={id}>
            {skillNames[id]} Lv.{hud.skills[id]}
          </span>
        ))}
        <label className="wasteland-auto-fire-toggle">
          <input
            type="checkbox"
            checked={autoFireball}
            onChange={(event) => onToggleAutoFireball(event.target.checked)}
          />
          <span>自动火球</span>
        </label>
      </div>

      <div className="wasteland-skill-pad" aria-label="技能释放">
        {hud.skills.fireball > 0 ? (
          <WastelandSkillPadButton
            skillId="fireball"
            cooldown={hud.skillCooldowns.fireball}
            variant="primary"
            ready={isReady('fireball')}
            onActivate={() => onCast('fireball')}
          />
        ) : null}
        {secondarySkills.map((id, index) => (
          <WastelandSkillPadButton
            key={id}
            skillId={id}
            cooldown={hud.skillCooldowns[id]}
            variant="secondary"
            slotIndex={index}
            badge={String(index + 1)}
            ready={isReady(id)}
            onActivate={() => onCast(id)}
          />
        ))}
      </div>
    </>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function WastelandSurvivorPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<WastelandGameHandle | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerIdRef = useRef<number | null>(null);
  const joystickInputRef = useRef({ x: 0, z: 0 });
  const joystickFrameRef = useRef<number | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveData, setSaveData] = useState<WastelandRunResult>(() => loadSave());
  const [hud, setHud] = useState<WastelandHudState>(() => createInitialHud());
  const [upgradeChoices, setUpgradeChoices] = useState<WastelandUpgradeChoice[]>([]);
  const [discoveryToast, setDiscoveryToast] = useState('');
  const [autoFireball, setAutoFireball] = useState(() => loadAutoFireball(true));

  const stopJoystickLoop = () => {
    if (joystickFrameRef.current !== null) {
      window.cancelAnimationFrame(joystickFrameRef.current);
      joystickFrameRef.current = null;
    }
  };

  const startJoystickLoop = () => {
    if (joystickFrameRef.current !== null) return;

    const tick = () => {
      const { x, z } = joystickInputRef.current;
      gameRef.current?.setMoveInput(x, z);
      joystickFrameRef.current = window.requestAnimationFrame(tick);
    };

    joystickFrameRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  const resetJoystick = () => {
    joystickPointerIdRef.current = null;
    joystickInputRef.current = { x: 0, z: 0 };
    stopJoystickLoop();
    gameRef.current?.setMoveInput(0, 0);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate(-50%, -50%)';
    }
  };

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const joystick = joystickRef.current;
    if (!joystick) return;

    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = rect.width * 0.34;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.min(maxDistance, Math.hypot(rawX, rawY));
    const angle = Math.atan2(rawY, rawX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const inputX = x / maxDistance;
    const inputZ = y / maxDistance;
    const magnitude = Math.hypot(inputX, inputZ);
    const deadZone = 0.08;

    if (magnitude <= deadZone) {
      joystickInputRef.current = { x: 0, z: 0 };
    } else {
      const scaled = Math.min(1, (magnitude - deadZone) / (1 - deadZone));
      joystickInputRef.current = {
        x: (inputX / magnitude) * scaled,
        z: (inputZ / magnitude) * scaled,
      };
    }

    startJoystickLoop();
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  };

  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const handleJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    updateJoystick(event);
  };

  const handleJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetJoystick();
  };

  useEffect(() => {
    return () => {
      stopJoystickLoop();
      document.body.classList.remove('wasteland-mobile-play');
      try {
        screen.orientation?.unlock?.();
      } catch {
        // ignore
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
      }
    };
  }, []);

  useEffect(() => {
    if (!hud.latestDiscovery) return;
    setDiscoveryToast(hud.latestDiscovery);
    const timer = window.setTimeout(() => setDiscoveryToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [hud.latestDiscovery]);

  useEffect(() => {
    if (!hasStarted) {
      document.body.classList.remove('wasteland-mobile-play');
      return;
    }

    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isNarrowViewport = window.matchMedia('(max-width: 980px)').matches;
    if (!isCoarsePointer && !isNarrowViewport) return;

    document.body.classList.add('wasteland-mobile-play');

    const lockLandscape = async () => {
      try {
        await screen.orientation?.lock?.('landscape');
      } catch {
        // 部分浏览器不支持或需全屏后才可锁定
      }
    };

    void lockLandscape();

    return () => {
      document.body.classList.remove('wasteland-mobile-play');
      try {
        screen.orientation?.unlock?.();
      } catch {
        // ignore
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen?.();
      }
    };
  }, [hasStarted]);

  useEffect(() => {
    gameRef.current?.setAutoFireball(autoFireball);
  }, [autoFireball, hasStarted]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || !hasStarted) return;

    setIsLoading(true);
    const game = createWastelandThreeGame(
      parent,
      {
        onHudUpdate: setHud,
        onUpgradeChoices: setUpgradeChoices,
        onRunResult: (result) => {
          saveProgress(result);
          setSaveData(result);
        },
        onReady: () => setIsLoading(false),
      },
      saveData,
    );
    gameRef.current = game;
    game.setAutoFireball(autoFireball);

    return () => {
      resetJoystick();
      game.destroy();
      gameRef.current = null;
    };
  }, [hasStarted]);

  const handleStart = async () => {
    setHud(createInitialHud());
    setUpgradeChoices([]);
    setHasStarted(true);

    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const isNarrowViewport = window.matchMedia('(max-width: 980px)').matches;
    if (!isCoarsePointer && !isNarrowViewport) return;

    document.body.classList.add('wasteland-mobile-play');
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // 用户拒绝或未支持全屏
    }
    try {
      await screen.orientation?.lock?.('landscape');
    } catch {
      // ignore
    }
  };

  const handleRestart = () => {
    if (!gameRef.current) {
      handleStart();
      return;
    }
    setUpgradeChoices([]);
    gameRef.current.restart();
  };

  const handleChooseUpgrade = (skillId: SkillId) => {
    if (!gameRef.current) return;
    gameRef.current.chooseUpgrade(skillId);
  };

  const handleCastSkill = (skillId: SkillId) => {
    gameRef.current?.castSkill(skillId);
  };

  const handleToggleAutoFireball = (enabled: boolean) => {
    setAutoFireball(enabled);
    saveAutoFireball(enabled);
    gameRef.current?.setAutoFireball(enabled);
  };

  const handleResetSave = () => {
    window.localStorage.removeItem(saveKey);
    setSaveData(defaultRunResult);
  };

  const hpPercent = Math.max(0, Math.min(100, (hud.hp / hud.maxHp) * 100));
  const xpPercent = Math.max(0, Math.min(100, (hud.xp / hud.nextXp) * 100));
  const bossPercent = hud.bossMaxHp > 0 ? Math.max(0, Math.min(100, (hud.bossHp / hud.bossMaxHp) * 100)) : 0;
  const showResult = hud.status === 'gameover' || hud.status === 'victory';

  return (
    <main className={`wasteland-page wasteland-game-shell ${hasStarted ? 'wasteland-shell-playing' : ''}`}>
      <section className="wasteland-play-section">
        <div className="wasteland-topbar">
          <div>
            <p className="wasteland-kicker">WASTELAND SURVIVOR</p>
            <h1>废土幸存者</h1>
          </div>
          <button
            className="wasteland-back-button wasteland-back-button-static"
            type="button"
            onClick={() => {
              window.location.hash = '#/';
            }}
          >
            返回主页
          </button>
        </div>

        <div className="wasteland-game-layout">
          <aside className="wasteland-side-panel">
            <h2>角色养成</h2>
            <div className="wasteland-save-grid">
              <span>最佳击杀</span>
              <strong>{saveData.bestKills}</strong>
              <span>废料库存</span>
              <strong>{saveData.totalScrap}</strong>
              <span>装备等级</span>
              <strong>Lv.{saveData.gearLevel}</strong>
            </div>
            <p>装备等级会提升开局生命、自动步枪伤害，并在 Lv.2 后解锁初始无人机。</p>
            <button type="button" onClick={handleResetSave}>
              重置存档
            </button>
          </aside>

          <section
            className={`wasteland-game-card ${hasStarted ? 'wasteland-game-playing' : ''}`}
            aria-label="Wasteland Survivor 游戏区域"
          >
            {!hasStarted ? (
              <div className="wasteland-start-panel">
                <div className="wasteland-scene wasteland-start-scene" aria-hidden="true">
                  <div className="wasteland-logo">WASTE LAND</div>
                  <div className="wasteland-road" />
                  <div className="wasteland-player" />
                  <div className="wasteland-boss" />
                  <div className="wasteland-bullet wasteland-bullet-one" />
                  <div className="wasteland-bullet wasteland-bullet-two" />
                  <div className="wasteland-bullet wasteland-bullet-three" />
                </div>
                <div>
                  <p className="wasteland-kicker">2D TOPDOWN · ROGUELIKE · AUTO FIRE</p>
                  <h2>开始废土探索</h2>
                  <p>方向键 / WASD 或左下虚拟摇杆移动，右上小地图显示探索进度。500×500 废土 PNG 贴图大世界，武器自动索敌，靠近探索点可获得奖励，最终击破机甲 Boss。</p>
                  <button className="wasteland-primary-button" type="button" onClick={handleStart}>
                    进入游戏
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div ref={containerRef} className="wasteland-three-stage" />

                <WastelandBossPointer hud={hud} />
                <WastelandMinimap hud={hud} />
                <button
                  className="wasteland-minimap-home"
                  type="button"
                  onClick={() => {
                    window.location.hash = '#/';
                  }}
                >
                  主页
                </button>

                {discoveryToast ? (
                  <div className="wasteland-discovery-toast" role="status">
                    {discoveryToast.includes('Boss') ? discoveryToast : `发现探索点：${discoveryToast}`}
                  </div>
                ) : null}

                <div
                  ref={joystickRef}
                  className="mobile-joystick wasteland-joystick"
                  aria-label="虚拟摇杆"
                  onPointerDown={handleJoystickPointerDown}
                  onPointerMove={handleJoystickPointerMove}
                  onPointerUp={handleJoystickPointerUp}
                  onPointerCancel={handleJoystickPointerUp}
                >
                  <div ref={joystickKnobRef} className="mobile-joystick-knob" />
                </div>

                <div className="wasteland-hud">
                  <div className="wasteland-hud-row">
                    <span>HP {hud.hp}/{hud.maxHp}</span>
                    <span>Lv.{hud.level}</span>
                    <span>{formatTime(hud.time)}</span>
                  </div>
                  <div className="wasteland-bar">
                    <i style={{ width: `${hpPercent}%` }} />
                  </div>
                  <div className="wasteland-hud-row">
                    <span>击杀 {hud.kills}</span>
                    <span>波次 {hud.wave}</span>
                    <span>EXP {hud.xp}/{hud.nextXp}</span>
                  </div>
                  <div className="wasteland-bar wasteland-xp-bar">
                    <i style={{ width: `${xpPercent}%` }} />
                  </div>
                  {hud.bossMaxHp > 0 ? (
                    <div className="wasteland-boss-bar">
                      <span>机甲 Boss</span>
                      <div className="wasteland-bar">
                        <i style={{ width: `${bossPercent}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <WastelandSkillControls
                  hud={hud}
                  autoFireball={autoFireball}
                  onToggleAutoFireball={handleToggleAutoFireball}
                  onCast={handleCastSkill}
                />

                {isLoading ? (
                  <div className="game-loading-overlay" role="status" aria-live="polite">
                    <div className="game-loading-card">
                      <div className="game-loading-spinner" />
                      <p className="game-eyebrow">WASTELAND SURVIVOR</p>
                      <h2>正在加载废土战场</h2>
                      <span>正在初始化角色、怪物、技能与机甲 Boss...</span>
                    </div>
                  </div>
                ) : null}

                {upgradeChoices.length > 0 ? (
                  <div className="wasteland-modal" role="dialog" aria-modal="true">
                    <div className="wasteland-upgrade-card">
                      <p className="wasteland-kicker">LEVEL UP</p>
                      <h2>选择一项成长</h2>
                      <div className="wasteland-upgrade-grid">
                        {upgradeChoices.map((choice) => (
                          <button type="button" key={choice.id} onClick={() => handleChooseUpgrade(choice.id)}>
                            <em>{choice.category} · {choice.quality}</em>
                            <strong>{choice.name} Lv.{choice.level}</strong>
                            <span>{choice.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {showResult ? (
                  <div className="wasteland-modal" role="dialog" aria-modal="true">
                    <div className="wasteland-upgrade-card">
                      <p className="wasteland-kicker">{hud.status === 'victory' ? 'BOSS DESTROYED' : 'RUN FAILED'}</p>
                      <h2>{hud.status === 'victory' ? '机甲 Boss 已击破' : '幸存者倒下了'}</h2>
                      <p>
                        本局击杀 <strong>{hud.kills}</strong> · 生存 <strong>{formatTime(hud.time)}</strong>
                      </p>
                      <div className="wasteland-result-actions">
                        <button type="button" onClick={handleRestart}>
                          再来一局
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
              </>
            )}
          </section>
        </div>
      </section>

      {!hasStarted ? (
        <>
      <section className="wasteland-skill-catalog" aria-label="Roguelike 技能池提示词">
        <div>
          <p className="wasteland-kicker">ROGUELIKE SKILL PROMPTS</p>
          <h2>几十种技能扩展池</h2>
          <p>品质支持普通、稀有、史诗、传说；主动技能与被动技能可按组合规则继续扩展融合。</p>
        </div>
        <div className="wasteland-skill-tags">
          {skillPromptTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>

      <section className="wasteland-content wasteland-doc-compact" aria-label="开发设计文档">
        {docModules.map(([title, body]) => (
          <article className="wasteland-doc-card" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
        </>
      ) : null}

      {hasStarted ? (
        <div className="wasteland-rotate-hint" aria-hidden="true">
          <span>请旋转手机至横屏游玩</span>
        </div>
      ) : null}
    </main>
  );
}

export { WastelandSurvivorPage };
