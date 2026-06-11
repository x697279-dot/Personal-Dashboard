import Phaser from 'phaser';

export type PlatformerHudState = {
  score: number;
  coins: number;
  world: string;
  time: number;
  lives: number;
  level: number;
  form: PlayerForm;
  status: 'idle' | 'playing' | 'gameover' | 'won';
};

export type PlatformerCallbacks = {
  onHudUpdate: (state: PlatformerHudState) => void;
  onReady: () => void;
};

export type PlayerForm = 'small' | 'super' | 'fire' | 'star';
type BlockKind = 'ground' | 'brick' | 'question' | 'used' | 'pipe';
type PowerKind = 'coin' | 'mushroom' | 'flower' | 'star';
type ThemeKey = 'meadow' | 'night' | 'castle';

type BlockRecord = {
  sprite: Phaser.Physics.Arcade.Sprite;
  kind: BlockKind;
  loot?: PowerKind;
  hit: boolean;
};

type EnemyRecord = {
  sprite: Phaser.Physics.Arcade.Sprite;
  dead: boolean;
};

type LevelCell = {
  x: number;
  y: number;
  kind: BlockKind;
  loot?: PowerKind;
};

type EnemySpawn = { x: number; y: number; patrol: number };

type LevelDefinition = {
  label: string;
  theme: ThemeKey;
  length: number;
  groundY: number;
  flagX: number;
  time: number;
  blocks: LevelCell[];
  enemies: EnemySpawn[];
};

const TILE = 32;
const LEVEL_HEIGHT_TILES = 15;
const PLAYER_TEXTURE_KEY = 'cow';

let callbacks: PlatformerCallbacks | null = null;
let activeLevelIndex = 0;

const hudState: PlatformerHudState = {
  score: 0,
  coins: 0,
  world: '1-1',
  time: 400,
  lives: 3,
  level: 0,
  form: 'small',
  status: 'idle',
};

function pushHud() {
  callbacks?.onHudUpdate({ ...hudState });
}

function row(from: number, to: number, y: number, kind: BlockKind = 'ground'): LevelCell[] {
  return Array.from({ length: to - from + 1 }, (_, index) => ({
    x: from + index,
    y,
    kind,
  }));
}

function question(x: number, y: number, loot: PowerKind = 'coin'): LevelCell {
  return { x, y, kind: 'question', loot };
}

function brick(x: number, y: number): LevelCell {
  return { x, y, kind: 'brick' };
}

function pipe(x: number, y: number): LevelCell {
  return { x, y, kind: 'pipe' };
}

const LEVELS: LevelDefinition[] = [
  {
    label: '1-1',
    theme: 'meadow',
    length: 118,
    groundY: 13,
    flagX: 108,
    time: 400,
    blocks: [
      ...row(0, 118, 13),
      ...row(12, 22, 12),
      question(16, 9, 'mushroom'),
      question(20, 9),
      brick(21, 9),
      question(22, 9),
      brick(23, 9),
      question(24, 5),
      question(25, 5),
      question(26, 5),
      question(27, 5, 'flower'),
      ...row(28, 35, 9, 'brick'),
      question(46, 9),
      question(47, 9, 'star'),
      question(48, 9),
      brick(55, 10),
      question(56, 10),
      brick(57, 10),
      question(58, 6),
      question(59, 6),
      question(60, 6),
      ...row(70, 73, 10, 'brick'),
      question(74, 6),
      question(75, 6),
      question(76, 6),
      pipe(85, 11),
      pipe(92, 11),
      ...row(98, 101, 10, 'brick'),
    ],
    enemies: [
      { x: 24, y: 12, patrol: 3 },
      { x: 40, y: 12, patrol: 4 },
      { x: 52, y: 12, patrol: 3 },
      { x: 64, y: 12, patrol: 5 },
      { x: 78, y: 12, patrol: 4 },
      { x: 88, y: 12, patrol: 3 },
    ],
  },
  {
    label: '1-2',
    theme: 'night',
    length: 132,
    groundY: 13,
    flagX: 122,
    time: 360,
    blocks: [
      ...row(0, 38, 13),
      ...row(42, 132, 13),
      ...row(18, 26, 10, 'brick'),
      question(20, 7, 'mushroom'),
      question(24, 7),
      ...row(36, 40, 11, 'brick'),
      ...row(48, 52, 10, 'brick'),
      question(53, 10, 'flower'),
      ...row(62, 66, 8, 'brick'),
      question(67, 8),
      pipe(74, 11),
      ...row(82, 88, 9, 'brick'),
      question(90, 9, 'star'),
      ...row(98, 104, 11, 'brick'),
      question(112, 7),
      question(113, 7),
      question(114, 7, 'flower'),
    ],
    enemies: [
      { x: 28, y: 12, patrol: 5 },
      { x: 50, y: 12, patrol: 4 },
      { x: 70, y: 12, patrol: 5 },
      { x: 86, y: 8, patrol: 3 },
      { x: 100, y: 12, patrol: 4 },
      { x: 116, y: 12, patrol: 3 },
    ],
  },
  {
    label: '1-3',
    theme: 'castle',
    length: 146,
    groundY: 13,
    flagX: 136,
    time: 320,
    blocks: [
      ...row(0, 20, 13),
      ...row(23, 56, 13),
      ...row(60, 92, 13),
      ...row(96, 146, 13),
      ...row(14, 18, 10, 'brick'),
      question(16, 7, 'mushroom'),
      ...row(32, 36, 11, 'brick'),
      question(40, 8, 'flower'),
      ...row(50, 54, 9, 'brick'),
      pipe(64, 11),
      question(72, 7),
      question(73, 7),
      question(74, 7, 'star'),
      ...row(82, 88, 10, 'brick'),
      ...row(102, 106, 9, 'brick'),
      question(108, 9, 'flower'),
      ...row(120, 126, 11, 'brick'),
    ],
    enemies: [
      { x: 25, y: 12, patrol: 4 },
      { x: 44, y: 12, patrol: 5 },
      { x: 68, y: 12, patrol: 3 },
      { x: 84, y: 12, patrol: 4 },
      { x: 104, y: 12, patrol: 4 },
      { x: 124, y: 12, patrol: 5 },
      { x: 132, y: 12, patrol: 3 },
    ],
  },
];

