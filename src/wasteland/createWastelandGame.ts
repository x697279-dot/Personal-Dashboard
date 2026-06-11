import Phaser from 'phaser';

export type WastelandStatus = 'playing' | 'levelup' | 'gameover' | 'victory';

export type SkillId =
  | 'fireball'
  | 'laser'
  | 'missile'
  | 'lightning'
  | 'drone'
  | 'attack'
  | 'fireRate'
  | 'crit'
  | 'moveSpeed'
  | 'maxHp'
  | 'magnet'
  | 'armor'
  | 'thunderFireball';

type SkillQuality = '普通' | '稀有' | '史诗' | '传说';
type SkillCategory = '主动' | '被动' | '融合';

export type WastelandUpgradeChoice = {
  id: SkillId;
  name: string;
  description: string;
  level: number;
  quality: SkillQuality;
  category: SkillCategory;
};

export type WastelandPoiKind =
  | 'camp'
  | 'ruins'
  | 'supply'
  | 'boss-gate'
  | 'forest'
  | 'metro'
  | 'scrapyard'
  | 'hospital';

export type WastelandPoiState = {
  id: string;
  name: string;
  x: number;
  z: number;
  kind: WastelandPoiKind;
  discovered: boolean;
};

export type WastelandSkillCooldown = {
  remaining: number;
  total: number;
};

export type WastelandHudState = {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  nextXp: number;
  kills: number;
  time: number;
  wave: number;
  status: WastelandStatus;
  bossHp: number;
  bossMaxHp: number;
  bossX: number;
  bossZ: number;
  skills: Record<SkillId, number>;
  skillCooldowns: Partial<Record<SkillId, WastelandSkillCooldown>>;
  autoFireball: boolean;
  mapX: number;
  mapZ: number;
  worldSize: number;
  pois: WastelandPoiState[];
  discoveredPois: number;
  totalPois: number;
  latestDiscovery: string;
};

export type WastelandRunResult = {
  bestKills: number;
  totalScrap: number;
  gearLevel: number;
};

export type WastelandCallbacks = {
  onHudUpdate: (state: WastelandHudState) => void;
  onUpgradeChoices: (choices: WastelandUpgradeChoice[]) => void;
  onRunResult: (result: WastelandRunResult) => void;
  onReady: () => void;
};

export type WastelandOptions = {
  gearLevel: number;
  bestKills: number;
  totalScrap: number;
};

type EnemyKind = 'crawler' | 'raider' | 'brute' | 'bomber';

type EnemyRecord = {
  sprite: Phaser.Physics.Arcade.Sprite;
  kind: EnemyKind | 'boss';
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
};

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
  {
    id: 'fireball',
    name: '火球',
    category: '主动',
    quality: '普通',
    maxLevel: 5,
    descriptions: ['发射燃烧火球', '火球伤害提升', '火球爆炸范围提升', '火球数量 +1', '火球附带灼烧爆裂'],
  },
  {
    id: 'laser',
    name: '激光',
    category: '主动',
    quality: '稀有',
    maxLevel: 5,
    descriptions: ['周期发射贯穿激光', '激光宽度提升', '激光冷却降低', '激光伤害提升', '双重扫射'],
  },
  {
    id: 'missile',
    name: '导弹',
    category: '主动',
    quality: '史诗',
    maxLevel: 5,
    descriptions: ['自动发射追踪导弹', '导弹爆炸范围提升', '导弹伤害提升', '导弹数量 +1', '集束导弹'],
  },
  {
    id: 'lightning',
    name: '雷电链',
    category: '主动',
    quality: '稀有',
    maxLevel: 5,
    descriptions: ['释放弹跳闪电', '弹跳次数提升', '雷电伤害提升', '冷却降低', '雷暴连锁'],
  },
  {
    id: 'drone',
    name: '无人机',
    category: '主动',
    quality: '稀有',
    maxLevel: 5,
    descriptions: ['解锁环绕无人机', '无人机数量 +1', '无人机伤害提升', '无人机旋转范围扩大'],
  },
  {
    id: 'attack',
    name: '攻击力',
    category: '被动',
    quality: '普通',
    maxLevel: 5,
    descriptions: ['所有伤害 +16%', '所有伤害 +32%', '所有伤害 +48%', '所有伤害 +64%', '所有伤害 +85%'],
  },
  {
    id: 'fireRate',
    name: '攻速',
    category: '被动',
    quality: '普通',
    maxLevel: 5,
    descriptions: ['主动技能冷却降低', '火球射速提升', '导弹装填提升', '激光冷却降低', '全武器过载'],
  },
  {
    id: 'crit',
    name: '暴击率',
    category: '被动',
    quality: '稀有',
    maxLevel: 5,
    descriptions: ['暴击率 +8%', '暴击率 +16%', '暴击伤害提升', '暴击率 +28%', '弱点打击'],
  },
  {
    id: 'moveSpeed',
    name: '移动速度',
    category: '被动',
    quality: '普通',
    maxLevel: 5,
    descriptions: ['移动速度提升', '穿越废墟更敏捷', '移动速度大幅提升', '受击后短暂加速', '荒野疾行'],
  },
  {
    id: 'magnet',
    name: '磁吸背包',
    category: '被动',
    quality: '稀有',
    maxLevel: 5,
    descriptions: ['拾取范围提升', '经验晶体价值提升', '移动速度提升', '废料收益提升'],
  },
  {
    id: 'armor',
    name: '机甲护甲',
    category: '被动',
    quality: '史诗',
    maxLevel: 5,
    descriptions: ['最大生命提升', '受伤无敌延长', '碰撞伤害降低', '濒死时恢复生命'],
  },
  {
    id: 'maxHp',
    name: '生命值',
    category: '被动',
    quality: '普通',
    maxLevel: 5,
    descriptions: ['最大生命 +20', '最大生命 +40', '最大生命 +60', '最大生命 +85', '再生装甲'],
  },
  {
    id: 'thunderFireball',
    name: '雷火球',
    category: '融合',
    quality: '传说',
    maxLevel: 1,
    hidden: true,
    descriptions: ['火球 + 雷电链融合，火球爆炸后触发连锁电弧'],
  },
];

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
  skillCooldowns: {},
  autoFireball: true,
  mapX: 0,
  mapZ: 0,
  worldSize: 500,
  pois: [],
  discoveredPois: 0,
  totalPois: 0,
  latestDiscovery: '',
};

