import { useEffect, useState } from 'react';
import { AirplaneGamePage } from './AirplaneGamePage';
import { GamePage } from './GamePage';
import { PlatformerGamePage } from './PlatformerGamePage';
import { WastelandSurvivorPage } from './WastelandSurvivorPage';

const gallerySections = [
  {
    eyebrow: 'Chapter 01',
    title: '城市展陈',
    description: '商场、前台、票券和打卡装置，保留线下展陈的可爱氛围。',
    items: [
      { src: '/capy-gallery/display-money.png', alt: '坐在椅子上的 CAPYLULU 展陈' },
      { src: '/capy-gallery/service-desk.png', alt: 'CAPYLULU 客服前台装置' },
    ],
  },
  {
    eyebrow: 'Chapter 02',
    title: '海边假日',
    description: '西瓜、泳池、云朵和天台，把首页的橙黄色快乐感继续放大。',
    items: [
      { src: '/capy-gallery/watermelon-plaza.png', alt: '抱着西瓜的 CAPYLULU' },
      { src: '/capy-gallery/pool-side.png', alt: '泳池主题 CAPYLULU 背影' },
      { src: '/capy-gallery/cloud-rooftop.png', alt: '云朵主题楼顶 CAPYLULU' },
    ],
  },
  {
    eyebrow: 'Chapter 03',
    title: '出行车位',
    description: '交通、停车位和小车元素，为 3D 小游戏里的开车体验做视觉呼应。',
    items: [
      { src: '/capy-gallery/traffic-helper.png', alt: '交通引导主题 CAPYLULU' },
      { src: '/capy-gallery/scooter-parking.png', alt: '小车和停车位主题 CAPYLULU' },
      { src: '/capy-gallery/umbrella-stand.png', alt: '雨伞主题 CAPYLULU 展台' },
    ],
  },
];

const games = [
  {
    id: '3d-city',
    badge: '3D WORLD',
    title: '3D 海滨城市',
    description: '开车、漫游、探索属于你的海滨小城，支持第一/第三人称切换。',
    hash: '#/game',
    buttonText: '进入 3D 世界',
    loadingTitle: 'CAPYLULU 3D WORLD',
    loadingDesc: '正在准备海滨城市、车辆和角色场景...',
    accent: 'city',
  },
  {
    id: 'airplane',
    badge: 'SKY STRIKE',
    title: '飞机大战',
    description: '操控战机穿越星空，自动射击、躲避敌机与弹幕，挑战更高波次。',
    hash: '#/game/airplane',
    buttonText: '开始飞机大战',
    loadingTitle: 'SKY STRIKE',
    loadingDesc: '正在初始化战机、敌机编队与星空战场...',
    accent: 'sky',
  },
  {
    id: 'platformer',
    badge: 'COW QUEST',
    title: '奶牛闯关',
    description: '扮演奶牛穿越蘑菇王国，顶砖块、吃道具、踩怪兽，抵达旗杆拯救公主塔德斯图尔。',
    hash: '#/game/platformer',
    buttonText: '开始奶牛闯关',
    loadingTitle: 'COW QUEST',
    loadingDesc: '正在搭建蘑菇王国、砖块与问号箱...',
    accent: 'meadow',
  },
  {
    id: 'wasteland',
    badge: 'WASTELAND',
    title: '废土幸存者',
    description: '2D TopDown Roguelike 自动射击手游方案：Q版角色、机甲Boss、技能成长、装备养成与地图探索。',
    hash: '#/game/wasteland',
    buttonText: '进入废土幸存者',
    loadingTitle: 'WASTELAND SURVIVOR',
    loadingDesc: '正在进入废土战场、加载角色与地图切图...',
    accent: 'wasteland',
  },
] as const;

type GameEntry = (typeof games)[number];