function createPixelTextures(scene: Phaser.Scene) {
  const createCow = (key: string, size: number, options: { tint?: number; fire?: boolean; star?: boolean }) => {
    const gfx = scene.make.graphics({ x: 0, y: 0, add: false });
    const scale = size / 48;
    const w = 48 * scale;
    const h = 54 * scale;
    const bodyColor = options.tint ?? 0xffffff;

    gfx.fillStyle(0x000000, 0.18);
    gfx.fillEllipse(w / 2, h - 5 * scale, 34 * scale, 8 * scale);

    if (options.star) {
      gfx.lineStyle(3 * scale, 0xfff176, 0.9);
      gfx.strokeCircle(w / 2, 25 * scale, 22 * scale);
      gfx.fillStyle(0xffd700);
      gfx.fillTriangle(w / 2, 0, w / 2 + 5 * scale, 10 * scale, w / 2 - 5 * scale, 10 * scale);
      gfx.fillTriangle(5 * scale, 24 * scale, 15 * scale, 20 * scale, 15 * scale, 28 * scale);
      gfx.fillTriangle(w - 5 * scale, 24 * scale, w - 15 * scale, 20 * scale, w - 15 * scale, 28 * scale);
    }

    gfx.fillStyle(0x222222);
    gfx.fillRoundedRect(10 * scale, 30 * scale, 7 * scale, 18 * scale, 2 * scale);
    gfx.fillRoundedRect(31 * scale, 30 * scale, 7 * scale, 18 * scale, 2 * scale);

    gfx.fillStyle(bodyColor);
    gfx.fillRoundedRect(7 * scale, 18 * scale, 34 * scale, 24 * scale, 12 * scale);
    gfx.fillRoundedRect(11 * scale, 5 * scale, 26 * scale, 24 * scale, 11 * scale);

    gfx.fillStyle(0x111111);
    gfx.fillEllipse(17 * scale, 25 * scale, 8 * scale, 10 * scale);
    gfx.fillEllipse(32 * scale, 19 * scale, 7 * scale, 8 * scale);
    gfx.fillEllipse(26 * scale, 35 * scale, 11 * scale, 8 * scale);

    gfx.fillStyle(0xf4c7a1);
    gfx.fillRoundedRect(14 * scale, 18 * scale, 20 * scale, 13 * scale, 7 * scale);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(20 * scale, 23 * scale, 1.4 * scale);
    gfx.fillCircle(28 * scale, 23 * scale, 1.4 * scale);

    gfx.fillStyle(0xffffff);
    gfx.fillCircle(18 * scale, 14 * scale, 3 * scale);
    gfx.fillCircle(30 * scale, 14 * scale, 3 * scale);
    gfx.fillStyle(0x111111);
    gfx.fillCircle(18.8 * scale, 14 * scale, 1.4 * scale);
    gfx.fillCircle(30.8 * scale, 14 * scale, 1.4 * scale);

    gfx.fillStyle(0xf5d08a);
    gfx.fillTriangle(12 * scale, 8 * scale, 6 * scale, 1 * scale, 17 * scale, 7 * scale);
    gfx.fillTriangle(36 * scale, 8 * scale, 42 * scale, 1 * scale, 31 * scale, 7 * scale);
    gfx.fillStyle(0x111111);
    gfx.fillTriangle(9 * scale, 10 * scale, 1 * scale, 6 * scale, 11 * scale, 18 * scale);
    gfx.fillTriangle(39 * scale, 10 * scale, 47 * scale, 6 * scale, 37 * scale, 18 * scale);

    if (options.fire) {
      gfx.fillStyle(0xff6b00, 0.95);
      gfx.fillTriangle(35 * scale, 30 * scale, 46 * scale, 21 * scale, 43 * scale, 38 * scale);
      gfx.fillStyle(0xffd166, 0.95);
      gfx.fillTriangle(37 * scale, 30 * scale, 44 * scale, 25 * scale, 42 * scale, 35 * scale);
      gfx.lineStyle(2 * scale, 0xff7a18, 0.95);
      gfx.strokeCircle(24 * scale, 25 * scale, 20 * scale);
    }

    gfx.lineStyle(2 * scale, 0x111111, 0.75);
    gfx.strokeRoundedRect(7 * scale, 18 * scale, 34 * scale, 24 * scale, 12 * scale);
    gfx.strokeRoundedRect(11 * scale, 5 * scale, 26 * scale, 24 * scale, 11 * scale);
    gfx.generateTexture(key, Math.ceil(w), Math.ceil(h));
    gfx.destroy();
  };

  createCow('cow-small', 48, {});
  createCow('cow-super', 62, { tint: 0xf8fafc });
  createCow('cow-fire', 62, { tint: 0xffedd5, fire: true });
  createCow('cow-star', 62, { tint: 0xffffbf, star: true });

  const createGround = (key: string, base: number, shade: number) => {
    const groundGfx = scene.make.graphics({ x: 0, y: 0, add: false });
    groundGfx.fillStyle(base);
    groundGfx.fillRect(0, 0, TILE, TILE);
    groundGfx.fillStyle(shade);
    groundGfx.fillRect(4, 4, 10, 8);
    groundGfx.fillRect(18, 4, 10, 8);
    groundGfx.fillRect(4, 18, 10, 8);
    groundGfx.fillRect(18, 18, 10, 8);
    groundGfx.generateTexture(key, TILE, TILE);
    groundGfx.destroy();
  };

  createGround('block-ground-meadow', 0xc84c0c, 0x9a3a08);
  createGround('block-ground-night', 0x4f46e5, 0x312e81);
  createGround('block-ground-castle', 0x6b7280, 0x374151);

  const brickGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  brickGfx.fillStyle(0xb84c28);
  brickGfx.fillRect(0, 0, TILE, TILE);
  brickGfx.lineStyle(2, 0x8a3018);
  brickGfx.strokeRect(1, 1, TILE - 2, TILE - 2);
  brickGfx.lineBetween(0, TILE / 2, TILE, TILE / 2);
  brickGfx.lineBetween(TILE / 2, 0, TILE / 2, TILE / 2);
  brickGfx.lineBetween(TILE / 4, TILE / 2, TILE / 4, TILE);
  brickGfx.lineBetween((TILE * 3) / 4, TILE / 2, (TILE * 3) / 4, TILE);
  brickGfx.generateTexture('block-brick', TILE, TILE);
  brickGfx.destroy();

  const questionGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  questionGfx.fillStyle(0xf0a030);
  questionGfx.fillRect(0, 0, TILE, TILE);
  questionGfx.lineStyle(2, 0xc07010);
  questionGfx.strokeRect(2, 2, TILE - 4, TILE - 4);
  questionGfx.fillStyle(0xffffff);
  questionGfx.fillRect(12, 8, 8, 4);
  questionGfx.fillRect(10, 12, 4, 8);
  questionGfx.fillRect(18, 16, 4, 8);
  questionGfx.fillRect(14, 24, 4, 4);
  questionGfx.generateTexture('block-question', TILE, TILE);
  questionGfx.destroy();

  const usedGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  usedGfx.fillStyle(0x806040);
  usedGfx.fillRect(0, 0, TILE, TILE);
  usedGfx.lineStyle(2, 0x604020);
  usedGfx.strokeRect(2, 2, TILE - 4, TILE - 4);
  usedGfx.generateTexture('block-used', TILE, TILE);
  usedGfx.destroy();

  const pipeGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  pipeGfx.fillStyle(0x28a028);
  pipeGfx.fillRect(0, 0, TILE, TILE * 2);
  pipeGfx.fillStyle(0x40c040);
  pipeGfx.fillRect(4, 0, TILE - 8, 10);
  pipeGfx.fillStyle(0x208020);
  pipeGfx.fillRect(8, 10, TILE - 16, TILE * 2 - 10);
  pipeGfx.generateTexture('block-pipe', TILE, TILE * 2);
  pipeGfx.destroy();

  const goombaGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  goombaGfx.fillStyle(0x8b4513);
  goombaGfx.fillEllipse(16, 20, 28, 22);
  goombaGfx.fillStyle(0xf5deb3);
  goombaGfx.fillEllipse(16, 12, 24, 16);
  goombaGfx.fillStyle(0xffffff);
  goombaGfx.fillCircle(10, 12, 4);
  goombaGfx.fillCircle(22, 12, 4);
  goombaGfx.fillStyle(0x111111);
  goombaGfx.fillCircle(11, 12, 2);
  goombaGfx.fillCircle(23, 12, 2);
  goombaGfx.fillStyle(0x5c3317);
  goombaGfx.fillRect(6, 28, 8, 6);
  goombaGfx.fillRect(18, 28, 8, 6);
  goombaGfx.generateTexture('goomba', 32, 34);
  goombaGfx.destroy();

  const coinGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  coinGfx.fillStyle(0xffd700);
  coinGfx.fillCircle(10, 10, 9);
  coinGfx.fillStyle(0xffec80);
  coinGfx.fillCircle(10, 10, 5);
  coinGfx.generateTexture('coin', 20, 20);
  coinGfx.destroy();

  const mushroomGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  mushroomGfx.fillStyle(0xe83030);
  mushroomGfx.fillEllipse(14, 12, 24, 18);
  mushroomGfx.fillStyle(0xffffff);
  mushroomGfx.fillCircle(8, 10, 4);
  mushroomGfx.fillCircle(20, 10, 4);
  mushroomGfx.fillStyle(0xf5c99a);
  mushroomGfx.fillRect(10, 18, 8, 10);
  mushroomGfx.generateTexture('power-mushroom', 28, 28);
  mushroomGfx.destroy();

  const flowerGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  flowerGfx.fillStyle(0xff6020);
  flowerGfx.fillCircle(8, 10, 6);
  flowerGfx.fillCircle(20, 10, 6);
  flowerGfx.fillCircle(8, 22, 6);
  flowerGfx.fillCircle(20, 22, 6);
  flowerGfx.fillStyle(0xffd040);
  flowerGfx.fillCircle(14, 16, 6);
  flowerGfx.fillStyle(0x28a828);
  flowerGfx.fillRect(12, 22, 4, 8);
  flowerGfx.generateTexture('power-flower', 28, 30);
  flowerGfx.destroy();

  const starGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  starGfx.fillStyle(0xffd700);
  starGfx.fillTriangle(14, 2, 19, 11, 9, 11);
  starGfx.fillTriangle(14, 26, 19, 17, 9, 17);
  starGfx.fillTriangle(2, 14, 11, 9, 11, 19);
  starGfx.fillTriangle(26, 14, 17, 9, 17, 19);
  starGfx.generateTexture('power-star', 28, 28);
  starGfx.destroy();

  const fireballGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  fireballGfx.fillStyle(0xff6020);
  fireballGfx.fillCircle(8, 8, 7);
  fireballGfx.fillStyle(0xffd040);
  fireballGfx.fillCircle(8, 8, 4);
  fireballGfx.generateTexture('fireball', 16, 16);
  fireballGfx.destroy();

  const poleGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  poleGfx.fillStyle(0xd1d5db);
  poleGfx.fillRect(4, 0, 6, 160);
  poleGfx.fillStyle(0xf8fafc);
  poleGfx.fillCircle(7, 6, 7);
  poleGfx.generateTexture('flagpole', 14, 166);
  poleGfx.destroy();

  const flagGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  flagGfx.fillStyle(0xdc2626);
  flagGfx.fillTriangle(0, 0, 0, 34, 48, 17);
  flagGfx.fillStyle(0xffffff);
  flagGfx.fillCircle(14, 17, 6);
  flagGfx.generateTexture('red-flag', 48, 34);
  flagGfx.destroy();

  const hillGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  hillGfx.fillStyle(0x40a040);
  hillGfx.fillTriangle(40, 40, 0, 40, 40, 0);
  hillGfx.fillStyle(0x000000, 0.15);
  hillGfx.fillCircle(12, 28, 3);
  hillGfx.fillCircle(22, 22, 3);
  hillGfx.fillCircle(30, 30, 3);
  hillGfx.generateTexture('hill', 80, 40);
  hillGfx.destroy();

  const cloudGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  cloudGfx.fillStyle(0xffffff);
  cloudGfx.fillCircle(16, 16, 12);
  cloudGfx.fillCircle(32, 14, 14);
  cloudGfx.fillCircle(48, 16, 12);
  cloudGfx.fillRect(16, 16, 32, 12);
  cloudGfx.generateTexture('cloud', 64, 28);
  cloudGfx.destroy();

  const castleGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  castleGfx.fillStyle(0x334155);
  castleGfx.fillRect(0, 32, 86, 58);
  castleGfx.fillRect(10, 10, 18, 80);
  castleGfx.fillRect(58, 10, 18, 80);
  castleGfx.fillStyle(0x1f2937);
  castleGfx.fillRect(36, 58, 14, 32);
  castleGfx.fillStyle(0xf97316);
  castleGfx.fillRect(16, 22, 6, 8);
  castleGfx.fillRect(64, 22, 6, 8);
  castleGfx.generateTexture('castle', 86, 90);
  castleGfx.destroy();
}