let callbacks: WastelandCallbacks | null = null;
let options: WastelandOptions = {
  gearLevel: 0,
  bestKills: 0,
  totalScrap: 0,
};

function pushHud() {
  callbacks?.onHudUpdate({
    ...hudState,
    skills: { ...hudState.skills },
  });
}

function createTextures(scene: Phaser.Scene) {
  const player = scene.make.graphics({ x: 0, y: 0, add: false });
  player.fillStyle(0xd9f99d);
  player.fillCircle(24, 13, 12);
  player.fillStyle(0x7c3aed);
  player.fillRect(14, 24, 20, 26);
  player.fillStyle(0x38bdf8);
  player.fillRect(4, 26, 12, 18);
  player.fillRect(32, 26, 12, 18);
  player.fillStyle(0x111827);
  player.fillRect(12, 50, 10, 14);
  player.fillRect(26, 50, 10, 14);
  player.fillStyle(0xfef3c7);
  player.fillCircle(20, 13, 2);
  player.fillCircle(28, 13, 2);
  player.generateTexture('ws-player', 48, 64);
  player.destroy();

  const fireball = scene.make.graphics({ x: 0, y: 0, add: false });
  fireball.fillStyle(0xffedd5);
  fireball.fillCircle(9, 9, 8);
  fireball.fillStyle(0xf97316);
  fireball.fillCircle(9, 9, 6);
  fireball.fillStyle(0xef4444);
  fireball.fillCircle(6, 7, 3);
  fireball.generateTexture('ws-fireball', 18, 18);
  fireball.destroy();

  const missile = scene.make.graphics({ x: 0, y: 0, add: false });
  missile.fillStyle(0xe5e7eb);
  missile.fillTriangle(18, 6, 4, 0, 4, 12);
  missile.fillStyle(0xef4444);
  missile.fillRect(0, 3, 8, 6);
  missile.fillStyle(0xfacc15);
  missile.fillCircle(0, 6, 3);
  missile.generateTexture('ws-missile', 20, 12);
  missile.destroy();

  const drone = scene.make.graphics({ x: 0, y: 0, add: false });
  drone.fillStyle(0x84cc16);
  drone.fillCircle(10, 10, 10);
  drone.fillStyle(0x0f172a);
  drone.fillCircle(10, 10, 4);
  drone.generateTexture('ws-drone', 20, 20);
  drone.destroy();

  const lightningNode = scene.make.graphics({ x: 0, y: 0, add: false });
  lightningNode.fillStyle(0x67e8f9);
  lightningNode.fillCircle(6, 6, 6);
  lightningNode.lineStyle(2, 0xecfeff);
  lightningNode.strokeCircle(6, 6, 5);
  lightningNode.generateTexture('ws-lightning-node', 12, 12);
  lightningNode.destroy();

  const xp = scene.make.graphics({ x: 0, y: 0, add: false });
  xp.fillStyle(0x22d3ee);
  xp.fillTriangle(7, 0, 14, 8, 7, 16);
  xp.fillTriangle(7, 0, 0, 8, 7, 16);
  xp.generateTexture('ws-xp', 14, 16);
  xp.destroy();

  const scrap = scene.make.graphics({ x: 0, y: 0, add: false });
  scrap.fillStyle(0xfacc15);
  scrap.fillRect(2, 2, 14, 12);
  scrap.lineStyle(2, 0x713f12);
  scrap.strokeRect(2, 2, 14, 12);
  scrap.generateTexture('ws-scrap', 18, 16);
  scrap.destroy();

  const crawler = scene.make.graphics({ x: 0, y: 0, add: false });
  crawler.fillStyle(0x8dd77f);
  crawler.fillCircle(18, 18, 18);
  crawler.fillStyle(0x3f6212);
  crawler.fillCircle(9, 24, 6);
  crawler.fillCircle(27, 24, 6);
  crawler.fillStyle(0x1f2937);
  crawler.fillCircle(12, 15, 3);
  crawler.fillCircle(24, 15, 3);
  crawler.lineStyle(2, 0xa3e635, 0.9);
  crawler.strokeCircle(18, 18, 17);
  crawler.generateTexture('ws-crawler', 36, 36);
  crawler.destroy();

  const raider = scene.make.graphics({ x: 0, y: 0, add: false });
  raider.fillStyle(0x65a30d);
  raider.fillRoundedRect(4, 4, 36, 38, 8);
  raider.fillStyle(0xd9f99d);
  raider.fillCircle(16, 17, 4);
  raider.fillCircle(29, 17, 4);
  raider.fillStyle(0x431407);
  raider.fillRect(10, 30, 24, 5);
  raider.generateTexture('ws-raider', 44, 46);
  raider.destroy();

  const brute = scene.make.graphics({ x: 0, y: 0, add: false });
  brute.fillStyle(0x4d7c0f);
  brute.fillRoundedRect(4, 4, 54, 52, 12);
  brute.fillStyle(0xbbf7d0);
  brute.fillCircle(20, 22, 5);
  brute.fillCircle(40, 22, 5);
  brute.fillStyle(0x84cc16);
  brute.fillCircle(48, 12, 8);
  brute.fillStyle(0x111827);
  brute.fillRect(18, 38, 24, 6);
  brute.generateTexture('ws-brute', 62, 62);
  brute.destroy();

  const bomber = scene.make.graphics({ x: 0, y: 0, add: false });
  bomber.fillStyle(0xfacc15);
  bomber.fillCircle(22, 22, 21);
  bomber.fillStyle(0xef4444);
  bomber.fillCircle(22, 22, 11);
  bomber.generateTexture('ws-bomber', 44, 44);
  bomber.destroy();

  const boss = scene.make.graphics({ x: 0, y: 0, add: false });
  boss.fillStyle(0x1f2937);
  boss.fillRoundedRect(14, 8, 100, 88, 18);
  boss.fillStyle(0xef4444);
  boss.fillRoundedRect(24, 18, 80, 64, 12);
  boss.fillStyle(0xfacc15);
  boss.fillCircle(64, 48, 20);
  boss.fillStyle(0x991b1b);
  boss.fillRect(44, 2, 40, 18);
  boss.fillStyle(0x6b7280);
  boss.fillRect(5, 18, 24, 12);
  boss.fillRect(99, 18, 24, 12);
  boss.fillStyle(0x7f1d1d);
  boss.fillRect(0, 36, 28, 14);
  boss.fillRect(100, 36, 28, 14);
  boss.fillStyle(0xf97316);
  boss.fillCircle(10, 42, 5);
  boss.fillCircle(118, 42, 5);
  boss.fillStyle(0x111827);
  boss.fillRoundedRect(20, 88, 32, 18, 9);
  boss.fillRoundedRect(76, 88, 32, 18, 9);
  boss.generateTexture('ws-boss', 128, 112);
  boss.destroy();

  const dust = scene.make.graphics({ x: 0, y: 0, add: false });
  dust.fillStyle(0xf6e6b1, 0.9);
  dust.fillCircle(3, 3, 3);
  dust.generateTexture('ws-dust', 6, 6);
  dust.destroy();
}

class WastelandMainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;

  private enemies!: Phaser.Physics.Arcade.Group;

  private bullets!: Phaser.Physics.Arcade.Group;

  private pickups!: Phaser.Physics.Arcade.Group;

  private drones: Phaser.GameObjects.Image[] = [];

  private enemyRecords: EnemyRecord[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private fireTimer = 0;

  private laserTimer = 0;

  private missileTimer = 0;

  private lightningTimer = 0;

  private spawnTimer = 0;

  private fusionPulseTimer = 0;

  private bossAttackTimer = 0;

  private invincibleUntil = 0;

  private pointerActive = false;

  private bossSpawned = false;

  private pendingChoices: WastelandUpgradeChoice[] = [];

  constructor() {
    super('WastelandMainScene');
  }

  create() {
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
    hudState.skills = {
      fireball: 1,
      laser: 0,
      missile: 0,
      lightning: 0,
      drone: options.gearLevel >= 2 ? 1 : 0,
      attack: 0,
      fireRate: 0,
      crit: 0,
      moveSpeed: 0,
      maxHp: 0,
      magnet: 0,
      armor: 0,
      thunderFireball: 0,
    };

    this.enemyRecords = [];
    this.drones = [];
    this.fireTimer = 0;
    this.laserTimer = 0;
    this.missileTimer = 0;
    this.lightningTimer = 0;
    this.spawnTimer = 0;
    this.fusionPulseTimer = 0;
    this.bossAttackTimer = 0;
    this.bossSpawned = false;
    this.pendingChoices = [];

    const { width, height } = this.scale;
    this.createMap(width, height);

    this.bullets = this.physics.add.group({
      defaultKey: 'ws-fireball',
      maxSize: 120,
    });
    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group({
      maxSize: 140,
    });

    this.player = this.physics.add.sprite(width / 2, height / 2, 'ws-player');
    this.player.setDepth(12);
    this.player.setCollideWorldBounds(true);
    this.player.body?.setSize(28, 42, true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };

    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.handleBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.enemies,
      (_player, enemyObj) => {
        const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
        const record = this.enemyRecords.find((entry) => entry.sprite === enemy);
        if (!record) return;
        if (record.kind === 'bomber') this.damageEnemy(record, record.maxHp);
        this.damagePlayer(record.damage);
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.pickups,
      (_player, pickupObj) => this.collectPickup(pickupObj as Phaser.Physics.Arcade.Sprite),
      undefined,
      this,
    );

    this.input.on('pointerdown', () => {
      this.pointerActive = true;
    });

    this.input.on('pointerup', () => {
      this.pointerActive = false;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pointerActive || hudState.status !== 'playing') return;
      this.movePlayerTo(pointer.x, pointer.y);
    });

    this.events.removeAllListeners('choose-upgrade');
    this.events.on('choose-upgrade', (skillId: SkillId) => this.applyUpgrade(skillId));
    pushHud();
    callbacks?.onReady();
  }

  private createMap(width: number, height: number) {
    this.add.rectangle(width / 2, height / 2, width, height, 0x172018);

    const avenue = this.add.rectangle(width / 2, height / 2, Math.max(width, height) * 1.75, 118, 0x3b3a2f, 0.58);
    avenue.setRotation(-0.46);
    avenue.setDepth(0);

    const crossRoad = this.add.rectangle(width / 2, height * 0.58, Math.max(width, height) * 1.5, 74, 0x2f3329, 0.58);
    crossRoad.setRotation(0.22);
    crossRoad.setDepth(0);

    for (let i = 0; i < 64; i += 1) {
      const x = Phaser.Math.Between(-40, width + 40);
      const y = Phaser.Math.Between(-40, height + 40);
      const size = Phaser.Math.Between(32, 120);
      const colors = [0x24301f, 0x2f3a2a, 0x4b3f25, 0x263225];
      const color = colors[Phaser.Math.Between(0, colors.length - 1)];
      const rect = this.add.rectangle(x, y, size, Phaser.Math.Between(14, 34), color, 0.5);
      rect.setRotation(Phaser.Math.FloatBetween(-0.8, 0.8));
      rect.setDepth(0);
    }

    for (let i = 0; i < 30; i += 1) {
      const buildingWidth = Phaser.Math.Between(34, 90);
      const buildingHeight = Phaser.Math.Between(24, 76);
      const ruin = this.add.rectangle(
        Phaser.Math.Between(20, width - 20),
        Phaser.Math.Between(20, height - 20),
        buildingWidth,
        buildingHeight,
        Phaser.Math.Between(0, 1) ? 0x5c4a31 : 0x374151,
        0.46,
      );
      ruin.setRotation(Phaser.Math.FloatBetween(-1, 1));
      ruin.setDepth(1);

      const roofHole = this.add.rectangle(ruin.x, ruin.y, buildingWidth * 0.36, buildingHeight * 0.28, 0x10150d, 0.5);
      roofHole.setRotation(ruin.rotation + Phaser.Math.FloatBetween(-0.2, 0.2));
      roofHole.setDepth(2);
    }

    for (let i = 0; i < 42; i += 1) {
      const tree = this.add.circle(
        Phaser.Math.Between(-20, width + 20),
        Phaser.Math.Between(-20, height + 20),
        Phaser.Math.Between(9, 24),
        Phaser.Math.Between(0, 1) ? 0x2f6b2f : 0x4d7c0f,
        Phaser.Math.FloatBetween(0.42, 0.74),
      );
      tree.setDepth(3);
      const crown = this.add.circle(
        tree.x + Phaser.Math.Between(-10, 10),
        tree.y + Phaser.Math.Between(-10, 10),
        Phaser.Math.Between(7, 18),
        0x84cc16,
        Phaser.Math.FloatBetween(0.24, 0.48),
      );
      crown.setDepth(4);
    }

    for (let i = 0; i < 26; i += 1) {
      const vine = this.add.rectangle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.Between(48, 140),
        Phaser.Math.Between(5, 12),
        0x84cc16,
        0.34,
      );
      vine.setRotation(Phaser.Math.FloatBetween(-1.2, 1.2));
      vine.setDepth(5);
    }
  }

  private movePlayerTo(x: number, y: number) {
    const { width, height } = this.scale;
    this.player.x = Phaser.Math.Clamp(x, 26, width - 26);
    this.player.y = Phaser.Math.Clamp(y, 36, height - 36);
  }

  private getMoveSpeed() {
    return 220 + hudState.skills.moveSpeed * 18 + hudState.skills.magnet * 8 + options.gearLevel * 3;
  }

  private getFireInterval() {
    return Math.max(135, 470 - hudState.skills.fireball * 38 - hudState.skills.fireRate * 42 - options.gearLevel * 8);
  }

  private getBulletDamage() {
    return this.rollDamage(22 + hudState.skills.fireball * 8 + options.gearLevel * 3);
  }

  private getDamageMultiplier() {
    return 1 + hudState.skills.attack * 0.16;
  }

  private rollDamage(baseDamage: number) {
    const critChance = Math.min(0.55, hudState.skills.crit * 0.08);
    const critMultiplier = hudState.skills.crit >= 3 ? 2.15 : 1.8;
    const isCrit = Math.random() < critChance;
    return Math.round(baseDamage * this.getDamageMultiplier() * (isCrit ? critMultiplier : 1));
  }

  private getPickupRange() {
    return 56 + hudState.skills.magnet * 34;
  }

  private findNearestEnemy(maxDistance: number) {
    let nearest: EnemyRecord | null = null;
    let nearestDistance = maxDistance;
    for (const enemy of this.enemyRecords) {
      if (!enemy.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private fireAtTarget() {
    const target = this.findNearestEnemy(620);
    if (!target) return;

    const projectileCount = hudState.skills.fireball >= 4 ? 2 : 1;
    for (let i = 0; i < projectileCount; i += 1) {
      const bullet = this.bullets.get(this.player.x, this.player.y, 'ws-fireball') as Phaser.Physics.Arcade.Sprite | false;
      if (!bullet) return;

      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.sprite.x, target.sprite.y) + (i === 0 ? 0 : 0.14);
      bullet.setTexture('ws-fireball');
      bullet.setActive(true);
      bullet.setVisible(true);
      bullet.body.enable = true;
      bullet.setDepth(10);
      bullet.setData('damage', this.getBulletDamage());
      bullet.setData('pierce', 0);
      bullet.setData('projectile', hudState.skills.thunderFireball > 0 ? 'thunderFireball' : 'fireball');
      bullet.setVelocity(Math.cos(angle) * 560, Math.sin(angle) * 560);
    }
  }

  private fireMissiles() {
    const target = this.findNearestEnemy(720);
    if (!target || hudState.skills.missile <= 0) return;

    const count = hudState.skills.missile >= 4 ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
      const missile = this.bullets.get(this.player.x, this.player.y, 'ws-missile') as Phaser.Physics.Arcade.Sprite | false;
      if (!missile) return;

      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.sprite.x, target.sprite.y) + (i === 0 ? 0 : -0.18);
      missile.setTexture('ws-missile');
      missile.setActive(true);
      missile.setVisible(true);
      missile.body.enable = true;
      missile.setDepth(10);
      missile.setRotation(angle);
      missile.setData('damage', this.rollDamage(52 + hudState.skills.missile * 18));
      missile.setData('pierce', 0);
      missile.setData('projectile', 'missile');
      missile.setVelocity(Math.cos(angle) * 430, Math.sin(angle) * 430);
    }
  }

  private fireLaser() {
    if (hudState.skills.laser <= 0) return;
    const target = this.findNearestEnemy(760);
    if (!target) return;

    const startX = this.player.x;
    const startY = this.player.y;
    const endX = target.sprite.x;
    const endY = target.sprite.y;
    const width = 16 + hudState.skills.laser * 5;
    const damage = this.rollDamage(44 + hudState.skills.laser * 16);

    const beam = this.add.line(0, 0, startX, startY, endX, endY, 0x67e8f9, 0.95).setOrigin(0, 0);
    beam.setLineWidth(width, width * 0.35);
    beam.setDepth(17);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 180,
      onComplete: () => beam.destroy(),
    });

    let hits = 0;
    for (const enemy of [...this.enemyRecords]) {
      if (!enemy.sprite.active) continue;
      const distance = this.distanceToSegment(enemy.sprite.x, enemy.sprite.y, startX, startY, endX, endY);
      if (distance > width + 18) continue;
      this.damageEnemy(enemy, damage);
      hits += 1;
      if (hudState.skills.laser < 5 && hits >= 5) break;
    }
  }

  private castLightningChain() {
    if (hudState.skills.lightning <= 0) return;
    let current = this.findNearestEnemy(640);
    if (!current) return;

    const chained = new Set<EnemyRecord>();
    const maxJumps = 2 + hudState.skills.lightning;
    let fromX = this.player.x;
    let fromY = this.player.y;

    for (let i = 0; i < maxJumps && current; i += 1) {
      chained.add(current);
      const bolt = this.add.line(0, 0, fromX, fromY, current.sprite.x, current.sprite.y, 0x67e8f9, 0.95).setOrigin(0, 0);
      bolt.setLineWidth(4, 1);
      bolt.setDepth(18);
      const node = this.add.image(current.sprite.x, current.sprite.y, 'ws-lightning-node').setDepth(19);
      this.tweens.add({
        targets: [bolt, node],
        alpha: 0,
        scale: 1.8,
        duration: 220,
        onComplete: () => {
          bolt.destroy();
          node.destroy();
        },
      });

      this.damageEnemy(current, this.rollDamage(28 + hudState.skills.lightning * 12));
      fromX = current.sprite.x;
      fromY = current.sprite.y;

      current = null;
      let nearestDistance = 210;
      for (const enemy of this.enemyRecords) {
        if (!enemy.sprite.active || chained.has(enemy)) continue;
        const distance = Phaser.Math.Distance.Between(fromX, fromY, enemy.sprite.x, enemy.sprite.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          current = enemy;
        }
      }
    }
  }

  private distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Phaser.Math.Clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
    const projectionX = ax + t * dx;
    const projectionY = ay + t * dy;
    return Phaser.Math.Distance.Between(px, py, projectionX, projectionY);
  }

  private applyAreaDamage(x: number, y: number, radius: number, damage: number) {
    const ring = this.add.circle(x, y, 8, 0xf97316, 0.2);
    ring.setStrokeStyle(3, 0xfacc15, 0.8);
    ring.setDepth(16);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 260,
      onComplete: () => ring.destroy(),
    });

    for (const enemy of [...this.enemyRecords]) {
      if (!enemy.sprite.active) continue;
      const distance = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (distance <= radius) this.damageEnemy(enemy, damage);
    }
  }

  private spawnEnemy() {
    const { width, height } = this.scale;
    const edge = Phaser.Math.Between(0, 3);
    const x = edge === 0 ? -40 : edge === 1 ? width + 40 : Phaser.Math.Between(0, width);
    const y = edge === 2 ? -40 : edge === 3 ? height + 40 : Phaser.Math.Between(0, height);
    const roll = Math.random();
    let kind: EnemyKind = 'crawler';
    if (hudState.wave >= 4 && roll > 0.82) kind = 'brute';
    else if (hudState.wave >= 3 && roll > 0.68) kind = 'bomber';
    else if (hudState.wave >= 2 && roll > 0.45) kind = 'raider';

    const config = this.getEnemyConfig(kind);
    const sprite = this.enemies.create(x, y, `ws-${kind}`) as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(8);
    sprite.body?.setSize(config.body, config.body, true);
    sprite.setData('kind', kind);

    this.enemyRecords.push({
      sprite,
      kind,
      hp: config.hp + hudState.wave * config.hpScale,
      maxHp: config.hp + hudState.wave * config.hpScale,
      speed: config.speed + hudState.wave * 4,
      damage: config.damage,
    });
  }

  private getEnemyConfig(kind: EnemyKind) {
    const configs = {
      crawler: { hp: 32, hpScale: 5, speed: 76, damage: 10, xp: 4, scrap: 1, body: 26 },
      raider: { hp: 54, hpScale: 8, speed: 98, damage: 13, xp: 7, scrap: 2, body: 32 },
      brute: { hp: 138, hpScale: 16, speed: 52, damage: 20, xp: 16, scrap: 4, body: 44 },
      bomber: { hp: 44, hpScale: 7, speed: 124, damage: 24, xp: 8, scrap: 3, body: 30 },
    } satisfies Record<EnemyKind, { hp: number; hpScale: number; speed: number; damage: number; xp: number; scrap: number; body: number }>;
    return configs[kind];
  }

  private spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const { width } = this.scale;
    const sprite = this.enemies.create(width / 2, -80, 'ws-boss') as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(9);
    sprite.setData('kind', 'boss');
    sprite.body?.setSize(96, 78, true);

    const maxHp = 900 + options.gearLevel * 70;
    hudState.bossMaxHp = maxHp;
    hudState.bossHp = maxHp;
    pushHud();

    this.enemyRecords.push({
      sprite,
      kind: 'boss',
      hp: maxHp,
      maxHp,
      speed: 34,
      damage: 28,
    });
  }

  private handleBulletHitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const record = this.enemyRecords.find((entry) => entry.sprite === enemy);
    if (!bullet.active || !record) return;

    const damage = bullet.getData('damage') as number;
    const projectile = bullet.getData('projectile') as 'fireball' | 'missile' | 'thunderFireball';
    this.damageEnemy(record, damage);

    if (projectile === 'missile') {
      this.applyAreaDamage(enemy.x, enemy.y, 72 + hudState.skills.missile * 12, Math.round(damage * 0.72));
    }

    if (projectile === 'thunderFireball') {
      this.applyAreaDamage(enemy.x, enemy.y, 48 + hudState.skills.fireball * 8, Math.round(damage * 0.42));
      this.castLightningChain();
    }

    const pierce = (bullet.getData('pierce') as number) ?? 0;
    if (pierce > 0) {
      bullet.setData('pierce', pierce - 1);
    } else {
      this.recycleBullet(bullet);
    }
  }

  private damageEnemy(record: EnemyRecord, damage: number) {
    record.hp -= damage;
    if (record.kind === 'boss') {
      hudState.bossHp = Math.max(record.hp, 0);
      pushHud();
    }

    record.sprite.setTint(0xffffff);
    this.time.delayedCall(70, () => {
      if (record.sprite.active) record.sprite.clearTint();
    });

    if (record.hp > 0) return;
    this.killEnemy(record);
  }

  private killEnemy(record: EnemyRecord) {
    const { sprite, kind } = record;
    const x = sprite.x;
    const y = sprite.y;
    this.createExplosion(x, y, kind === 'boss' ? 24 : kind === 'brute' ? 12 : 7);
    this.enemyRecords = this.enemyRecords.filter((entry) => entry !== record);
    sprite.destroy();

    if (kind === 'boss') {
      hudState.status = 'victory';
      hudState.bossHp = 0;
      hudState.kills += 1;
      this.finishRun(true);
      return;
    }

    const config = this.getEnemyConfig(kind as EnemyKind);
    hudState.kills += 1;
    this.spawnPickup(x, y, 'xp', config.xp + hudState.skills.magnet);
    if (Math.random() < 0.38) this.spawnPickup(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-10, 10), 'scrap', config.scrap);
    pushHud();
  }

  private createExplosion(x: number, y: number, count: number) {
    for (let i = 0; i < count; i += 1) {
      const particle = this.add.image(x, y, 'ws-dust');
      const colors = [0xa3e635, 0xfacc15, 0xef4444, 0xf6e6b1];
      particle.setTint(colors[Phaser.Math.Between(0, colors.length - 1)]);
      particle.setDepth(18);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(24, 96);
      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(240, 520),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private spawnPickup(x: number, y: number, kind: 'xp' | 'scrap', amount: number) {
    const pickup = this.pickups.get(x, y, kind === 'xp' ? 'ws-xp' : 'ws-scrap') as Phaser.Physics.Arcade.Sprite | false;
    if (!pickup) return;
    pickup.setTexture(kind === 'xp' ? 'ws-xp' : 'ws-scrap');
    pickup.setActive(true);
    pickup.setVisible(true);
    pickup.body.enable = true;
    pickup.setDepth(7);
    pickup.setData('kind', kind);
    pickup.setData('amount', amount);
  }

  private collectPickup(pickup: Phaser.Physics.Arcade.Sprite) {
    if (!pickup.active) return;
    const kind = pickup.getData('kind') as 'xp' | 'scrap';
    const amount = pickup.getData('amount') as number;
    pickup.setActive(false);
    pickup.setVisible(false);
    pickup.body.enable = false;

    if (kind === 'xp') {
      hudState.xp += amount;
      while (hudState.xp >= hudState.nextXp && hudState.status === 'playing') {
        hudState.xp -= hudState.nextXp;
        hudState.level += 1;
        hudState.nextXp = Math.round(hudState.nextXp * 1.34 + 6);
        this.openLevelUp();
      }
    } else {
      options.totalScrap += amount + Math.floor(hudState.skills.magnet / 2);
    }
    pushHud();
  }

  private openLevelUp() {
    hudState.status = 'levelup';
    this.physics.pause();
    this.pendingChoices = this.createUpgradeChoices();
    if (this.pendingChoices.length === 0) {
      hudState.hp = Math.min(hudState.maxHp, hudState.hp + 30);
      hudState.status = 'playing';
      this.physics.resume();
      pushHud();
      return;
    }
    callbacks?.onUpgradeChoices(this.pendingChoices);
    pushHud();
  }

  private createUpgradeChoices() {
    const candidates = skillDefinitions
      .filter((skill) => !skill.hidden && hudState.skills[skill.id] < skill.maxLevel)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    return candidates.map((skill) => {
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

  private applyUpgrade(skillId: SkillId) {
    if (hudState.status !== 'levelup') return;
    if (!this.pendingChoices.some((choice) => choice.id === skillId)) return;

    const skill = skillDefinitions.find((definition) => definition.id === skillId);
    hudState.skills[skillId] = Math.min(hudState.skills[skillId] + 1, skill?.maxLevel ?? 5);
    if (skillId === 'armor' || skillId === 'maxHp') {
      const hpGain = skillId === 'maxHp' ? 20 : 18;
      hudState.maxHp += hpGain;
      hudState.hp = Math.min(hudState.maxHp, hudState.hp + hpGain);
    }
    this.checkSkillFusion();

    this.pendingChoices = [];
    callbacks?.onUpgradeChoices([]);
    hudState.status = 'playing';
    this.physics.resume();
    pushHud();
  }

  private checkSkillFusion() {
    if (hudState.skills.fireball > 0 && hudState.skills.lightning > 0 && hudState.skills.thunderFireball === 0) {
      hudState.skills.thunderFireball = 1;
      const label = this.add.text(this.player.x, this.player.y - 58, '融合技：雷火球', {
        color: '#fef3c7',
        fontSize: '18px',
        fontStyle: 'bold',
        stroke: '#7c2d12',
        strokeThickness: 4,
      });
      label.setOrigin(0.5);
      label.setDepth(40);
      this.tweens.add({
        targets: label,
        y: label.y - 42,
        alpha: 0,
        duration: 1200,
        onComplete: () => label.destroy(),
      });
    }
  }

  private damagePlayer(amount: number) {
    if (hudState.status !== 'playing') return;
    if (this.time.now < this.invincibleUntil) return;

    const reduction = Math.min(0.55, hudState.skills.armor * 0.1);
    hudState.hp -= Math.max(1, Math.round(amount * (1 - reduction)));
    this.invincibleUntil = this.time.now + 760 + hudState.skills.armor * 160;

    this.tweens.add({
      targets: this.player,
      alpha: 0.28,
      duration: 80,
      yoyo: true,
      repeat: 5,
      onComplete: () => this.player.setAlpha(1),
    });

    if (hudState.hp <= 0 && hudState.skills.armor >= 4) {
      hudState.skills.armor = 3;
      hudState.hp = Math.round(hudState.maxHp * 0.35);
    }

    if (hudState.hp <= 0) {
      hudState.hp = 0;
      hudState.status = 'gameover';
      this.finishRun(false);
    }
    pushHud();
  }

  private finishRun(victory: boolean) {
    this.physics.pause();
    this.player.setTint(victory ? 0xa3e635 : 0x94a3b8);
    options.bestKills = Math.max(options.bestKills, hudState.kills);
    options.gearLevel = Math.min(12, Math.floor(options.totalScrap / 35));
    callbacks?.onRunResult({
      bestKills: options.bestKills,
      totalScrap: options.totalScrap,
      gearLevel: options.gearLevel,
    });
    pushHud();
  }

  private recycleBullet(bullet: Phaser.Physics.Arcade.Sprite) {
    bullet.setActive(false);
    bullet.setVisible(false);
    if (bullet.body) bullet.body.enable = false;
    bullet.setVelocity(0, 0);
  }

  private updatePickups(delta: number) {
    const range = this.getPickupRange();
    const pickups = this.pickups.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const pickup of pickups) {
      if (!pickup.active) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, pickup.y);
      if (distance > range) continue;
      const angle = Phaser.Math.Angle.Between(pickup.x, pickup.y, this.player.x, this.player.y);
      const speed = Phaser.Math.Linear(120, 520, 1 - distance / range);
      pickup.x += Math.cos(angle) * speed * (delta / 1000);
      pickup.y += Math.sin(angle) * speed * (delta / 1000);
    }
  }

  private updateDrones(delta: number) {
    const targetCount = hudState.skills.drone;
    while (this.drones.length < targetCount) {
      const drone = this.add.image(this.player.x, this.player.y, 'ws-drone');
      drone.setDepth(11);
      this.drones.push(drone);
    }
    while (this.drones.length > targetCount) {
      this.drones.pop()?.destroy();
    }

    const radius = 54 + hudState.skills.drone * 10;
    this.drones.forEach((drone, index) => {
      const angle = this.time.now * 0.004 + index * ((Math.PI * 2) / Math.max(this.drones.length, 1));
      drone.x = this.player.x + Math.cos(angle) * radius;
      drone.y = this.player.y + Math.sin(angle) * radius;
    });

    if (targetCount <= 0) return;
    const damage = 10 + hudState.skills.drone * 8;
    for (const drone of this.drones) {
      for (const enemy of this.enemyRecords) {
        if (!enemy.sprite.active) continue;
        const distance = Phaser.Math.Distance.Between(drone.x, drone.y, enemy.sprite.x, enemy.sprite.y);
        if (distance < 28 + targetCount * 4) {
          this.damageEnemy(enemy, damage * (delta / 1000) * 4);
          break;
        }
      }
    }
  }

  private releasePulse() {
    const radius = 116 + hudState.skills.thunderFireball * 36;
    const circle = this.add.circle(this.player.x, this.player.y, 10, 0xa3e635, 0.18);
    circle.setStrokeStyle(3, 0xa3e635, 0.8);
    circle.setDepth(6);
    this.tweens.add({
      targets: circle,
      radius,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => circle.destroy(),
    });

    for (const enemy of [...this.enemyRecords]) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
      if (distance > radius) continue;
      this.damageEnemy(enemy, 34 + hudState.skills.fireball * 8 + hudState.skills.lightning * 8);
      if (hudState.skills.thunderFireball > 0 && enemy.sprite.active) {
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
        enemy.sprite.x += Math.cos(angle) * 24;
        enemy.sprite.y += Math.sin(angle) * 24;
      }
    }
  }

  private updateEnemies(delta: number) {
    const { width, height } = this.scale;
    for (const enemy of [...this.enemyRecords]) {
      if (!enemy.sprite.active) continue;

      const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.x, this.player.y);
      const bossModifier = enemy.kind === 'boss' ? 0.45 : 1;
      enemy.sprite.x += Math.cos(angle) * enemy.speed * bossModifier * (delta / 1000);
      enemy.sprite.y += Math.sin(angle) * enemy.speed * bossModifier * (delta / 1000);

      if (enemy.kind === 'boss') {
        enemy.sprite.x = Phaser.Math.Clamp(enemy.sprite.x, 80, width - 80);
        enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, 86, height - 86);
      }

      if (enemy.sprite.x < -160 || enemy.sprite.x > width + 160 || enemy.sprite.y < -160 || enemy.sprite.y > height + 160) {
        enemy.sprite.destroy();
        this.enemyRecords = this.enemyRecords.filter((entry) => entry !== enemy);
      }
    }
  }

  private bossAttack() {
    const boss = this.enemyRecords.find((enemy) => enemy.kind === 'boss');
    if (!boss) return;

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + this.time.now * 0.001;
      const warning = this.add.circle(boss.sprite.x + Math.cos(angle) * 86, boss.sprite.y + Math.sin(angle) * 86, 10, 0xef4444, 0.22);
      warning.setStrokeStyle(2, 0xfacc15, 0.7);
      warning.setDepth(5);
      this.tweens.add({
        targets: warning,
        scale: 4.2,
        alpha: 0,
        duration: 700,
        onComplete: () => warning.destroy(),
      });
    }

    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, boss.sprite.x, boss.sprite.y) < 170) {
      this.damagePlayer(18);
    }
  }

  update(_time: number, delta: number) {
    if (hudState.status !== 'playing') return;

    const moveX =
      (this.cursors.left?.isDown || this.wasd.A.isDown ? -1 : 0) +
      (this.cursors.right?.isDown || this.wasd.D.isDown ? 1 : 0);
    const moveY =
      (this.cursors.up?.isDown || this.wasd.W.isDown ? -1 : 0) +
      (this.cursors.down?.isDown || this.wasd.S.isDown ? 1 : 0);
    const speed = this.getMoveSpeed();

    if (moveX !== 0 || moveY !== 0) {
      const length = Math.hypot(moveX, moveY) || 1;
      this.player.x += (moveX / length) * speed * (delta / 1000);
      this.player.y += (moveY / length) * speed * (delta / 1000);
      this.movePlayerTo(this.player.x, this.player.y);
    }

    hudState.time += delta / 1000;
    hudState.wave = Math.max(1, Math.floor(hudState.time / 24) + 1);

    this.spawnTimer += delta;
    const spawnInterval = Math.max(260, 900 - hudState.wave * 65);
    if (this.spawnTimer >= spawnInterval && this.enemyRecords.length < 56) {
      this.spawnTimer = 0;
      this.spawnEnemy();
      if (hudState.wave >= 3 && Math.random() > 0.58) this.spawnEnemy();
    }

    if (hudState.time > 86 || hudState.kills >= 90) this.spawnBoss();

    this.fireTimer += delta;
    if (this.fireTimer >= this.getFireInterval()) {
      this.fireTimer = 0;
      this.fireAtTarget();
    }

    this.laserTimer += delta;
    const laserCooldown = Math.max(1250, 4200 - hudState.skills.laser * 360 - hudState.skills.fireRate * 160);
    if (hudState.skills.laser > 0 && this.laserTimer >= laserCooldown) {
      this.laserTimer = 0;
      this.fireLaser();
    }

    this.missileTimer += delta;
    const missileCooldown = Math.max(900, 3600 - hudState.skills.missile * 260 - hudState.skills.fireRate * 140);
    if (hudState.skills.missile > 0 && this.missileTimer >= missileCooldown) {
      this.missileTimer = 0;
      this.fireMissiles();
    }

    this.lightningTimer += delta;
    const lightningCooldown = Math.max(950, 3300 - hudState.skills.lightning * 250 - hudState.skills.fireRate * 120);
    if (hudState.skills.lightning > 0 && this.lightningTimer >= lightningCooldown) {
      this.lightningTimer = 0;
      this.castLightningChain();
    }

    this.fusionPulseTimer += delta;
    const fusionPulseCooldown = 5200;
    if (hudState.skills.thunderFireball > 0 && this.fusionPulseTimer >= fusionPulseCooldown) {
      this.fusionPulseTimer = 0;
      this.releasePulse();
    }

    this.bossAttackTimer += delta;
    if (this.bossSpawned && this.bossAttackTimer >= 2800) {
      this.bossAttackTimer = 0;
      this.bossAttack();
    }

    this.updateEnemies(delta);
    this.updatePickups(delta);
    this.updateDrones(delta);

    const { width, height } = this.scale;
    const bullets = this.bullets.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      if (bullet.x < -40 || bullet.x > width + 40 || bullet.y < -40 || bullet.y > height + 40) {
        this.recycleBullet(bullet);
      }
    }

    pushHud();
  }
}

class WastelandBootScene extends Phaser.Scene {
  constructor() {
    super('WastelandBootScene');
  }

  create() {
    createTextures(this);
    this.scene.start('WastelandMainScene');
  }
}

function getParentSize(parent: HTMLElement) {
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(Math.round(rect.width), 320),
    height: Math.max(Math.round(rect.height), 520),
  };
}

export function createWastelandGame(
  parent: HTMLElement,
  gameCallbacks: WastelandCallbacks,
  gameOptions: WastelandOptions,
): Phaser.Game {
  callbacks = gameCallbacks;
  options = { ...gameOptions };
  const { width, height } = getParentSize(parent);

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#172018',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [WastelandBootScene, WastelandMainScene],
  });
}

export function restartWastelandGame(game: Phaser.Game) {
  game.scene.stop('WastelandMainScene');
  game.scene.start('WastelandMainScene');
  game.scene.resume('WastelandMainScene');
}

export function chooseWastelandUpgrade(game: Phaser.Game, skillId: SkillId) {
  const scene = game.scene.getScene('WastelandMainScene');
  scene?.events.emit('choose-upgrade', skillId);
}
