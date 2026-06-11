import * as THREE from 'three';
import type {
  SkillId,
  WastelandCallbacks,
  WastelandHudState,
  WastelandOptions,
  WastelandPoiKind,
  WastelandPoiState,
  WastelandRunResult,
  WastelandUpgradeChoice,
} from './createWastelandGame';
import {
  tryLoadWastelandAssets,
  WASTELAND_TILE_SIZE,
  type WastelandGameAssets,
} from './wastelandAssets';

export type {
  SkillId,
  WastelandCallbacks,
  WastelandHudState,
  WastelandOptions,
  WastelandPoiState,
  WastelandRunResult,
  WastelandUpgradeChoice,
};

export type WastelandGameHandle = {
  destroy: () => void;
  restart: () => void;
  chooseUpgrade: (skillId: SkillId) => void;
  setMoveInput: (x: number, z: number) => void;
};

const WORLD_SIZE = 500;
const HALF_WORLD = WORLD_SIZE / 2;
const FRUSTUM_HEIGHT = 58;
const POI_DISCOVER_RADIUS = 20;
const explorationPoiDefs: Array<Omit<WastelandPoiState, 'discovered'>> = [
  { id: 'camp-hub', name: '幸存者营地', x: 0, z: 0, kind: 'camp' },
  { id: 'north-scrap', name: '北侧锈蚀车场', x: -95, z: -205, kind: 'scrapyard' },
  { id: 'west-ruins', name: '西郊废墟群', x: -210, z: -60, kind: 'ruins' },
  { id: 'east-supply', name: '东线补给站', x: 185, z: -35, kind: 'supply' },
  { id: 'south-forest', name: '南缘侵蚀林', x: 45, z: 195, kind: 'forest' },
  { id: 'metro-alpha', name: '地铁入口 A', x: -150, z: 120, kind: 'metro' },
  { id: 'metro-beta', name: '地铁入口 B', x: 130, z: 155, kind: 'metro' },
  { id: 'hospital', name: '废弃医院', x: -60, z: -140, kind: 'hospital' },
  { id: 'boss-gate', name: '机甲禁区', x: 0, z: -220, kind: 'boss-gate' },
  { id: 'north-camp', name: '北部前哨', x: -175, z: -175, kind: 'camp' },
  { id: 'east-ruins', name: '东岸坍塌楼', x: 215, z: 80, kind: 'ruins' },
  { id: 'west-supply', name: '西部仓库', x: -205, z: 35, kind: 'supply' },
  { id: 'south-scrap', name: '南岸废车堆', x: 160, z: 210, kind: 'scrapyard' },
  { id: 'central-market', name: '中央集市废墟', x: 70, z: 60, kind: 'ruins' },
  { id: 'toxic-grove', name: '剧毒灌木林', x: -120, z: 185, kind: 'forest' },
  { id: 'radio-tower', name: '信号塔遗址', x: 200, z: -170, kind: 'ruins' },
  { id: 'fuel-depot', name: '燃油库遗迹', x: -35, z: 165, kind: 'supply' },
  { id: 'factory', name: '锈蚀工厂', x: 110, z: -150, kind: 'ruins' },
  { id: 'river-bridge', name: '断桥营地', x: -90, z: 95, kind: 'camp' },
  { id: 'school', name: '坍塌校舍', x: 25, z: -115, kind: 'hospital' },
  { id: 'mall', name: '购物中心废墟', x: -165, z: -25, kind: 'ruins' },
  { id: 'power-plant', name: '断电电站', x: 175, z: -120, kind: 'scrapyard' },
  { id: 'vineyard', name: '藤蔓覆盖区', x: -25, z: 220, kind: 'forest' },
  { id: 'underpass', name: '地下通道口', x: 55, z: -195, kind: 'metro' },
  { id: 'armory', name: '军械库遗址', x: -220, z: -130, kind: 'supply' },
  { id: 'watchtower', name: '瞭望塔废墟', x: 220, z: 20, kind: 'ruins' },
  { id: 'greenhouse', name: '变异温室', x: -140, z: 55, kind: 'forest' },
  { id: 'dockyard', name: '装卸场废墟', x: 95, z: 130, kind: 'scrapyard' },
];

type SkillQuality = '普通' | '稀有' | '史诗' | '传说';
type SkillCategory = '主动' | '被动' | '融合';
type EnemyKind = 'crawler' | 'raider' | 'brute' | 'bomber' | 'boss';
type ProjectileKind = 'fireball' | 'missile' | 'thunderFireball';

type SkillDefinition = {
  id: SkillId;
  name: string;
  category: SkillCategory;
  quality: SkillQuality;
  maxLevel: number;
  descriptions: string[];
  hidden?: boolean;
};

const skillDefinitions: SkillDefinition[] = [
  { id: 'fireball', name: '火球', category: '主动', quality: '普通', maxLevel: 5, descriptions: ['发射燃烧火球', '火球伤害提升', '火球爆炸范围提升', '火球数量 +1', '火球附带灼烧爆裂'] },
  { id: 'laser', name: '激光', category: '主动', quality: '稀有', maxLevel: 5, descriptions: ['周期发射贯穿激光', '激光宽度提升', '激光冷却降低', '激光伤害提升', '双重扫射'] },
  { id: 'missile', name: '导弹', category: '主动', quality: '史诗', maxLevel: 5, descriptions: ['自动发射追踪导弹', '导弹爆炸范围提升', '导弹伤害提升', '导弹数量 +1', '集束导弹'] },
  { id: 'lightning', name: '雷电链', category: '主动', quality: '稀有', maxLevel: 5, descriptions: ['释放弹跳闪电', '弹跳次数提升', '雷电伤害提升', '冷却降低', '雷暴连锁'] },
  { id: 'drone', name: '无人机', category: '主动', quality: '稀有', maxLevel: 5, descriptions: ['解锁环绕无人机', '无人机数量 +1', '无人机伤害提升', '无人机旋转范围扩大'] },
  { id: 'attack', name: '攻击力', category: '被动', quality: '普通', maxLevel: 5, descriptions: ['所有伤害 +16%', '所有伤害 +32%', '所有伤害 +48%', '所有伤害 +64%', '所有伤害 +85%'] },
  { id: 'fireRate', name: '攻速', category: '被动', quality: '普通', maxLevel: 5, descriptions: ['主动技能冷却降低', '火球射速提升', '导弹装填提升', '激光冷却降低', '全武器过载'] },
  { id: 'crit', name: '暴击率', category: '被动', quality: '稀有', maxLevel: 5, descriptions: ['暴击率 +8%', '暴击率 +16%', '暴击伤害提升', '暴击率 +28%', '弱点打击'] },
  { id: 'moveSpeed', name: '移动速度', category: '被动', quality: '普通', maxLevel: 5, descriptions: ['移动速度提升', '穿越废墟更敏捷', '移动速度大幅提升', '受击后短暂加速', '荒野疾行'] },
  { id: 'magnet', name: '磁吸背包', category: '被动', quality: '稀有', maxLevel: 5, descriptions: ['拾取范围提升', '经验晶体价值提升', '移动速度提升', '废料收益提升'] },
  { id: 'armor', name: '机甲护甲', category: '被动', quality: '史诗', maxLevel: 5, descriptions: ['最大生命提升', '受伤无敌延长', '碰撞伤害降低', '濒死时恢复生命'] },
  { id: 'maxHp', name: '生命值', category: '被动', quality: '普通', maxLevel: 5, descriptions: ['最大生命 +20', '最大生命 +40', '最大生命 +60', '最大生命 +85', '再生装甲'] },
  { id: 'thunderFireball', name: '雷火球', category: '融合', quality: '传说', maxLevel: 1, hidden: true, descriptions: ['火球 + 雷电链融合，火球爆炸后触发连锁电弧'] },
];