function blockTexture(kind: BlockKind, theme: ThemeKey) {
  if (kind === 'ground') return `block-ground-${theme}`;
  if (kind === 'brick') return 'block-brick';
  if (kind === 'question') return 'block-question';
  if (kind === 'used') return 'block-used';
  return 'block-pipe';
}

class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private blocks: BlockRecord[] = [];
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private enemies: EnemyRecord[] = [];
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private powerups!: Phaser.Physics.Arcade.Group;
  private fireballs!: Phaser.Physics.Arcade.Group;
  private flagPole!: Phaser.Physics.Arcade.Image;
  private redFlag!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private fireKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private playerForm: PlayerForm = 'small';
  private preStarForm: PlayerForm = 'small';
  private starUntil = 0;
  private invincibleUntil = 0;
  private facing = 1;
  private jumpsRemaining = 2;
  private spawnX = 80;
  private spawnY = 0;
  private timeAccumulator = 0;
  private won = false;
  private mobileLeft = false;
  private mobileRight = false;
  private mobileJump = false;
  private mobileFire = false;

  constructor() {
    super('PlatformerMainScene');
  }

  create() {
    const level = LEVELS[activeLevelIndex] ?? LEVELS[0];

    hudState.world = level.label;
    hudState.time = level.time;
    hudState.level = activeLevelIndex;
    hudState.form = 'small';
    hudState.status = 'playing';
    pushHud();

    this.playerForm = 'small';
    this.preStarForm = 'small';
    this.starUntil = 0;
    this.invincibleUntil = 0;
    this.jumpsRemaining = 2;
    this.won = false;
    this.blocks = [];
    this.enemies = [];
    this.timeAccumulator = 0;

    const levelWidth = (level.length + 1) * TILE;
    const levelHeight = LEVEL_HEIGHT_TILES * TILE;
    this.physics.world.setBounds(0, 0, levelWidth, levelHeight);

    this.drawSceneBackground(level, levelWidth, levelHeight);

    this.blockGroup = this.physics.add.staticGroup();
    level.blocks.forEach((cell) => {
      const tex = blockTexture(cell.kind, level.theme);
      const x = cell.x * TILE + TILE / 2;
      const height = cell.kind === 'pipe' ? TILE * 2 : TILE;
      const y = cell.kind === 'pipe' ? cell.y * TILE + height / 2 : cell.y * TILE + TILE / 2;
      const sprite = this.blockGroup.create(x, y, tex) as Phaser.Physics.Arcade.Sprite;
      if (cell.kind === 'pipe') {
        sprite.setDisplaySize(TILE, TILE * 2);
        sprite.refreshBody();
      }
      this.blocks.push({ sprite, kind: cell.kind, loot: cell.loot, hit: false });
    });

    this.spawnY = level.groundY * TILE;
    this.playerShadow = this.add.ellipse(this.spawnX, this.spawnY + 2, 34, 8, 0x000000, 0.24);
    this.player = this.physics.add.sprite(this.spawnX, this.spawnY - 1, 'cow-small').setOrigin(0.5, 1);
    this.applyPlayerSize();
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0);
    this.player.setDragX(800);

    this.coins = this.physics.add.group({ allowGravity: false });
    this.powerups = this.physics.add.group();
    this.fireballs = this.physics.add.group({ maxSize: 4, allowGravity: true });
    this.enemyGroup = this.physics.add.group();

    level.enemies.forEach((spawn) => {
      const enemy = this.enemyGroup.create(
        spawn.x * TILE + TILE / 2,
        spawn.y * TILE + TILE,
        'goomba',
      ) as Phaser.Physics.Arcade.Sprite;
      enemy.setOrigin(0.5, 1);
      enemy.setCollideWorldBounds(true);
      enemy.setBounce(0);
      enemy.setData('left', spawn.x * TILE);
      enemy.setData('right', spawn.x * TILE + spawn.patrol * TILE);
      enemy.setVelocityX(-60);
      this.enemies.push({ sprite: enemy, dead: false });
    });

    const flagX = level.flagX * TILE + TILE / 2;
    this.flagPole = this.physics.add.image(flagX, level.groundY * TILE, 'flagpole').setOrigin(0.5, 1);
    this.flagPole.setImmovable(true);
    this.flagPole.body!.setAllowGravity(false);
    this.redFlag = this.add.image(flagX + 10, level.groundY * TILE - 146, 'red-flag').setOrigin(0, 0.5);
    this.add.image(flagX + 70, level.groundY * TILE, 'castle').setOrigin(0.5, 1);

    this.physics.add.collider(this.player, this.blockGroup, this.handlePlayerBlockCollision, undefined, this);
    this.physics.add.collider(this.enemyGroup, this.blockGroup);
    this.physics.add.collider(this.powerups, this.blockGroup);
    this.physics.add.collider(this.fireballs, this.blockGroup, this.bounceFireball, undefined, this);
    this.physics.add.overlap(this.player, this.coins, this.collectCoin, undefined, this);
    this.physics.add.overlap(this.player, this.powerups, this.collectPowerup, undefined, this);
    this.physics.add.overlap(this.player, this.enemyGroup, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.fireballs, this.enemyGroup, this.fireballHitEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.flagPole, this.reachFlag, undefined, this);

    this.cameras.main.setBounds(0, 0, levelWidth, levelHeight);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    };
    this.fireKey = this.input.keyboard!.addKey('X');
    this.spaceKey = this.input.keyboard!.addKey('SPACE');

    this.setupMobileInput();
    callbacks?.onReady();
  }

  private drawSceneBackground(level: LevelDefinition, levelWidth: number, levelHeight: number) {
    const skyColor = level.theme === 'meadow' ? 0x5c94fc : level.theme === 'night' ? 0x172554 : 0x3f3f46;
    this.add.rectangle(levelWidth / 2, levelHeight / 2, levelWidth, levelHeight, skyColor);

    if (level.theme === 'night') {
      for (let i = 0; i < 60; i += 1) {
        this.add.circle(Phaser.Math.Between(0, levelWidth), Phaser.Math.Between(12, 180), 1.5, 0xffffff, 0.8);
      }
      this.add.circle(180, 70, 24, 0xf8fafc, 0.9);
    } else {
      for (let i = 0; i < 8; i += 1) {
        this.add.image(220 + i * 360, Phaser.Math.Between(28, 84), 'cloud').setScrollFactor(0.35);
      }
    }

    const hillY = level.groundY * TILE - 8;
    for (let i = 0; i < 8; i += 1) {
      this.add.image(80 + i * 360, hillY, 'hill').setOrigin(0.5, 1).setTint(level.theme === 'castle' ? 0x475569 : 0xffffff);
    }
  }

  private setupMobileInput() {
    const bind = (id: string, setter: (v: boolean) => void) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = () => setter(true);
      const up = () => setter(false);
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
    };
    bind('plat-left', (v) => {
      this.mobileLeft = v;
    });
    bind('plat-right', (v) => {
      this.mobileRight = v;
    });
    bind('plat-jump', (v) => {
      this.mobileJump = v;
    });
    bind('plat-fire', (v) => {
      this.mobileFire = v;
    });
  }

  private applyPlayerSize() {
    const textureKey =
      this.playerForm === 'small'
        ? 'cow-small'
        : this.playerForm === 'super'
          ? 'cow-super'
          : this.playerForm === 'fire'
            ? 'cow-fire'
            : 'cow-star';
    this.player.setTexture(textureKey);
    this.player.setScale(1);
    this.player.setDepth(5);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const bodyWidth = this.player.width * 0.56;
    const bodyHeight = this.player.height * 0.76;
    body.setSize(bodyWidth, bodyHeight);
    body.setOffset((this.player.width - bodyWidth) / 2, this.player.height - bodyHeight - 1);
  }

  private setForm(form: PlayerForm) {
    if (form === 'star') {
      this.preStarForm = this.playerForm === 'star' ? this.preStarForm : this.playerForm;
      this.playerForm = 'star';
      this.starUntil = this.time.now + 10000;
      this.invincibleUntil = this.starUntil;
    } else {
      this.playerForm = form;
      this.preStarForm = form;
    }
    hudState.form = form;
    pushHud();
    this.applyPlayerSize();
  }

  private handlePlayerBlockCollision(
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    blockObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const playerBody = playerObj.body as Phaser.Physics.Arcade.Body;
    const block = this.blocks.find((entry) => entry.sprite === blockObj);
    if (!block || block.kind === 'ground' || block.kind === 'pipe' || block.kind === 'used') return;

    if (playerBody.touching.up || playerBody.blocked.up) {
      this.hitBlockFromBelow(block);
    }
  }

  private bounceFireball(
    fireball: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    block: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const fb = fireball as Phaser.Physics.Arcade.Sprite;
    const blk = block as Phaser.Physics.Arcade.Sprite;
    if (fb.body!.touching.down || fb.y < blk.y) {
      fb.setVelocityY(-220);
    } else {
      fb.setVelocityX(-fb.body!.velocity.x);
    }
  }

  private collectCoin(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    coinObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const coin = coinObj as Phaser.Physics.Arcade.Sprite;
    coin.destroy();
    hudState.coins += 1;
    hudState.score += 100;
    if (hudState.coins >= 100) {
      hudState.coins -= 100;
      hudState.lives += 1;
    }
    pushHud();
  }

  private spawnCoin(x: number, y: number) {
    const coin = this.coins.create(x, y, 'coin') as Phaser.Physics.Arcade.Sprite;
    this.tweens.add({
      targets: coin,
      y: y - 28,
      alpha: 0,
      duration: 420,
      onComplete: () => {
        if (coin.active) coin.destroy();
        hudState.coins += 1;
        hudState.score += 100;
        pushHud();
      },
    });
  }

  private spawnPowerup(kind: PowerKind, x: number, y: number) {
    if (kind === 'coin') {
      this.spawnCoin(x, y - 18);
      return;
    }

    const key = kind === 'mushroom' ? 'power-mushroom' : kind === 'flower' ? 'power-flower' : 'power-star';
    const item = this.powerups.create(x, y - TILE, key) as Phaser.Physics.Arcade.Sprite;
    item.setData('kind', kind);
    item.setBounce(kind === 'star' ? 0.9 : 0);
    item.setVelocityX(kind === 'flower' ? 0 : 80);
    if (kind === 'flower') {
      item.body!.setAllowGravity(false);
      this.tweens.add({ targets: item, y: y - TILE - 12, duration: 180 });
    }
  }

  private collectPowerup(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    itemObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const item = itemObj as Phaser.Physics.Arcade.Sprite;
    const kind = item.getData('kind') as PowerKind;
    item.destroy();

    if (kind === 'mushroom') {
      if (this.playerForm === 'small') this.setForm('super');
      hudState.score += 1000;
    } else if (kind === 'flower') {
      this.setForm('fire');
      hudState.score += 1000;
    } else if (kind === 'star') {
      this.setForm('star');
      hudState.score += 1000;
    }
    pushHud();
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const record = this.enemies.find((e) => e.sprite === enemy);
    if (!record || record.dead) return;
    record.dead = true;
    enemy.setVelocity(0, 0);
    enemy.body!.enable = false;
    enemy.setTint(0x555555);
    this.tweens.add({
      targets: enemy,
      y: enemy.y + 8,
      alpha: 0,
      duration: 200,
      onComplete: () => enemy.destroy(),
    });
    hudState.score += 200;
    pushHud();
  }

  private hitEnemy(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    const record = this.enemies.find((e) => e.sprite === enemy);
    if (!record || record.dead) return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const stomp = body.velocity.y > 0 && this.player.y < enemy.y - 10;
    if (this.playerForm === 'star' || stomp) {
      this.killEnemy(enemy);
      if (stomp) this.player.setVelocityY(-280);
      return;
    }

    if (this.time.now < this.invincibleUntil) return;
    this.hurtPlayer();
  }

  private fireballHitEnemy(
    fireballObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
  ) {
    const fireball = fireballObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    fireball.destroy();
    this.killEnemy(enemy);
  }

  private hurtPlayer() {
    if (this.playerForm === 'star') return;

    if (this.playerForm === 'super' || this.playerForm === 'fire') {
      this.setForm('small');
      this.invincibleUntil = this.time.now + 2000;
      this.player.setTint(0xff8888);
      this.time.delayedCall(2000, () => {
        if (this.player.active) this.player.clearTint();
      });
      return;
    }

    hudState.lives -= 1;
    pushHud();
    if (hudState.lives <= 0) {
      this.player.setPosition(this.spawnX, this.spawnY - 1);
      this.player.setVelocity(0, 0);
      hudState.status = 'gameover';
      pushHud();
      this.physics.pause();
      return;
    }

    this.respawnPlayer();
  }

  private respawnPlayer() {
    this.invincibleUntil = this.time.now + 2000;
    this.setForm('small');
    this.jumpsRemaining = 2;
    this.player.setPosition(this.spawnX, this.spawnY - 1);
    this.player.setVelocity(0, 0);
    this.cameras.main.centerOn(this.spawnX, this.spawnY - 1);
    this.player.setTint(0xff8888);
    this.time.delayedCall(2000, () => {
      if (this.player.active) this.player.clearTint();
    });
  }

  private reachFlag() {
    if (this.won) return;
    this.won = true;
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.tweens.add({
      targets: this.redFlag,
      y: (LEVELS[activeLevelIndex] ?? LEVELS[0]).groundY * TILE - 34,
      duration: 850,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        hudState.status = 'won';
        hudState.score += 5000 + hudState.time * 10;
        pushHud();
      },
    });
  }

  private hitBlockFromBelow(block: BlockRecord) {
    if (block.hit) return;
    block.hit = true;

    if (block.kind === 'question') {
      block.sprite.setTexture('block-used');
      block.kind = 'used';
      this.spawnPowerup(block.loot ?? 'coin', block.sprite.x, block.sprite.y);
      this.tweens.add({ targets: block.sprite, y: block.sprite.y - 6, duration: 80, yoyo: true });
      return;
    }

    if (block.kind === 'brick' && (this.playerForm === 'super' || this.playerForm === 'fire' || this.playerForm === 'star')) {
      const bx = block.sprite.x;
      const by = block.sprite.y;
      block.sprite.destroy();
      block.kind = 'used';
      this.spawnCoin(bx, by);
      return;
    }

    this.tweens.add({ targets: block.sprite, y: block.sprite.y - 4, duration: 60, yoyo: true });
  }

  private shootFireball() {
    if (this.playerForm !== 'fire') return;
    const fb = this.fireballs.get(this.player.x + this.facing * 20, this.player.y - 20, 'fireball') as
      | Phaser.Physics.Arcade.Sprite
      | null;
    if (!fb) return;
    fb.setActive(true).setVisible(true);
    fb.setVelocity(this.facing * 260, -60);
    fb.setBounce(1, 0);
    fb.setCollideWorldBounds(true);
  }

  update(_time: number, delta: number) {
    if (hudState.status !== 'playing') return;

    const level = LEVELS[activeLevelIndex] ?? LEVELS[0];
    this.timeAccumulator += delta;
    if (this.timeAccumulator >= 1000) {
      this.timeAccumulator -= 1000;
      hudState.time -= 1;
      pushHud();
      if (hudState.time <= 0) {
        this.hurtPlayer();
        hudState.time = level.time;
        pushHud();
      }
    }

    if (this.playerForm === 'star' && this.time.now > this.starUntil) {
      this.playerForm = this.preStarForm;
      this.applyPlayerSize();
      this.player.clearTint();
      hudState.form = this.playerForm;
      pushHud();
    }

    if (this.playerForm === 'star') {
      const colors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0xff00ff];
      this.player.setTint(colors[Math.floor(this.time.now / 100) % colors.length]);
    }

    const left = this.cursors.left?.isDown || this.wasd.A.isDown || this.mobileLeft;
    const right = this.cursors.right?.isDown || this.wasd.D.isDown || this.mobileRight;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up!) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W) ||
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      this.mobileJump;

    if (left) {
      this.player.setVelocityX(-180);
      this.facing = -1;
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(180);
      this.facing = 1;
      this.player.setFlipX(false);
    }

    const onGround = (this.player.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (onGround) {
      this.jumpsRemaining = 2;
    }
    if (jumpPressed && (onGround || this.jumpsRemaining > 0)) {
      this.player.setVelocityY(-380);
      this.jumpsRemaining = Math.max(this.jumpsRemaining - 1, 0);
      this.mobileJump = false;
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey) || (this.mobileFire && this.playerForm === 'fire')) {
      this.shootFireball();
      this.mobileFire = false;
    }

    this.enemies.forEach((entry) => {
      if (entry.dead || !entry.sprite.active) return;
      const enemy = entry.sprite;
      const leftBound = enemy.getData('left') as number;
      const rightBound = enemy.getData('right') as number;
      if (enemy.x <= leftBound) enemy.setVelocityX(60);
      else if (enemy.x >= rightBound) enemy.setVelocityX(-60);
    });

    if (this.playerShadow) {
      this.playerShadow.setPosition(this.player.x, level.groundY * TILE + 3);
      this.playerShadow.setScale(this.playerForm === 'small' ? 0.85 : 1.15, 1);
      this.playerShadow.setVisible(this.player.y < level.groundY * TILE + 12);
    }

    if (this.player.y > level.groundY * TILE + 90) {
      this.hurtPlayer();
    }
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('PlatformerBootScene');
  }

  preload() {
    this.load.image(PLAYER_TEXTURE_KEY, '/capy-gallery/cow-hero.png');
  }

  create() {
    createPixelTextures(this);
    this.scene.start('PlatformerMainScene');
  }
}