function HomePage() {
  const [startingGame, setStartingGame] = useState<GameEntry | null>(null);

  const startGame = (game: GameEntry) => {
    if (startingGame) return;
    setStartingGame(game);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.location.hash = game.hash;
      });
    });
  };

  return (
    <main className="capy-home">
      {startingGame ? (
        <div className="capy-loading-overlay" role="status" aria-live="polite">
          <div className="capy-loading-card">
            <div className="game-loading-spinner" />
            <p>{startingGame.loadingTitle}</p>
            <h2>正在进入小游戏</h2>
            <span>{startingGame.loadingDesc}</span>
          </div>
        </div>
      ) : null}

      <div className="capy-orb capy-orb-one" />
      <div className="capy-orb capy-orb-two" />
      <div className="capy-ticket capy-ticket-one">100</div>
      <div className="capy-ticket capy-ticket-two">PLAY</div>
      <div className="capy-watermelon" />
      <div className="capy-umbrella" />

      <section className="capy-hero" aria-label="小游戏入口">
        <div className="capy-copy">
          <p className="capy-kicker">CAPYLULU PLAYGROUND</p>
          <h1>
            <span>橙黄色的</span>
            <span>快乐星球</span>
            <span>准备出发。</span>
          </h1>
          <p className="capy-subtitle">选择一款小游戏，进入 3D 海滨城市、飞机大战、奶牛闯关或废土幸存者方案。</p>
        </div>

        <div className="capy-stage" aria-hidden="true">
          <div className="capy-spotlight" />
          <div className="capy-bubble capy-bubble-one" />
          <div className="capy-bubble capy-bubble-two" />
          <div className="capy-real-mascot">
            <img src="/capy-gallery/hero-capy.png" alt="" />
          </div>
          <div className="capy-platform" />
        </div>
      </section>

      <section className="capy-games-shell" aria-label="游戏选择">
        <div className="capy-games-intro">
          <p className="capy-kicker">Pick Your Game</p>
          <h2>四款小游戏，随时开玩。</h2>
        </div>

        <div className="capy-games-grid">
          {games.map((game) => (
            <article className={`capy-game-card capy-game-card-${game.accent}`} key={game.id}>
              <p className="capy-game-badge">{game.badge}</p>
              <h3>{game.title}</h3>
              <p>{game.description}</p>
              <button
                className="capy-start-button capy-game-start-button"
                type="button"
                disabled={Boolean(startingGame)}
                onClick={() => startGame(game)}
              >
                <span>{startingGame?.id === game.id ? '正在进入...' : game.buttonText}</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <div className="capy-marquee" aria-hidden="true">
        <span>CAPYLULU · 3D GAME · SKY STRIKE · COW QUEST · WASTELAND · DRIVE · </span>
        <span>CAPYLULU · 3D GAME · SKY STRIKE · COW QUEST · WASTELAND · DRIVE · </span>
      </div>

      <section className="capy-gallery-shell" aria-label="素材图片展示">
        <div className="capy-gallery-intro">
          <p className="capy-kicker">Real World Moments</p>
          <h2>把线下的可爱现场，搬进网站首页。</h2>
        </div>

        {gallerySections.map((section) => (
          <section className={`capy-gallery-section ${section.items.length > 2 ? 'wide-layout' : ''}`} key={section.title}>
            <div className="capy-gallery-copy">
              <p>{section.eyebrow}</p>
              <h3>{section.title}</h3>
              <span>{section.description}</span>
            </div>
            <div className="capy-photo-grid">
              {section.items.map((item) => (
                <figure className="capy-photo-card" key={item.src}>
                  <img src={item.src} alt={item.alt} loading="lazy" />
                </figure>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}

function App() {
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route === '#/game') return <GamePage />;
  if (route === '#/game/airplane') return <AirplaneGamePage />;
  if (route === '#/game/platformer') return <PlatformerGamePage />;
  if (route === '#/game/wasteland') return <WastelandSurvivorPage />;
  return <HomePage />;
}

export { App };
