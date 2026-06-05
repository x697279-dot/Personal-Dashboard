import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GamePage } from './GamePage';

type ServiceStatus = 'checking' | 'online' | 'offline';
type SelectedServiceId = string;

type Service = {
  id: string;
  title: string;
  description: string;
  url: string;
  healthUrl: string;
  accent: string;
  icon: string;
  object: 'server' | 'book' | 'code';
};

type GuestMessage = {
  id: string;
  name: string;
  content: string;
  createdAt: string;
};

const services: Service[] = [
  {
    id: 'nas',
    title: 'NAS',
    description: '文件、影音与备份中心',
    url: 'https://nas.example.com',
    healthUrl: 'https://nas.example.com',
    accent: '#38bdf8',
    icon: 'NAS',
    object: 'server',
  },
  {
    id: 'blog',
    title: '博客',
    description: '文章、笔记与公开内容',
    url: 'https://blog.example.com',
    healthUrl: 'https://blog.example.com',
    accent: '#f59e0b',
    icon: 'BLOG',
    object: 'book',
  },
  {
    id: 'preview',
    title: '代码预览',
    description: '预览实验项目与 Demo',
    url: 'https://preview.example.com',
    healthUrl: 'https://preview.example.com',
    accent: '#8b5cf6',
    icon: 'DEV',
    object: 'code',
  },
];

const statusLabel: Record<ServiceStatus, string> = {
  checking: '检测中',
  online: '在线',
  offline: '离线',
};

const defaultMessages: GuestMessage[] = [
  {
    id: 'welcome-1',
    name: '站长',
    content: '',
    createdAt: new Date().toISOString(),
  },
];

function createMessageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isGuestMessage(value: unknown): value is GuestMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as GuestMessage;
  return (
    typeof message.id === 'string' &&
    typeof message.name === 'string' &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  );
}

function useServiceStatuses(serviceList: Service[]) {
  const [statuses, setStatuses] = useState<Record<string, ServiceStatus>>(
    Object.fromEntries(serviceList.map((service) => [service.id, 'checking'])),
  );

  useEffect(() => {
    let cancelled = false;

    const checkServices = async () => {
      const nextStatuses = await Promise.all(
        serviceList.map(async (service) => {
          try {
            await fetch(service.healthUrl, {
              method: 'HEAD',
              mode: 'no-cors',
              cache: 'no-store',
            });
            return [service.id, 'online'] as const;
          } catch {
            return [service.id, 'offline'] as const;
          }
        }),
      );

      if (!cancelled) {
        setStatuses(Object.fromEntries(nextStatuses));
      }
    };

    checkServices();
    const intervalId = window.setInterval(checkServices, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [serviceList]);

  return statuses;
}

function useGuestMessages() {
  const [messages, setMessages] = useState<GuestMessage[]>(() => {
    try {
      const savedMessages = window.localStorage.getItem('dashboard-guest-messages');
      const parsedMessages: unknown = savedMessages ? JSON.parse(savedMessages) : defaultMessages;
      return Array.isArray(parsedMessages) && parsedMessages.every(isGuestMessage) ? parsedMessages : defaultMessages;
    } catch {
      return defaultMessages;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('dashboard-guest-messages', JSON.stringify(messages));
    } catch {
      // 存储不可用时仍保留当前页面内的留言，避免提交后页面崩溃。
    }
  }, [messages]);

  return { messages, setMessages };
}

function SceneCard({
  serviceList,
  selectedServiceId,
  onSelectService,
}: {
  serviceList: Service[];
  selectedServiceId: SelectedServiceId;
  onSelectService: (serviceId: SelectedServiceId) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneItemsRef = useRef<Array<{ mesh: THREE.Object3D; service: Service }>>([]);
  const selectedServiceIdRef = useRef(selectedServiceId);

  useEffect(() => {
    selectedServiceIdRef.current = selectedServiceId;
  }, [selectedServiceId]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#06111f', 7, 18);

    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 3.2, 7.6);
    camera.lookAt(0, 0.6, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const ambientLight = new THREE.AmbientLight('#b6d5ff', 0.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.1);
    keyLight.position.set(3, 6, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(3.7, 4.2, 0.22, 64),
      new THREE.MeshStandardMaterial({ color: '#0f2238', roughness: 0.8, metalness: 0.25 }),
    );
    floor.position.y = -0.22;
    floor.receiveShadow = true;
    scene.add(floor);

    const positions = [-2.1, 0, 2.1];
    sceneItemsRef.current = serviceList.map((service, index) => {
      const group = new THREE.Group();
      group.position.x = positions[index];

      const color = new THREE.Color(service.accent);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.45,
        emissive: color,
        emissiveIntensity: 0.12,
      });

      const object =
        service.object === 'server'
          ? new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.75), material)
          : service.object === 'book'
            ? new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 1.25), material)
            : new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), material);

      object.castShadow = true;
      object.position.y = service.object === 'book' ? 0.45 : 0.92;
      group.add(object);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.025, 12, 64),
        new THREE.MeshBasicMaterial({ color: service.accent }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      group.add(ring);

      scene.add(group);
      return { mesh: group, service };
    });

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(
        sceneItemsRef.current.map((item) => item.mesh),
        true,
      );
      renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
    };

    const onClick = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(
        sceneItemsRef.current.map((item) => item.mesh),
        true,
      );
      const selected = sceneItemsRef.current.find((item) =>
        intersects.some((intersect) => item.mesh === intersect.object || item.mesh.children.includes(intersect.object)),
      );

      if (selected) {
        onSelectService(selected.service.id);
      }
    };

    let animationFrame = 0;
    const animate = () => {
      const time = performance.now() * 0.001;
      sceneItemsRef.current.forEach((item, index) => {
        const isSelected = item.service.id === selectedServiceIdRef.current;
        const targetScale = isSelected ? 1.14 : 1;
        item.mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
        item.mesh.rotation.y = Math.sin(time * 0.7 + index) * 0.22;
        item.mesh.position.y = Math.sin(time * 1.25 + index) * 0.07 + (isSelected ? 0.1 : 0);
      });

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [onSelectService, serviceList]);

  return (
    <section className="scene-card" aria-label="3D 服务入口">
      <div className="scene-copy">
        <p className="eyebrow">3D Service Hub</p>
      </div>
      <div ref={mountRef} className="three-scene" />
    </section>
  );
}