function emptySkills(): Record<SkillId, number> {
  return {
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
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(items: T[]) {
  return items[randInt(0, items.length - 1)];
}

function createChibiWarrior(): THREE.Group {
  const warrior = new THREE.Group();

  const skin = new THREE.MeshLambertMaterial({ color: 0xf6d7a8 });
  const hair = new THREE.MeshLambertMaterial({ color: 0xfacc15 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x38bdf8 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x475569 });
  const boot = new THREE.MeshLambertMaterial({ color: 0x78350f });
  const gun = new THREE.MeshLambertMaterial({ color: 0x166534 });
  const gunGlow = new THREE.MeshBasicMaterial({ color: 0x84cc16 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 16), skin);
  head.position.y = 2.35;
  head.scale.set(1.08, 1, 1.02);
  warrior.add(head);

  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  hairTop.position.set(0, 2.72, -0.08);
  hairTop.rotation.x = -0.2;
  warrior.add(hairTop);

  for (let i = 0; i < 5; i += 1) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 6), hair);
    const angle = -0.55 + i * 0.28;
    spike.position.set(Math.sin(angle) * 0.42, 3.02, -0.18 + Math.cos(angle) * 0.12);
    spike.rotation.x = -0.35;
    spike.rotation.z = angle;
    warrior.add(spike);
  }

  const bandage = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
  bandage.position.set(0.42, 2.38, 0.78);
  warrior.add(bandage);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.72, 0.72), new THREE.MeshLambertMaterial({ color: 0xf8fafc }));
  shirt.position.set(0, 1.42, 0.04);
  warrior.add(shirt);

  const goggle = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 16), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
  goggle.position.set(0, 2.48, 0.72);
  goggle.rotation.x = Math.PI / 2;
  warrior.add(goggle);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.25, 0.85), jacket);
  torso.position.y = 1.35;
  warrior.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.18, 0.92), new THREE.MeshLambertMaterial({ color: 0x334155 }));
  belt.position.y = 0.82;
  warrior.add(belt);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.48), pants);
  legL.position.set(-0.34, 0.35, 0);
  warrior.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.34;
  warrior.add(legR);

  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.62), boot);
  bootL.position.set(-0.34, -0.12, 0.08);
  warrior.add(bootL);
  const bootR = bootL.clone();
  bootR.position.x = 0.34;
  warrior.add(bootR);

  const rifle = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.28), gun);
  rifle.position.set(0.55, 1.45, 0.55);
  rifle.rotation.y = -0.35;
  warrior.add(rifle);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), gunGlow);
  muzzle.position.set(1.12, 1.45, 0.72);
  warrior.add(muzzle);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  warrior.add(shadow);

  return warrior;
}

function createMutant(kind: EnemyKind): THREE.Group {
  const enemy = new THREE.Group();
  const bodyColor =
    kind === 'brute' ? 0x4d7c0f : kind === 'raider' ? 0xca8a04 : kind === 'bomber' ? 0xea580c : 0xf97316;
  const toxic = new THREE.MeshLambertMaterial({ color: bodyColor });
  const core = new THREE.MeshLambertMaterial({
    color: kind === 'brute' ? 0x84cc16 : 0xfde047,
    emissive: kind === 'brute' ? 0x3f6212 : 0x854d0e,
    emissiveIntensity: 0.42,
  });
  const eye = new THREE.MeshBasicMaterial({ color: 0x1f2937 });

  const scale = kind === 'brute' ? 1.55 : kind === 'raider' ? 1.15 : kind === 'bomber' ? 0.95 : 0.82;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale, 14, 14), toxic);
  body.position.y = 0.85 * scale;
  body.scale.set(1.12, 0.9, 1.05);
  enemy.add(body);

  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 8, 8), toxic);
  earL.position.set(-0.62 * scale, 1.18 * scale, 0.1);
  enemy.add(earL);
  const earR = earL.clone();
  earR.position.x *= -1;
  enemy.add(earR);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.45 * scale, 10, 10), core);
  belly.position.set(0, 0.72 * scale, 0.35 * scale);
  enemy.add(belly);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 8, 8), eye);
  eyeL.position.set(-0.28 * scale, 1.02 * scale, 0.62 * scale);
  enemy.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x *= -1;
  enemy.add(eyeR);

  if (kind === 'bomber') {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.35 * scale, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0xfacc15 }));
    spike.position.y = 1.35 * scale;
    enemy.add(spike);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9 * scale, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  enemy.add(shadow);

  return enemy;
}

function createMechaBoss(): THREE.Group {
  const boss = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0xb91c1c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.6, 4.4), metal);
  body.position.y = 2.4;
  boss.add(body);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 16), glow);
  core.position.set(0, 2.5, 2.1);
  core.rotation.x = Math.PI / 2;
  boss.add(core);

  const chimneyL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 10), dark);
  chimneyL.position.set(-1.6, 4.2, -0.8);
  boss.add(chimneyL);
  const chimneyR = chimneyL.clone();
  chimneyR.position.x = 1.6;
  boss.add(chimneyR);

  const gunL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.5), dark);
  gunL.position.set(-3.4, 2.2, 0.4);
  boss.add(gunL);
  const gunR = gunL.clone();
  gunR.position.x = 3.4;
  boss.add(gunR);

  const treadL = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.2), dark);
  treadL.position.set(-2.2, 0.45, 0);
  boss.add(treadL);
  const treadR = treadL.clone();
  treadR.position.x = 2.2;
  boss.add(treadR);

  return boss;
}

function createSpriteEntity(texture: THREE.Texture, width: number, height: number, anchorY = 0.14) {
  const entity = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }),
  );
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, anchorY);
  sprite.position.y = height * 0.46;
  entity.add(sprite);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.2, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  entity.add(shadow);

  return entity;
}

function createPlayerEntity(assets: WastelandGameAssets | null) {
  if (assets?.sprites.player) return createSpriteEntity(assets.sprites.player, 5.2, 5.2);
  return createChibiWarrior();
}

