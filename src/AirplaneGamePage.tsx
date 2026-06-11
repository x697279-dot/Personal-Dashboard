import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import {
  createAirplaneGame,
  restartAirplaneGame,
  type GameHudState,
} from './airplane/createAirplaneGame';

function AirplaneGamePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hud, setHud] = useState<GameHudState>({
    score: 0,
    lives: 3,
    wave: 1,
    status: 'playing',
  });

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    setIsLoading(true);
    let game: Phaser.Game | null = null;
    let frameId = 0;

    const mountGame = () => {
      const rect = parent.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        frameId = window.requestAnimationFrame(mountGame);
        return;
      }

      game = createAirplaneGame(parent, {
        onHudUpdate: setHud,
        onReady: () => setIsLoading(false),
      });
      gameRef.current = game;
    };

    mountGame();

    return () => {
      window.cancelAnimationFrame(frameId);
      game?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const handleRestart = () => {
    if (!gameRef.current) return;
    setIsLoading(false);
    restartAirplaneGame(gameRef.current);
  };

  return (
    <div className="character-scene-page airplane-game-page">
      <div ref={containerRef} className="scene-stage" />

      {isLoading ? (
        <div className="game-loading-overlay" role="status" aria-live="polite">
          <div className="game-loading-card">
            <div className="game-loading-spinner" />
            <p className="game-eyebrow">SKY STRIKE</p>
            <h2>正在加载飞机大战</h2>
            <span>正在初始化战机、敌机编队与星空战场...</span>
          </div>
        </div>
      ) : null}

      <div className="hud top-hud airplane-top-hud">
        <div className="airplane-hud-title">
          <div className="game-eyebrow">CAPYLULU SKY STRIKE</div>
          <h1>飞机大战</h1>
        </div>
        <div className="airplane-hud-stats">
          <div className="airplane-stat">
            <span>得分</span>
            <strong>{hud.score}</strong>
          </div>
          <div className="airplane-stat">
            <span>生命</span>
            <strong>{'❤'.repeat(Math.max(hud.lives, 0)) || '—'}</strong>
          </div>
          <div className="airplane-stat">
            <span>波次</span>
            <strong>{hud.wave}</strong>
          </div>
        </div>
        <button
          className="back-home-button airplane-back-button"
          type="button"
          onClick={() => {
            window.location.hash = '#/';
          }}
        >
          <span className="airplane-back-button-full">返回主页</span>
          <span className="airplane-back-button-short">返回</span>
        </button>
      </div>

      <div className="control-card airplane-control-card">
        <span>方向键 / WASD 移动</span>
        <span>自动发射子弹</span>
        <span>移动端按住拖动战机</span>
      </div>

      {hud.status === 'gameover' ? (
        <div className="airplane-gameover-overlay" role="dialog" aria-modal="true">
          <div className="airplane-gameover-card">
            <p className="game-eyebrow">MISSION FAILED</p>
            <h2>游戏结束</h2>
            <p>
              最终得分 <strong>{hud.score}</strong> · 抵达第 <strong>{hud.wave}</strong> 波
            </p>
            <div className="airplane-gameover-actions">
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
    </div>
  );
}

export { AirplaneGamePage };