function MessageBoard() {
  const { messages, setMessages } = useGuestMessages();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim() || '匿名访客';
    const nextContent = content.trim();

    if (!nextContent) {
      return;
    }

    setMessages((currentMessages) => [
      {
        id: createMessageId(),
        name: nextName.slice(0, 18),
        content: nextContent.slice(0, 160),
        createdAt: new Date().toISOString(),
      },
      ...currentMessages,
    ]);
    setName('');
    setContent('');
  };

  return (
    <section className="message-board">
      <div className="message-panel">
        <p className="eyebrow">Guest Book</p>
        <h2>访客留言板</h2>
        <p className="panel-copy">留下一个问候、建议或服务访问申请。</p>

        <form className="message-form" onSubmit={handleSubmit}>
          <label>
            昵称
            <input
              value={name}
              maxLength={18}
              placeholder="匿名访客"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            留言
            <textarea
              value={content}
              maxLength={160}
              placeholder="写点什么吧..."
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button type="submit">发布留言</button>
        </form>
      </div>

      <div className="message-list" aria-live="polite">
        {messages.map((message) => (
          <article className="message-item" key={message.id}>
            <div>
              <strong>{message.name}</strong>
              <time dateTime={message.createdAt}>
                {new Intl.DateTimeFormat('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(message.createdAt))}
              </time>
            </div>
            <p>{message.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardHome() {
  const serviceList = useMemo(() => services, []);
  const statuses = useServiceStatuses(serviceList);
  const [selectedServiceId, setSelectedServiceId] = useState<SelectedServiceId>(serviceList[0].id);
  const [isStartingGame, setIsStartingGame] = useState(false);
  const selectedService = serviceList.find((service) => service.id === selectedServiceId) ?? serviceList[0];
  const onlineCount = serviceList.filter((service) => statuses[service.id] === 'online').length;

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
    <main className="dashboard">
      {isStartingGame ? (
        <div className="home-loading-overlay" role="status" aria-live="polite">
          <div className="home-loading-card">
            <div className="game-loading-spinner" />
            <p className="eyebrow">Preparing 3D Game</p>
            <h2>正在进入 3D 小游戏</h2>
            <span>正在准备场景资源，请稍等...</span>
          </div>
        </div>
      ) : null}

      <section className="hero">
        <div>
          <p className="eyebrow">Personal Dashboard</p>
          <button className="game-start-button" type="button" disabled={isStartingGame} onClick={startGame}>
            {isStartingGame ? '正在进入...' : '点击开始 3D 小游戏'}
          </button>
        </div>
        <div className="status-pill">
          <span>{onlineCount}</span>
          <small>/ {serviceList.length} 在线</small>
        </div>
      </section>

      <SceneCard
        serviceList={serviceList}
        selectedServiceId={selectedServiceId}
        onSelectService={setSelectedServiceId}
      />

      <section className="selected-service" style={{ '--accent': selectedService.accent } as CSSProperties}>
        <div>
          <p className="eyebrow">Selected Service</p>
          <h2>{selectedService.title}</h2>
          <p>{selectedService.description}</p>
        </div>
        <span className={`status-dot ${statuses[selectedService.id] ?? 'checking'}`}>
          {statusLabel[statuses[selectedService.id] ?? 'checking']}
        </span>
      </section>

      <section className="section-heading">
        <p className="eyebrow">Services</p>
        <h2>服务卡片</h2>
      </section>

      <section className="service-grid">
        {serviceList.map((service) => {
          const status = statuses[service.id] ?? 'checking';

          return (
            <article
              className={`service-card ${selectedServiceId === service.id ? 'selected' : ''}`}
              key={service.id}
              style={{ '--accent': service.accent } as CSSProperties}
            >
              <div className="card-topline">
                <span className="service-icon">{service.icon}</span>
                <span className={`status-dot ${status}`}>{statusLabel[status]}</span>
              </div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <button type="button" onClick={() => setSelectedServiceId(service.id)}>
                查看服务
              </button>
            </article>
          );
        })}
      </section>

      <section className="quick-links">
        <div>
          <p className="eyebrow">Service Index</p>
          <h2>服务索引</h2>
        </div>
        <div className="quick-link-list">
          {serviceList.map((service) => (
            <button
              className={selectedServiceId === service.id ? 'selected' : ''}
              key={service.id}
              type="button"
              onClick={() => setSelectedServiceId(service.id)}
            >
              {service.title}
            </button>
          ))}
        </div>
      </section>

      <MessageBoard />
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

  return route === '#/game' ? <GamePage /> : <DashboardHome />;
}

export { App };