function createEnemyEntity(kind: EnemyKind, assets: WastelandGameAssets | null) {
  const spriteMap = {
    crawler: assets?.sprites.enemyCrawler,
    raider: assets?.sprites.enemyRaider,
    brute: assets?.sprites.enemyBrute,
    bomber: assets?.sprites.enemyBomber,
    boss: assets?.sprites.bossMecha,
  } as const;

  const texture = kind === 'boss' ? spriteMap.boss : spriteMap[kind];
  if (texture) {
    const scale = kind === 'boss' ? 13 : kind === 'brute' ? 4.2 : kind === 'raider' ? 3.4 : kind === 'bomber' ? 3 : 2.8;
    return createSpriteEntity(texture, scale, scale, kind === 'boss' ? 0.12 : 0.14);
  }

  if (kind === 'boss') return createMechaBoss();
  return createMutant(kind);
}

function getPoiColor(kind: WastelandPoiKind) {
  const colors: Record<WastelandPoiKind, number> = {
    camp: 0x84cc16,
    supply: 0xfacc15,
    ruins: 0x94a3b8,
    forest: 0x166534,
    metro: 0x22d3ee,
    scrapyard: 0xf97316,
    hospital: 0xe2e8f0,
    'boss-gate': 0xef4444,
  };
  return colors[kind];
}

function applyTileTexture(texture: THREE.Texture, repeatX: number, repeatY: number) {
  const tiled = texture.clone();
  tiled.wrapS = THREE.RepeatWrapping;
  tiled.wrapT = THREE.RepeatWrapping;
  tiled.repeat.set(repeatX, repeatY);
  return tiled;
}

function createPropSprite(texture: THREE.Texture, width: number, height: number) {
  const prop = new THREE.Group();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }),
  );
  sprite.scale.set(width, height, 1);
  sprite.center.set(0.5, 0.02);
  sprite.position.y = height * 0.02;
  prop.add(sprite);
  return prop;
}

function buildWastelandCity(scene: THREE.Scene, assets: WastelandGameAssets | null) {
  const map = new THREE.Group();
  map.name = 'wasteland-map';

  const grassTile = assets?.tiles.grass;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1),
    grassTile
      ? new THREE.MeshLambertMaterial({
          map: applyTileTexture(grassTile, WORLD_SIZE / WASTELAND_TILE_SIZE, WORLD_SIZE / WASTELAND_TILE_SIZE),
        })
      : new THREE.MeshLambertMaterial({ color: 0x3f5f3a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  map.add(ground);

  const dirtTile = assets?.tiles.dirt;
  if (dirtTile) {
    for (let i = 0; i < 48; i += 1) {
      const patchSize = rand(18, 36);
      const dirt = new THREE.Mesh(
        new THREE.PlaneGeometry(patchSize, patchSize),
        new THREE.MeshLambertMaterial({
          map: applyTileTexture(dirtTile, patchSize / WASTELAND_TILE_SIZE, patchSize / WASTELAND_TILE_SIZE),
          transparent: true,
          opacity: 0.9,
        }),
      );
      dirt.rotation.x = -Math.PI / 2;
      dirt.position.set(rand(-HALF_WORLD + 20, HALF_WORLD - 20), 0.04, rand(-HALF_WORLD + 20, HALF_WORLD - 20));
      map.add(dirt);
    }
  }

  const grassPatchMat = new THREE.MeshLambertMaterial({ color: 0x4d7c0f });
  const patchCount = grassTile ? 120 : 320;
  for (let i = 0; i < patchCount; i += 1) {
    const patch = new THREE.Mesh(new THREE.CircleGeometry(rand(2, 6), 10), grassPatchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(rand(-HALF_WORLD + 8, HALF_WORLD - 8), 0.03, rand(-HALF_WORLD + 8, HALF_WORLD - 8));
    patch.material = grassPatchMat.clone();
    (patch.material as THREE.MeshLambertMaterial).color.setHSL(0.28, rand(0.35, 0.55), rand(0.28, 0.42));
    map.add(patch);
  }

  const roadTile = assets?.tiles.road;
  const crackTile = assets?.tiles.roadCrack ?? roadTile;
  const roadMat = roadTile
    ? new THREE.MeshLambertMaterial({
        map: applyTileTexture(roadTile, WORLD_SIZE / WASTELAND_TILE_SIZE, 8 / WASTELAND_TILE_SIZE),
      })
    : new THREE.MeshLambertMaterial({ color: 0x4b5563 });
  const crackMat = crackTile
    ? new THREE.MeshLambertMaterial({
        map: applyTileTexture(crackTile, 8 / WASTELAND_TILE_SIZE, WORLD_SIZE / WASTELAND_TILE_SIZE),
      })
    : new THREE.MeshLambertMaterial({ color: 0x374151 });
  const streetStep = 32;

  for (let x = -HALF_WORLD; x <= HALF_WORLD; x += streetStep) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8, WORLD_SIZE), roadMat.clone());
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.05, 0);
    map.add(road);
  }
  for (let z = -HALF_WORLD; z <= HALF_WORLD; z += streetStep) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE, 8), crackMat.clone());
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.05, z);
    map.add(road);
  }

  const buildingColors = [0x6b7280, 0x78716c, 0x57534e, 0x4b5563, 0x64748b];
  const vineMat = new THREE.MeshLambertMaterial({ color: 0x65a30d });

  for (let gx = -HALF_WORLD + 14; gx < HALF_WORLD - 10; gx += streetStep) {
    for (let gz = -HALF_WORLD + 14; gz < HALF_WORLD - 10; gz += streetStep) {
      if (Math.random() > 0.78) continue;

      const bw = rand(10, 16);
      const bd = rand(10, 16);
      const bh = rand(5, 18);
      const bx = gx + rand(-2, 4);
      const bz = gz + rand(-2, 4);

      if (assets?.props.ruins && Math.random() > 0.25) {
        const ruins = createPropSprite(assets.props.ruins, rand(8, 14), rand(10, 16));
        ruins.position.set(bx, 0, bz);
        ruins.rotation.y = rand(0, Math.PI * 2);
        map.add(ruins);
      } else {
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(bw, bh, bd),
          new THREE.MeshLambertMaterial({ color: pick(buildingColors) }),
        );
        building.position.set(bx, bh / 2, bz);
        building.castShadow = true;
        building.receiveShadow = true;
        map.add(building);

        if (Math.random() > 0.45) {
          const vine = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.9, rand(1.5, 4), 0.6), vineMat);
          vine.position.set(bx, rand(1.5, bh * 0.7), bz + bd / 2 + 0.2);
          map.add(vine);
        }
      }

      if (Math.random() > 0.55) {
        if (assets?.props.tree) {
          const tree = createPropSprite(assets.props.tree, rand(3.5, 5.5), rand(4.5, 7));
          tree.position.set(bx + rand(-4, 4), 0, bz + rand(-4, 4));
          tree.rotation.y = rand(0, Math.PI * 2);
          map.add(tree);
        } else {
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8), new THREE.MeshLambertMaterial({ color: 0x78350f }));
          trunk.position.y = 1.1;
          tree.add(trunk);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(1.4, 2.4), 10, 10), new THREE.MeshLambertMaterial({ color: 0x4ade80 }));
          crown.position.y = 2.8;
          tree.add(crown);
          tree.position.set(bx + rand(-4, 4), 0, bz + rand(-4, 4));
          map.add(tree);
        }
      }
    }
  }

  for (let i = 0; i < 64; i += 1) {
    const cx = rand(-HALF_WORLD + 10, HALF_WORLD - 10);
    const cz = rand(-HALF_WORLD + 10, HALF_WORLD - 10);
    if (assets?.props.carWreck) {
      const car = createPropSprite(assets.props.carWreck, rand(3.5, 5), rand(2.5, 3.5));
      car.position.set(cx, 0, cz);
      car.rotation.y = rand(0, Math.PI * 2);
      map.add(car);
    } else {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.5), new THREE.MeshLambertMaterial({ color: 0x92400e }));
      body.position.y = 0.55;
      car.add(body);
      const rust = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 1.2), new THREE.MeshLambertMaterial({ color: 0x57534e }));
      rust.position.set(0.2, 1.05, 0);
      car.add(rust);
      car.position.set(cx, 0, cz);
      car.rotation.y = rand(0, Math.PI * 2);
      map.add(car);
    }
  }

  for (let i = 0; i < 42; i += 1) {
    const tx = rand(-HALF_WORLD + 12, HALF_WORLD - 12);
    const tz = rand(-HALF_WORLD + 12, HALF_WORLD - 12);
    if (assets?.props.tent) {
      const tent = createPropSprite(assets.props.tent, rand(3.5, 5), rand(3, 4.5));
      tent.position.set(tx, 0, tz);
      tent.rotation.y = rand(0, Math.PI);
      map.add(tent);
    } else {
      const tent = new THREE.Mesh(
        new THREE.ConeGeometry(rand(2.5, 4), rand(2.5, 3.5), 4),
        new THREE.MeshLambertMaterial({ color: 0xd97706 }),
      );
      tent.position.set(tx, 1.2, tz);
      tent.rotation.y = rand(0, Math.PI);
      map.add(tent);
    }
  }

  scene.add(map);
  return map;
}