function getParentSize(parent: HTMLElement) {
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(Math.round(rect.width), 320),
    height: Math.max(Math.round(rect.height), 480),
  };
}

export function createPlatformerGame(
  parent: HTMLElement,
  gameCallbacks: PlatformerCallbacks,
  options: { levelIndex?: number } = {},
): Phaser.Game {
  callbacks = gameCallbacks;
  activeLevelIndex = Phaser.Math.Clamp(options.levelIndex ?? 0, 0, LEVELS.length - 1);
  const { width, height } = getParentSize(parent);

  hudState.score = 0;
  hudState.coins = 0;
  hudState.lives = 3;
  hudState.level = activeLevelIndex;
  hudState.form = 'small';
  hudState.world = LEVELS[activeLevelIndex].label;
  hudState.time = LEVELS[activeLevelIndex].time;
  hudState.status = 'idle';

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#5c94fc',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 900 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MainScene],
  });
}

export function restartPlatformerGame(game: Phaser.Game, levelIndex = activeLevelIndex) {
  activeLevelIndex = Phaser.Math.Clamp(levelIndex, 0, LEVELS.length - 1);
  hudState.score = 0;
  hudState.coins = 0;
  hudState.lives = 3;
  hudState.level = activeLevelIndex;
  hudState.form = 'small';
  hudState.world = LEVELS[activeLevelIndex].label;
  hudState.time = LEVELS[activeLevelIndex].time;
  hudState.status = 'playing';
  pushHud();
  game.scene.stop('PlatformerMainScene');
  game.scene.start('PlatformerMainScene');
}

export const platformerLevelMeta = LEVELS.map((level, index) => ({
  index,
  label: level.label,
  theme: level.theme,
}));
