import { useEffect, useState } from 'react';
import { GamePage } from './GamePage';

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

function HomePage() {
  const [isStartingGame, setIsStartingGame] = useState(false);

  const startGame = () => {
    if (isStartingGame) return;
    setIsStartingGame(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.location.hash = '#/game';
      });
    });
  };

  return (
    <main className="capy-home">
      {isStartingGame ? (
        <div className="capy-loading-overlay" role="status" aria-live="polite">
          <div className="capy-loading-card">
            <div className="game-loading-spinner" />
            <p>CAPYLULU 3D WORLD</p>
            <h2>正在进入小游戏</h2>
            <span>正在准备海滨城市、车辆和角色场景...</span>
          </div>
        </div>
      ) : null}

      <div className="capy-orb capy-orb-one" />
      <div className="capy-orb capy-orb-two" />
      <div className="capy-ticket capy-ticket-one">100</div>
      <div className="capy-ticket capy-ticket-two">PLAY</div>
      <div className="capy-watermelon" />
      <div className="capy-umbrella" />

      <section className="capy-hero" aria-label="3D 小游戏入口">
        <div className="capy-copy">
          <p className="capy-kicker">CAPYLULU PLAYGROUND</p>
          <h1>
            <span>橙黄色的</span>
            <span>快乐星球</span>
            <span>准备出发。</span>
          </h1>
          <p className="capy-subtitle">进入一座海滨小城，开车、漫游、探索属于你的 3D 小游戏。</p>
          <button className="capy-start-button" type="button" disabled={isStartingGame} onClick={startGame}>
            <span>{isStartingGame ? '正在进入...' : '点击开始 3D 小游戏'}</span>
          </button>
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

      <div className="capy-marquee" aria-hidden="true">
        <span>CAPYLULU · 3D GAME · BEACH CITY · DRIVE · EXPLORE · </span>
        <span>CAPYLULU · 3D GAME · BEACH CITY · DRIVE · EXPLORE · </span>
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

  return route === '#/game' ? <GamePage /> : <HomePage />;
}

export { App };