type ExplorationPOI = WastelandPoiState & {
  marker: THREE.Group;
  rewarded: boolean;
};

function createExplorationPois(map: THREE.Group): ExplorationPOI[] {
  return explorationPoiDefs.map((definition) => {
    const marker = new THREE.Group();
    const color = getPoiColor(definition.kind);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.1, 20),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.14;
    marker.add(ring);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6),
      new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.28 }),
    );
    beacon.position.y = 0.8;
    marker.add(beacon);

    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    pin.position.y = 1.55;
    marker.add(pin);

    marker.position.set(definition.x, 0, definition.z);
    if (definition.id === 'camp-hub') marker.visible = false;
    map.add(marker);

    return {
      ...definition,
      discovered: definition.id === 'camp-hub',
      marker,
      rewarded: definition.id === 'camp-hub',
    };
  });
}

type EnemyEntity = {
  mesh: THREE.Group;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  radius: number;
};

type BulletEntity = {
  mesh: THREE.Object3D;
  vx: number;
  vz: number;
  damage: number;
  pierce: number;
  kind: ProjectileKind;
  life: number;
};

type PickupEntity = {
  mesh: THREE.Object3D;
  kind: 'xp' | 'scrap';
  amount: number;
  radius: number;
};

export function createWastelandThreeGame(
  parent: HTMLElement,
  gameCallbacks: WastelandCallbacks,
  gameOptions: WastelandOptions,
): WastelandGameHandle {
  let callbacks = gameCallbacks;
  let options = { ...gameOptions };

  const hudState: WastelandHudState = {
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
    skills: emptySkills(),
    mapX: 0,
    mapZ: 0,
    worldSize: WORLD_SIZE,
    pois: [],
    discoveredPois: 1,
    totalPois: explorationPoiDefs.length,
    latestDiscovery: '',
  };

  let pendingChoices: WastelandUpgradeChoice[] = [];
  let animationId = 0;
  let lastTime = performance.now();
  let disposed = false;
  let gameReady = false;
  let assets: WastelandGameAssets | null = null;
  let explorationPois: ExplorationPOI[] = [];

  let playerX = 0;
  let playerZ = 0;
  let joystickX = 0;
  let joystickZ = 0;
  let pointerTarget: THREE.Vector2 | null = null;
  let pointerActive = false;
  let bossSpawned = false;
  let invincibleUntil = 0;

  let fireTimer = 0;
  let laserTimer = 0;
  let missileTimer = 0;
  let lightningTimer = 0;
  let fusionPulseTimer = 0;
  let spawnTimer = 0;
  let bossAttackTimer = 0;

  const keys = new Set<string>();
  const enemies: EnemyEntity[] = [];
  const bullets: BulletEntity[] = [];
  const pickups: PickupEntity[] = [];
  const drones: THREE.Mesh[] = [];
  const fxGroup = new THREE.Group();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2e1f);
  scene.fog = new THREE.Fog(0x1a2e1f, 90, 280);

  const aspect = Math.max(parent.clientWidth / Math.max(parent.clientHeight, 1), 0.5);
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM_HEIGHT * aspect) / 2,
    (FRUSTUM_HEIGHT * aspect) / 2,
    FRUSTUM_HEIGHT / 2,
    -FRUSTUM_HEIGHT / 2,
    0.1,
    520,
  );

  scene.add(new THREE.AmbientLight(0xb8d4a8, 0.72));
  const sun = new THREE.DirectionalLight(0xfff1c1, 1.05);
  sun.position.set(40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140;
  sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140;
  sun.shadow.camera.bottom = -140;
  scene.add(sun);

  let player!: THREE.Group;

  const entityLayer = new THREE.Group();
  scene.add(entityLayer);
  scene.add(fxGroup);

  function resize() {
    const width = Math.max(parent.clientWidth, 320);
    const height = Math.max(parent.clientHeight, 480);
    renderer.setSize(width, height, false);
    const nextAspect = width / height;
    camera.left = (-FRUSTUM_HEIGHT * nextAspect) / 2;
    camera.right = (FRUSTUM_HEIGHT * nextAspect) / 2;
    camera.top = FRUSTUM_HEIGHT / 2;
    camera.bottom = -FRUSTUM_HEIGHT / 2;
    camera.updateProjectionMatrix();
  }

  function syncHudMap() {
    hudState.mapX = playerX;
    hudState.mapZ = playerZ;
    hudState.worldSize = WORLD_SIZE;
    hudState.pois = explorationPois.map(({ id, name, x, z, kind, discovered }) => ({
      id,
      name,
      x,
      z,
      kind,
      discovered,
    }));
    hudState.discoveredPois = explorationPois.filter((poi) => poi.discovered).length;
    hudState.totalPois = explorationPois.length;
  }

  function pushHud() {
    syncHudMap();
    callbacks.onHudUpdate({
      ...hudState,
      skills: { ...hudState.skills },
      pois: hudState.pois.map((poi) => ({ ...poi })),
    });
  }

  function resetExplorationPois() {
    explorationPois.forEach((poi) => {
      poi.discovered = poi.id === 'camp-hub';
      poi.rewarded = poi.id === 'camp-hub';
      poi.marker.visible = true;
    });
    hudState.latestDiscovery = '';
  }

  function updateExplorationPois() {
    for (const poi of explorationPois) {
      if (poi.discovered) continue;
      const distance = Math.hypot(playerX - poi.x, playerZ - poi.z);
      if (distance > POI_DISCOVER_RADIUS) continue;

      poi.discovered = true;
      hudState.latestDiscovery = poi.name;

      if (poi.rewarded) continue;
      poi.rewarded = true;

      if (poi.kind === 'supply' || poi.kind === 'scrapyard') {
        options.totalScrap += 4 + randInt(1, 3);
        spawnPickup(poi.x, poi.z, 'scrap', 3 + randInt(0, 2));
      } else if (poi.kind === 'ruins' || poi.kind === 'hospital' || poi.kind === 'forest') {
        spawnPickup(poi.x, poi.z, 'xp', 6 + randInt(2, 5));
      } else if (poi.kind === 'metro') {
        hudState.xp += 5;
      } else if (poi.kind === 'camp') {
        hudState.hp = Math.min(hudState.maxHp, hudState.hp + 15);
      }
    }
  }

  function getMoveSpeed() {
    return 16 + hudState.skills.moveSpeed * 2.2 + hudState.skills.magnet * 0.8 + options.gearLevel * 0.4;
  }

  function getDamageMultiplier() {
    return 1 + hudState.skills.attack * 0.16;
  }

  function rollDamage(base: number) {
    const critChance = Math.min(0.55, hudState.skills.crit * 0.08);
    const critMultiplier = hudState.skills.crit >= 3 ? 2.15 : 1.8;
    const isCrit = Math.random() < critChance;
    return Math.round(base * getDamageMultiplier() * (isCrit ? critMultiplier : 1));
  }

  function getPickupRange() {
    return 6 + hudState.skills.magnet * 2.8;
  }

  function resetRun() {
    const gearHp = options.gearLevel * 8;
    hudState.maxHp = 100 + gearHp;
    hudState.hp = hudState.maxHp;
    hudState.level = 1;
    hudState.xp = 0;
    hudState.nextXp = 12;
    hudState.kills = 0;
    hudState.time = 0;
    hudState.wave = 1;
    hudState.status = 'playing';
    hudState.bossHp = 0;
    hudState.bossMaxHp = 0;
    hudState.skills = emptySkills();
    hudState.skills.drone = options.gearLevel >= 2 ? 1 : 0;

    playerX = 0;
    playerZ = 0;
    bossSpawned = false;
    invincibleUntil = 0;
    pendingChoices = [];
    fireTimer = 0;
    laserTimer = 0;
    missileTimer = 0;
    lightningTimer = 0;
    fusionPulseTimer = 0;
    spawnTimer = 0;
    bossAttackTimer = 0;

    for (const enemy of enemies) entityLayer.remove(enemy.mesh);
    enemies.length = 0;
    for (const bullet of bullets) entityLayer.remove(bullet.mesh);
    bullets.length = 0;
    for (const pickup of pickups) entityLayer.remove(pickup.mesh);
    pickups.length = 0;
    for (const drone of drones) entityLayer.remove(drone);
    drones.length = 0;
    while (fxGroup.children.length > 0) {
      fxGroup.remove(fxGroup.children[0]);
    }

    joystickX = 0;
    joystickZ = 0;
    pointerTarget = null;
    pointerActive = false;
    if (explorationPois.length > 0) resetExplorationPois();
    if (gameReady) player.position.set(playerX, 0, playerZ);
    callbacks.onUpgradeChoices([]);
    pushHud();
  }

  function findNearestEnemy(maxDistance: number, exclude?: EnemyEntity) {
    let nearest: EnemyEntity | null = null;
    let nearestDistance = maxDistance;
    for (const enemy of enemies) {
      if (enemy === exclude) continue;
      const distance = Math.hypot(enemy.mesh.position.x - playerX, enemy.mesh.position.z - playerZ);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }
    return nearest;
  }

  function spawnBullet(kind: ProjectileKind, x: number, z: number, tx: number, tz: number, damage: number, speed: number, pierce = 0) {
    const angle = Math.atan2(tz - z, tx - x);
    const useFireballSprite =
      assets?.vfx.fireball && (kind === 'fireball' || kind === 'thunderFireball');
    let mesh: THREE.Object3D;

    if (useFireballSprite) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: assets!.vfx.fireball!, transparent: true, depthTest: true }),
      );
      const size = kind === 'thunderFireball' ? 1.6 : 1.3;
      sprite.scale.set(size, size, 1);
      sprite.center.set(0.5, 0.5);
      sprite.position.set(x, 1.6, z);
      mesh = sprite;
    } else {
      const color = kind === 'missile' ? 0xe5e7eb : kind === 'thunderFireball' ? 0xfbbf24 : 0xf97316;
      const geometry = kind === 'missile' ? new THREE.ConeGeometry(0.22, 0.7, 8) : new THREE.SphereGeometry(0.28, 10, 10);
      const bulletMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      bulletMesh.position.set(x, 1.4, z);
      bulletMesh.rotation.y = angle;
      mesh = bulletMesh;
    }

    entityLayer.add(mesh);
    bullets.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      damage,
      pierce,
      kind,
      life: 3.5,
    });
  }

  function fireAtTarget() {
    const target = findNearestEnemy(90);
    if (!target) return;
    const count = hudState.skills.fireball >= 4 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const spread = i === 0 ? 0 : 0.18;
      const tx = target.mesh.position.x + Math.sin(spread) * 2;
      const tz = target.mesh.position.z;
      spawnBullet(
        hudState.skills.thunderFireball > 0 ? 'thunderFireball' : 'fireball',
        playerX,
        playerZ,
        tx,
        tz,
        rollDamage(12 + hudState.skills.fireball * 4 + options.gearLevel),
        34,
      );
    }
  }

  function fireMissiles() {
    if (hudState.skills.missile <= 0) return;
    const target = findNearestEnemy(100);
    if (!target) return;
    const count = hudState.skills.missile >= 4 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      spawnBullet(
        'missile',
        playerX,
        playerZ,
        target.mesh.position.x,
        target.mesh.position.z,
        rollDamage(28 + hudState.skills.missile * 10),
        22,
      );
    }
  }

  function fireLaser() {
    if (hudState.skills.laser <= 0) return;
    const target = findNearestEnemy(110);
    if (!target) return;

    const points = [
      new THREE.Vector3(playerX, 1.5, playerZ),
      new THREE.Vector3(target.mesh.position.x, 1.5, target.mesh.position.z),
    ];
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x67e8f9, linewidth: 2 }),
    );
    fxGroup.add(beam);
    setTimeout(() => fxGroup.remove(beam), 180);

    const damage = rollDamage(30 + hudState.skills.laser * 12);
    for (const enemy of [...enemies]) {
      const distance = distanceToSegment(
        enemy.mesh.position.x,
        enemy.mesh.position.z,
        playerX,
        playerZ,
        target.mesh.position.x,
        target.mesh.position.z,
      );
      if (distance < 2.8 + hudState.skills.laser * 0.4) damageEnemy(enemy, damage);
    }
  }

  function castLightningChain() {
    if (hudState.skills.lightning <= 0) return;
    let current = findNearestEnemy(80);
    if (!current) return;

    const chained = new Set<EnemyEntity>();
    let fromX = playerX;
    let fromZ = playerZ;
    const maxJumps = 2 + hudState.skills.lightning;

    for (let i = 0; i < maxJumps && current; i += 1) {
      chained.add(current);
      const points = [
        new THREE.Vector3(fromX, 1.8, fromZ),
        new THREE.Vector3(current.mesh.position.x, 1.8, current.mesh.position.z),
      ];
      const bolt = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x67e8f9 }),
      );
      fxGroup.add(bolt);
      setTimeout(() => fxGroup.remove(bolt), 220);

      damageEnemy(current, rollDamage(18 + hudState.skills.lightning * 8));
      fromX = current.mesh.position.x;
      fromZ = current.mesh.position.z;

      current = null;
      let nearestDistance = 24;
      for (const enemy of enemies) {
        if (chained.has(enemy)) continue;
        const distance = Math.hypot(enemy.mesh.position.x - fromX, enemy.mesh.position.z - fromZ);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          current = enemy;
        }
      }
    }
  }

  function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz || 1;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  }

  function applyAreaDamage(x: number, z: number, radius: number, damage: number) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, radius, 24),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.2, z);
    fxGroup.add(ring);
    setTimeout(() => fxGroup.remove(ring), 260);

    for (const enemy of [...enemies]) {
      const distance = Math.hypot(enemy.mesh.position.x - x, enemy.mesh.position.z - z);
      if (distance <= radius) damageEnemy(enemy, damage);
    }
  }

  function getEnemyConfig(kind: EnemyKind) {
    const configs = {
      crawler: { hp: 32, hpScale: 5, speed: 7.2, damage: 10, xp: 4, scrap: 1, radius: 1.1 },
      raider: { hp: 54, hpScale: 8, speed: 9.4, damage: 13, xp: 7, scrap: 2, radius: 1.3 },
      brute: { hp: 138, hpScale: 16, speed: 5.1, damage: 20, xp: 16, scrap: 4, radius: 1.8 },
      bomber: { hp: 44, hpScale: 7, speed: 11.8, damage: 24, xp: 8, scrap: 3, radius: 1.15 },
      boss: { hp: 900, hpScale: 0, speed: 3.2, damage: 28, xp: 0, scrap: 0, radius: 3.2 },
    } as const;
    return configs[kind];
  }

  function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const distance = rand(58, 82);
    const x = playerX + Math.cos(angle) * distance;
    const z = playerZ + Math.sin(angle) * distance;

    let kind: EnemyKind = 'crawler';
    const roll = Math.random();
    if (hudState.wave >= 4 && roll > 0.82) kind = 'brute';
    else if (hudState.wave >= 3 && roll > 0.68) kind = 'bomber';
    else if (hudState.wave >= 2 && roll > 0.45) kind = 'raider';

    const config = getEnemyConfig(kind);
    const mesh = createEnemyEntity(kind, assets);
    mesh.position.set(clamp(x, -HALF_WORLD + 6, HALF_WORLD - 6), 0, clamp(z, -HALF_WORLD + 6, HALF_WORLD - 6));
    entityLayer.add(mesh);
    enemies.push({
      mesh,
      kind,
      hp: config.hp + hudState.wave * config.hpScale,
      maxHp: config.hp + hudState.wave * config.hpScale,
      speed: config.speed + hudState.wave * 0.35,
      damage: config.damage,
      radius: config.radius,
    });
  }

  function spawnBoss() {
    if (bossSpawned) return;
    bossSpawned = true;
    const mesh = createEnemyEntity('boss', assets);
    mesh.position.set(0, 0, -210);
    entityLayer.add(mesh);
    const maxHp = 900 + options.gearLevel * 70;
    hudState.bossMaxHp = maxHp;
    hudState.bossHp = maxHp;
    enemies.push({
      mesh,
      kind: 'boss',
      hp: maxHp,
      maxHp,
      speed: 3.2,
      damage: 28,
      radius: 3.2,
    });
    pushHud();
  }

  function spawnPickup(x: number, z: number, kind: 'xp' | 'scrap', amount: number) {
    const texture = kind === 'xp' ? assets?.vfx.pickupXp : assets?.vfx.pickupScrap;
    let mesh: THREE.Object3D;

    if (texture) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }),
      );
      sprite.scale.set(1.2, 1.2, 1);
      sprite.center.set(0.5, 0.5);
      sprite.position.set(x, 1.1, z);
      mesh = sprite;
    } else {
      const color = kind === 'xp' ? 0x22d3ee : 0xfacc15;
      const geometry = kind === 'xp' ? new THREE.OctahedronGeometry(0.45, 0) : new THREE.BoxGeometry(0.55, 0.45, 0.12);
      const pickupMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color }));
      pickupMesh.position.set(x, 0.8, z);
      mesh = pickupMesh;
    }

    entityLayer.add(mesh);
    pickups.push({ mesh, kind, amount, radius: 0.7 });
  }

  function damageEnemy(enemy: EnemyEntity, damage: number) {
    enemy.hp -= damage;
    if (enemy.kind === 'boss') {
      hudState.bossHp = Math.max(enemy.hp, 0);
      pushHud();
    }
    enemy.mesh.scale.setScalar(1.08);
    setTimeout(() => enemy.mesh.scale.setScalar(1), 70);
    if (enemy.hp > 0) return;
    killEnemy(enemy);
  }

  function killEnemy(enemy: EnemyEntity) {
    const { x, z } = enemy.mesh.position;
    entityLayer.remove(enemy.mesh);
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);

    if (enemy.kind === 'boss') {
      hudState.status = 'victory';
      hudState.bossHp = 0;
      hudState.kills += 1;
      finishRun(true);
      return;
    }

    const config = getEnemyConfig(enemy.kind);
    hudState.kills += 1;
    spawnPickup(x, z, 'xp', config.xp + hudState.skills.magnet);
    if (Math.random() < 0.38) spawnPickup(x + rand(-1, 1), z + rand(-1, 1), 'scrap', config.scrap);
    pushHud();
  }

  function damagePlayer(amount: number) {
    if (hudState.status !== 'playing') return;
    if (performance.now() < invincibleUntil) return;

    const reduction = Math.min(0.55, hudState.skills.armor * 0.1);
    hudState.hp -= Math.max(1, Math.round(amount * (1 - reduction)));
    invincibleUntil = performance.now() + 760 + hudState.skills.armor * 160;

    if (hudState.hp <= 0 && hudState.skills.armor >= 4) {
      hudState.skills.armor = 3;
      hudState.hp = Math.round(hudState.maxHp * 0.35);
    }

    if (hudState.hp <= 0) {
      hudState.hp = 0;
      hudState.status = 'gameover';
      finishRun(false);
    }
    pushHud();
  }

  function finishRun(victory: boolean) {
    options.bestKills = Math.max(options.bestKills, hudState.kills);
    options.gearLevel = Math.min(12, Math.floor(options.totalScrap / 35));
    callbacks.onRunResult({
      bestKills: options.bestKills,
      totalScrap: options.totalScrap,
      gearLevel: options.gearLevel,
    });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.8, 24),
      new THREE.MeshBasicMaterial({ color: victory ? 0xa3e635 : 0x94a3b8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(playerX, 0.25, playerZ);
    fxGroup.add(ring);
    pushHud();
  }

  function openLevelUp() {
    hudState.status = 'levelup';
    pendingChoices = createUpgradeChoices();
    if (pendingChoices.length === 0) {
      hudState.hp = Math.min(hudState.maxHp, hudState.hp + 30);
      hudState.status = 'playing';
      pushHud();
      return;
    }
    callbacks.onUpgradeChoices(pendingChoices);
    pushHud();
  }

  function createUpgradeChoices() {
    return skillDefinitions
      .filter((skill) => !skill.hidden && hudState.skills[skill.id] < skill.maxLevel)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((skill) => {
        const nextLevel = hudState.skills[skill.id] + 1;
        return {
          id: skill.id,
          name: skill.name,
          description: skill.descriptions[nextLevel - 1] ?? '强化当前能力',
          level: nextLevel,
          quality: skill.quality,
          category: skill.category,
        };
      });
  }

  function checkSkillFusion() {
    if (hudState.skills.fireball > 0 && hudState.skills.lightning > 0 && hudState.skills.thunderFireball === 0) {
      hudState.skills.thunderFireball = 1;
    }
  }

  function applyUpgrade(skillId: SkillId) {
    if (hudState.status !== 'levelup') return;
    if (!pendingChoices.some((choice) => choice.id === skillId)) return;

    const skill = skillDefinitions.find((definition) => definition.id === skillId);
    hudState.skills[skillId] = Math.min(hudState.skills[skillId] + 1, skill?.maxLevel ?? 5);
    if (skillId === 'armor' || skillId === 'maxHp') {
      const hpGain = skillId === 'maxHp' ? 20 : 18;
      hudState.maxHp += hpGain;
      hudState.hp = Math.min(hudState.maxHp, hudState.hp + hpGain);
    }
    checkSkillFusion();
    pendingChoices = [];
    callbacks.onUpgradeChoices([]);
    hudState.status = 'playing';
    pushHud();
  }

  function updateDrones(delta: number) {
    const targetCount = hudState.skills.drone;
    while (drones.length < targetCount) {
      const drone = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x84cc16 }),
      );
      entityLayer.add(drone);
      drones.push(drone);
    }
    while (drones.length > targetCount) {
      const drone = drones.pop();
      if (drone) entityLayer.remove(drone);
    }

    const radius = 4.8 + hudState.skills.drone * 0.9;
    drones.forEach((drone, index) => {
      const angle = performance.now() * 0.004 + index * ((Math.PI * 2) / Math.max(drones.length, 1));
      drone.position.set(playerX + Math.cos(angle) * radius, 2.2, playerZ + Math.sin(angle) * radius);
    });

    if (targetCount <= 0) return;
    const damage = 8 + hudState.skills.drone * 5;
    for (const drone of drones) {
      for (const enemy of enemies) {
        const distance = Math.hypot(drone.position.x - enemy.mesh.position.x, drone.position.z - enemy.mesh.position.z);
        if (distance < 2.2 + targetCount * 0.35) {
          damageEnemy(enemy, damage * delta * 3.5);
          break;
        }
      }
    }
  }

  function releasePulse() {
    applyAreaDamage(
      playerX,
      playerZ,
      10 + hudState.skills.thunderFireball * 3.5,
      rollDamage(24 + hudState.skills.fireball * 6 + hudState.skills.lightning * 6),
    );
  }

  function bossAttack() {
    const boss = enemies.find((enemy) => enemy.kind === 'boss');
    if (!boss) return;
    const distance = Math.hypot(boss.mesh.position.x - playerX, boss.mesh.position.z - playerZ);
    if (distance < 16) damagePlayer(18);
    applyAreaDamage(boss.mesh.position.x, boss.mesh.position.z, 8, 12);
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    ray.ray.intersectPlane(plane, point);
    return point;
  }

  function onKeyDown(event: KeyboardEvent) {
    keys.add(event.key.toLowerCase());
  }

  function onKeyUp(event: KeyboardEvent) {
    keys.delete(event.key.toLowerCase());
  }

  function onPointerDown(event: PointerEvent) {
    pointerActive = true;
    const point = screenToWorld(event.clientX, event.clientY);
    pointerTarget = new THREE.Vector2(point.x, point.z);
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointerActive || hudState.status !== 'playing') return;
    const point = screenToWorld(event.clientX, event.clientY);
    pointerTarget = new THREE.Vector2(point.x, point.z);
  }

  function onPointerUp() {
    pointerActive = false;
    pointerTarget = null;
  }

  function updatePlayer(delta: number) {
    let moveX = 0;
    let moveZ = 0;
    if (keys.has('w') || keys.has('arrowup')) moveZ -= 1;
    if (keys.has('s') || keys.has('arrowdown')) moveZ += 1;
    if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
    if (keys.has('d') || keys.has('arrowright')) moveX += 1;

    if (Math.abs(joystickX) > 0.08 || Math.abs(joystickZ) > 0.08) {
      moveX = joystickX;
      moveZ = joystickZ;
    } else if (pointerTarget) {
      const dx = pointerTarget.x - playerX;
      const dz = pointerTarget.y - playerZ;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.8) {
        moveX = dx / distance;
        moveZ = dz / distance;
      }
    } else if (moveX !== 0 || moveZ !== 0) {
      const length = Math.hypot(moveX, moveZ) || 1;
      moveX /= length;
      moveZ /= length;
    }

    if (moveX !== 0 || moveZ !== 0) {
      playerX += moveX * getMoveSpeed() * delta;
      playerZ += moveZ * getMoveSpeed() * delta;
      playerX = clamp(playerX, -HALF_WORLD + 4, HALF_WORLD - 4);
      playerZ = clamp(playerZ, -HALF_WORLD + 4, HALF_WORLD - 4);
      player.position.set(playerX, 0, playerZ);
      player.rotation.y = Math.atan2(moveX, moveZ);
    }
  }

  function updateEnemies(delta: number) {
    for (const enemy of enemies) {
      const dx = playerX - enemy.mesh.position.x;
      const dz = playerZ - enemy.mesh.position.z;
      const distance = Math.hypot(dx, dz) || 1;
      const speed = enemy.kind === 'boss' ? enemy.speed * 0.45 : enemy.speed;
      enemy.mesh.position.x += (dx / distance) * speed * delta;
      enemy.mesh.position.z += (dz / distance) * speed * delta;
      enemy.mesh.lookAt(playerX, enemy.mesh.position.y, playerZ);

      if (distance < enemy.radius + 1.1) {
        if (enemy.kind === 'bomber') damageEnemy(enemy, enemy.maxHp);
        damagePlayer(enemy.damage);
      }
    }
  }

  function updateBullets(delta: number) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const bullet = bullets[i];
      bullet.mesh.position.x += bullet.vx * delta;
      bullet.mesh.position.z += bullet.vz * delta;
      bullet.life -= delta;
      if (bullet.life <= 0) {
        entityLayer.remove(bullet.mesh);
        bullets.splice(i, 1);
        continue;
      }

      for (const enemy of enemies) {
        const distance = Math.hypot(bullet.mesh.position.x - enemy.mesh.position.x, bullet.mesh.position.z - enemy.mesh.position.z);
        if (distance > enemy.radius + 0.5) continue;

        damageEnemy(enemy, bullet.damage);
        if (bullet.kind === 'missile') {
          applyAreaDamage(enemy.mesh.position.x, enemy.mesh.position.z, 5 + hudState.skills.missile, Math.round(bullet.damage * 0.72));
        }
        if (bullet.kind === 'thunderFireball') {
          applyAreaDamage(enemy.mesh.position.x, enemy.mesh.position.z, 4 + hudState.skills.fireball, Math.round(bullet.damage * 0.42));
          castLightningChain();
        }

        if (bullet.pierce > 0) {
          bullet.pierce -= 1;
        } else {
          entityLayer.remove(bullet.mesh);
          bullets.splice(i, 1);
        }
        break;
      }
    }
  }

  function updatePickups(delta: number) {
    const range = getPickupRange();
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pickup = pickups[i];
      const distance = Math.hypot(pickup.mesh.position.x - playerX, pickup.mesh.position.z - playerZ);
      if (distance > range) continue;

      const angle = Math.atan2(playerZ - pickup.mesh.position.z, playerX - pickup.mesh.position.x);
      const speed = THREE.MathUtils.lerp(8, 28, 1 - distance / range);
      pickup.mesh.position.x += Math.cos(angle) * speed * delta;
      pickup.mesh.position.z += Math.sin(angle) * speed * delta;
      pickup.mesh.rotation.y += delta * 4;

      if (distance < 1.2) {
        if (pickup.kind === 'xp') {
          hudState.xp += pickup.amount;
          while (hudState.xp >= hudState.nextXp && hudState.status === 'playing') {
            hudState.xp -= hudState.nextXp;
            hudState.level += 1;
            hudState.nextXp = Math.round(hudState.nextXp * 1.34 + 6);
            openLevelUp();
          }
        } else {
          options.totalScrap += pickup.amount + Math.floor(hudState.skills.magnet / 2);
        }
        entityLayer.remove(pickup.mesh);
        pickups.splice(i, 1);
        pushHud();
      }
    }
  }

  function updateCamera() {
    const isLandscapeMobile =
      parent.clientWidth > parent.clientHeight && parent.clientHeight <= 520;
    const lookAhead = isLandscapeMobile ? 0 : 16;
    const cameraLift = isLandscapeMobile ? 62 : 58;
    const targetX = playerX;
    const targetZ = playerZ + lookAhead;
    camera.position.lerp(new THREE.Vector3(targetX, cameraLift, targetZ + 28), 0.12);
    camera.lookAt(targetX, 0, targetZ);
  }

  function tick(now: number) {
    if (disposed) return;
    animationId = window.requestAnimationFrame(tick);
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!gameReady) {
      updateCamera();
      renderer.render(scene, camera);
      return;
    }

    if (hudState.status === 'playing') {
      updatePlayer(delta);
      updateExplorationPois();
      hudState.time += delta;
      hudState.wave = Math.max(1, Math.floor(hudState.time / 24) + 1);

      spawnTimer += delta;
      if (spawnTimer >= Math.max(0.35, 1.1 - hudState.wave * 0.06) && enemies.length < 72) {
        spawnTimer = 0;
        spawnEnemy();
        if (hudState.wave >= 3 && Math.random() > 0.58) spawnEnemy();
      }

      if (hudState.time > 86 || hudState.kills >= 90) spawnBoss();

      fireTimer += delta;
      if (fireTimer >= Math.max(0.18, 0.62 - hudState.skills.fireball * 0.05 - hudState.skills.fireRate * 0.05)) {
        fireTimer = 0;
        fireAtTarget();
      }

      laserTimer += delta;
      if (hudState.skills.laser > 0 && laserTimer >= Math.max(1.1, 3.8 - hudState.skills.laser * 0.32 - hudState.skills.fireRate * 0.14)) {
        laserTimer = 0;
        fireLaser();
      }

      missileTimer += delta;
      if (hudState.skills.missile > 0 && missileTimer >= Math.max(0.8, 3.2 - hudState.skills.missile * 0.24 - hudState.skills.fireRate * 0.12)) {
        missileTimer = 0;
        fireMissiles();
      }

      lightningTimer += delta;
      if (hudState.skills.lightning > 0 && lightningTimer >= Math.max(0.85, 3 - hudState.skills.lightning * 0.22 - hudState.skills.fireRate * 0.1)) {
        lightningTimer = 0;
        castLightningChain();
      }

      fusionPulseTimer += delta;
      if (hudState.skills.thunderFireball > 0 && fusionPulseTimer >= 5.2) {
        fusionPulseTimer = 0;
        releasePulse();
      }

      bossAttackTimer += delta;
      if (bossSpawned && bossAttackTimer >= 2.8) {
        bossAttackTimer = 0;
        bossAttack();
      }

      updateEnemies(delta);
      updateBullets(delta);
      updatePickups(delta);
      updateDrones(delta);
      pushHud();
    }

    updateCamera();
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(parent);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerUp);

  function bootstrapWorld(loadedAssets: WastelandGameAssets | null) {
    if (disposed) return;
    assets = loadedAssets;
    const worldMap = buildWastelandCity(scene, assets);
    explorationPois = createExplorationPois(worldMap);
    player = createPlayerEntity(assets);
    scene.add(player);
    gameReady = true;
    resetRun();
    callbacks.onReady();
  }

  resize();
  tryLoadWastelandAssets().then(bootstrapWorld);
  animationId = window.requestAnimationFrame(tick);

  return {
    destroy() {
      disposed = true;
      window.cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerUp);
      renderer.dispose();
      parent.removeChild(renderer.domElement);
    },
    restart() {
      resetRun();
    },
    chooseUpgrade(skillId: SkillId) {
      applyUpgrade(skillId);
    },
    setMoveInput(x: number, z: number) {
      joystickX = x;
      joystickZ = z;
    },
  };
}
