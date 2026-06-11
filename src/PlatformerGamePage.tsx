import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import {
  createPlatformerGame,
  platformerLevelMeta,
  restartPlatformerGame,
  type PlatformerHudState,
} from './platformer/createPlatformerGame';

function PlatformerGamePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [unlockedLevel, setUnlockedLevel] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hud, setHud] = useState<PlatformerHudState>({
    score: 0,
    coins: 0,
    world: '1-1',
    time: 400,
    lives: 3,
    level: 0,
    form: 'small',
    status: 'idle',
  });

  const formLabelMap = {
    small: '普通奶牛',
    super: '超级奶牛',
    fire: '火焰奶牛',
    star: '星奶牛',
  } as const;

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || !hasStarted) return;

    setIsLoading(true);
    let game: Phaser.Game | null = null;
    let frameId = 0;

    const mountGame = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        frameId = window.requestAnimationFrame(mountGame);
        return;
      }

      game = createPlatformerGame(
        parent,
        {
          onHudUpdate: (nextHud) => {
            setHud(nextHud);
            if (nextHud.status === 'won') {
              setUnlockedLevel((level) => Math.max(level, Math.min(nextHud.level + 1, platformerLevelMeta.length - 1)));
            }
          },
          onReady: () => setIsLoading(false),
        },
        { levelIndex: currentLevel },
      );
      gameRef.current = game;
    };

    mountGame();

    return () => {
      window.cancelAnimationFrame(frameId);
      game?.destroy(true);
      gameRef.current = null;
    };
  }, [currentLevel, hasStarted]);

  const handleStartLevel = (levelIndex: number) => {
    if (levelIndex > unlockedLevel) return;
    setCurrentLevel(levelIndex);
    setHasStarted(true);
  };

  const handleRestart = () => {
    if (!gameRef.current) return;
    setIsLoading(false);
    restartPlatformerGame(gameRef.current, currentLevel);
  };

  const handleNextLevel = () => {
    const nextLevel = Math.min(currentLevel + 1, platformerLevelMeta.length - 1);
    setCurrentLevel(nextLevel);
  };

  return (
    <div className="character-scene-page platformer-game-page">
      <div ref={containerRef} className="scene-stage" />

      {!hasStarted ? (
        <div className="platformer-start-overlay" role="dialog" aria-modal="true">
          <div className="platformer-start-card">
            <p className="game-eyebrow">COW QUEST</p>
            <h1>奶牛闯关</h1>
            <p>顶开问号砖，吃蘑菇和火焰花，穿过 1-1 到 1-3 三个场景后抵达旗杆。</p>
            <div className="platformer-level-select" aria-label="选择关卡">
              {platformerLevelMeta.map((level) => {
                const locked = level.index > unlockedLevel;
                return (
                  <button
                    type="button"
                    key={level.label}
                    className={`platformer-level-card platformer-level-${level.theme}`}
                    disabled={locked}
                    onClick={() => handleStartLevel(level.index)}
                  >
                    <span>{level.label}</span>
                    <strong>{locked ? '未解锁' : level.index === 0 ? '开始游戏' : '进入关卡'}</strong>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="platformer-start-back"
              onClick={() => {
                window.location.hash = '#/';
              }}
            >
              返回主页
            </button>
          </div>
        </div>
      ) : null}

      {hasStarted && isLoading ? (
        <div className="game-loading-overlay" role="status" aria-live="polite">
          <div className="game-loading-card">
            <div className="game-loading-spinner" />
            <p className="game-eyebrow">COW QUEST</p>
            <h2>正在加载奶牛闯关</h2>
            <span>正在搭建蘑菇王国、砖块与问号箱...</span>
          </div>
        </div>
      ) : null}

      {hasStarted ? (
        <div className="platformer-hud-bar" aria-label="游戏状态">
        <span>得分 {hud.score}</span>
        <span>金币 {hud.coins}</span>
        <span>关卡 {hud.world}</span>
        <span>形态 {formLabelMap[hud.form]}</span>
        <span>时间 {hud.time}</span>
        <span>生命 {hud.lives}</span>
      </div>
      ) : null}

      {hasStarted ? (
        <div className="hud top-hud platformer-top-hud">
        <div className="platformer-hud-title">
          <div className="game-eyebrow">COW QUEST</div>
          <h1>奶牛闯关</h1>
        </div>
        <button
          className="back-home-button platformer-back-button"
          type="button"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          返回主页
        </button>
      </div>
      ) : null}

      {hasStarted ? (
        <div className="control-card platformer-control-card">
        <span>方向键 / WASD 移动</span>
        <span>Space / W 跳跃，可二段跳</span>
        <span>X 发射火球（火焰奶牛）</span>
        <span>顶问号砖块获取道具</span>
      </div>
      ) : null}

      {hasStarted ? (
        <div className="platformer-mobile-controls" aria-label="移动端控制">
        <button type="button" id="plat-left" className="platformer-mobile-btn">
          ←
        </button>
        <button type="button" id="plat-jump" className="platformer-mobile-btn platformer-mobile-jump">
          跳
        </button>
        <button type="button" id="plat-right" className="platformer-mobile-btn">
          →
        </button>
        <button type="button" id="plat-fire" className="platformer-mobile-btn platformer-mobile-fire">
          火
        </button>
      </div>
      ) : null}

      {hud.status === 'gameover' ? (
        <div className="platformer-overlay" role="dialog" aria-modal="true">
          <div className="platformer-overlay-card">
            <p className="game-eyebrow">GAME OVER</p>
            <h2>闯关失败</h2>
            <p>
              得分 <strong>{hud.score}</strong> · 金币 <strong>{hud.coins}</strong>
            </p>
            <div className="platformer-overlay-actions">
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

      {hud.status === 'won' ? (
        <div className="platformer-overlay" role="dialog" aria-modal="true">
          <div className="platformer-overlay-card platformer-win-card">
            <p className="game-eyebrow">{currentLevel === platformerLevelMeta.length - 1 ? 'ALL CLEAR' : 'LEVEL CLEAR'}</p>
            <h2>{currentLevel === platformerLevelMeta.length - 1 ? '全部通关！' : '关卡完成！'}</h2>
            <p>
              {currentLevel === platformerLevelMeta.length - 1
                ? '你完成了 1-1 到 1-3 的全部冒险，成功拯救公主塔德斯图尔！'
                : '红旗已经滑下，下一关已解锁。'}
            </p>
            <p>
              得分 <strong>{hud.score}</strong> · 金币 <strong>{hud.coins}</strong> · 剩余时间{' '}
              <strong>{hud.time}</strong>
            </p>
            <div className="platformer-overlay-actions">
              {currentLevel < platformerLevelMeta.length - 1 ? (
                <button type="button" onClick={handleNextLevel}>
                  进入下一关
                </button>
              ) : null}
              <button type="button" onClick={handleRestart}>
                重玩本关
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setHasStarted(false)}
              >
                选择关卡
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { PlatformerGamePage };
