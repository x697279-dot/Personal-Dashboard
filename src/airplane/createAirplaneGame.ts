import Phaser from 'phaser';

export type GameHudState = {
  score: number;
  lives: number;
  wave: number;
  status: 'playing' | 'gameover';
};

export type GameCallbacks = {
  onHudUpdate: (state: GameHudState) => void;
  onReady: () => void;
};

type EnemyType = 'small' | 'medium' | 'large';

type EnemyRecord = {
  sprite: Phaser.Physics.Arcade.Sprite;
  type: EnemyType;
  zigzagPhase: number;
};

const hudState: GameHudState = {
  score: 0,
  lives: 3,
  wave: 1,
  status: 'playing',
};

let callbacks: GameCallbacks | null = null;

function pushHud() {
  callbacks?.onHudUpdate({ ...hudState });
}

function createTextures(scene: Phaser.Scene) {
  const playerGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  playerGfx.fillStyle(0x38bdf8);
  playerGfx.fillTriangle(20, 0, 0, 40, 40, 40);
  playerGfx.fillStyle(0x7dd3fc);
  playerGfx.fillRect(16, 18, 8, 18);
  playerGfx.fillStyle(0xfbbf24);
  playerGfx.fillCircle(20, 32, 3);
  playerGfx.generateTexture('player', 40, 40);
  playerGfx.destroy();

  const bulletGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  bulletGfx.fillStyle(0xfbbf24);
  bulletGfx.fillRect(0, 0, 6, 16);
  bulletGfx.generateTexture('bullet', 6, 16);
  bulletGfx.destroy();

  const enemySmallGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  enemySmallGfx.fillStyle(0xf472b6);
  enemySmallGfx.fillTriangle(14, 28, 0, 0, 28, 0);
  enemySmallGfx.fillStyle(0xfb7185);
  enemySmallGfx.fillRect(10, 6, 8, 8);
  enemySmallGfx.generateTexture('enemy-small', 28, 28);
  enemySmallGfx.destroy();

  const enemyMediumGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  enemyMediumGfx.fillStyle(0xa855f7);
  enemyMediumGfx.fillTriangle(18, 36, 0, 0, 36, 0);
  enemyMediumGfx.fillStyle(0x7c3aed);
  enemyMediumGfx.fillRect(12, 8, 12, 12);
  enemyMediumGfx.generateTexture('enemy-medium', 36, 36);
  enemyMediumGfx.destroy();

  const enemyLargeGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  enemyLargeGfx.fillStyle(0xef4444);
  enemyLargeGfx.fillTriangle(24, 48, 0, 0, 48, 0);
  enemyLargeGfx.fillStyle(0xb91c1c);
  enemyLargeGfx.fillRect(16, 10, 16, 16);
  enemyLargeGfx.fillStyle(0xfca5a5);
  enemyLargeGfx.fillCircle(24, 20, 5);
  enemyLargeGfx.generateTexture('enemy-large', 48, 48);
  enemyLargeGfx.destroy();

  const enemyBulletGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  enemyBulletGfx.fillStyle(0xf87171);
  enemyBulletGfx.fillCircle(4, 4, 4);
  enemyBulletGfx.generateTexture('enemy-bullet', 8, 8);
  enemyBulletGfx.destroy();

  const starGfx = scene.make.graphics({ x: 0, y: 0, add: false });
  starGfx.fillStyle(0xffffff, 0.9);
  starGfx.fillCircle(2, 2, 2);
  starGfx.generateTexture('star', 4, 4);
  starGfx.destroy();
}

class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;

  private bullets!: Phaser.Physics.Arcade.Group;

  private enemyBullets!: Phaser.Physics.Arcade.Group;

  private enemyGroup!: Phaser.Physics.Arcade.Group;

  private enemies: EnemyRecord[] = [];

  private stars: Phaser.GameObjects.Image[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  private spawnTimer = 0;

  private waveTimer = 0;

  private invincibleUntil = 0;

  private pointerActive = false;

  constructor() {
    super('MainScene');
  }

  create() {
    hudState.score = 0;
    hudState.lives = 3;
    hudState.wave = 1;
    hudState.status = 'playing';
    pushHud();

    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x050b14);
    this.createStarfield(width, height);

    this.bullets = this.physics.add.group({
      defaultKey: 'bullet',
      maxSize: 40,
    });

    this.enemyBullets = this.physics.add.group({
      defaultKey: 'enemy-bullet',
      maxSize: 60,
    });

    this.enemyGroup = this.physics.add.group();

    this.player = this.physics.add.sprite(width / 2, height - 90, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.body?.setSize(28, 32, true);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };

    this.physics.add.overlap(
      this.bullets,
      this.enemyGroup,
      this.handleBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.enemyGroup,
      (_player, enemyObj) => {
        const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
        if (!enemy.active) return;
        this.explodeAt(enemy.x, enemy.y, enemy.getData('type') as EnemyType);
        this.removeEnemy(enemy);
        this.damagePlayer();
      },
      undefined,
      this,
    );

    this.physics.add.overlap(
      this.player,
      this.enemyBullets,
      () => this.damagePlayer(),
      undefined,
      this,
    );

    this.time.addEvent({
      delay: 170,
      callback: () => {
        if (hudState.status === 'playing') this.fireBullet();
      },
      loop: true,
    });

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

    callbacks?.onReady();
  }

  private createStarfield(width: number, height: number) {
    this.stars = [];
    for (let i = 0; i < 80; i += 1) {
      const star = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        'star',
      );
      star.setAlpha(Phaser.Math.FloatBetween(0.2, 0.9));
      star.setScale(Phaser.Math.FloatBetween(0.6, 1.6));
      this.stars.push(star);
    }
  }

  private movePlayerTo(x: number, y: number) {
    const { width, height } = this.scale;
    this.player.x = Phaser.Math.Clamp(x, 24, width - 24);
    this.player.y = Phaser.Math.Clamp(y, 60, height - 40);
  }

  private fireBullet() {
    const bullet = this.bullets.get(this.player.x, this.player.y - 24, 'bullet') as Phaser.Physics.Arcade.Sprite | false;
    if (!bullet) return;

    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body.enable = true;
    bullet.setVelocityY(-520);
    bullet.setDepth(8);
  }

  private spawnEnemy() {
    const { width } = this.scale;
    const roll = Math.random();
    let type: EnemyType = 'small';
    if (roll > 0.72) type = 'large';
    else if (roll > 0.42) type = 'medium';

    const textureKey = `enemy-${type}`;
    const x = Phaser.Math.Between(40, width - 40);
    const sprite = this.enemyGroup.create(x, -40, textureKey) as Phaser.Physics.Arcade.Sprite;
    sprite.setDepth(6);

    const speedMap: Record<EnemyType, number> = {
      small: Phaser.Math.Between(140, 200) + hudState.wave * 8,
      medium: Phaser.Math.Between(90, 130) + hudState.wave * 5,
      large: Phaser.Math.Between(55, 85) + hudState.wave * 3,
    };

    sprite.setVelocityY(speedMap[type]);
    sprite.setData('type', type);

    if (type !== 'small') {
      const shootDelay = type === 'large' ? 1400 : 2000;
      this.time.delayedCall(shootDelay, () => {
        if (!sprite.active || hudState.status !== 'playing') return;
        this.fireEnemyBullet(sprite.x, sprite.y + 20);
      });
    }

    this.enemies.push({
      sprite,
      type,
      zigzagPhase: Math.random() * Math.PI * 2,
    });
  }

  private fireEnemyBullet(x: number, y: number) {
    const bullet = this.enemyBullets.get(x, y, 'enemy-bullet') as Phaser.Physics.Arcade.Sprite | false;
    if (!bullet) return;

    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.body.enable = true;
    bullet.setVelocityY(260 + hudState.wave * 10);
    bullet.setDepth(5);
  }

  private handleBulletHitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
  ) {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !enemy.active) return;

    bullet.setActive(false);
    bullet.setVisible(false);
    bullet.body.enable = false;
    bullet.setVelocity(0, 0);

    const type = enemy.getData('type') as EnemyType;
    const scoreMap: Record<EnemyType, number> = { small: 100, medium: 250, large: 500 };
    hudState.score += scoreMap[type];
    pushHud();

    this.explodeAt(enemy.x, enemy.y, type);
    this.removeEnemy(enemy);
  }

  private removeEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const index = this.enemies.findIndex((entry) => entry.sprite === enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    enemy.destroy();
  }

  private explodeAt(x: number, y: number, type: EnemyType) {
    const colors: Record<EnemyType, number> = {
      small: 0xf472b6,
      medium: 0xa855f7,
      large: 0xef4444,
    };
    const count = type === 'large' ? 10 : type === 'medium' ? 7 : 5;
    const tint = colors[type];

    for (let i = 0; i < count; i += 1) {
      const spark = this.add.image(x, y, 'star');
      spark.setTint(tint);
      spark.setScale(Phaser.Math.FloatBetween(0.8, 1.6));
      spark.setDepth(9);

      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(28, 90);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(260, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private recycleOffscreenBullets(
    group: Phaser.Physics.Arcade.Group,
    direction: 'up' | 'down',
    threshold: number,
  ) {
    const children = group.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const bullet of children) {
      if (!bullet.active) continue;
      const isOut = direction === 'up' ? bullet.y < threshold : bullet.y > threshold;
      if (!isOut) continue;

      bullet.setActive(false);
      bullet.setVisible(false);
      if (bullet.body) bullet.body.enable = false;
      bullet.setVelocity(0, 0);
    }
  }

  private damagePlayer() {
    if (hudState.status !== 'playing') return;
    if (this.time.now < this.invincibleUntil) return;

    hudState.lives -= 1;
    pushHud();

    this.invincibleUntil = this.time.now + 1600;
    this.tweens.add({
      targets: this.player,
      alpha: 0.25,
      duration: 90,
      yoyo: true,
      repeat: 8,
      onComplete: () => {
        this.player.setAlpha(1);
      },
    });

    if (hudState.lives <= 0) {
      hudState.status = 'gameover';
      pushHud();
      this.physics.pause();
      this.player.setTint(0x64748b);
    }
  }

  update(_time: number, delta: number) {
    if (hudState.status !== 'playing') return;

    const speed = 280;
    const moveX =
      (this.cursors.left?.isDown || this.wasd.A.isDown ? -1 : 0) +
      (this.cursors.right?.isDown || this.wasd.D.isDown ? 1 : 0);
    const moveY =
      (this.cursors.up?.isDown || this.wasd.W.isDown ? -1 : 0) +
      (this.cursors.down?.isDown || this.wasd.S.isDown ? 1 : 0);

    if (moveX !== 0 || moveY !== 0) {
      this.player.x += moveX * speed * (delta / 1000);
      this.player.y += moveY * speed * (delta / 1000);
      const { width, height } = this.scale;
      this.player.x = Phaser.Math.Clamp(this.player.x, 24, width - 24);
      this.player.y = Phaser.Math.Clamp(this.player.y, 60, height - 40);
    }

    this.spawnTimer += delta;
    const spawnInterval = Math.max(520 - hudState.wave * 18, 220);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEnemy();
      if (Math.random() > 0.55) this.spawnEnemy();
    }

    this.waveTimer += delta;
    if (this.waveTimer >= 18000) {
      this.waveTimer = 0;
      hudState.wave += 1;
      pushHud();
    }

    const { width, height } = this.scale;
    this.stars.forEach((star, index) => {
      star.y += (0.4 + (index % 5) * 0.15) * (delta / 16);
      if (star.y > height + 8) {
        star.y = -8;
        star.x = Phaser.Math.Between(0, width);
      }
    });

    this.enemies.forEach((entry) => {
      if (!entry.sprite.active) return;
      if (entry.type === 'medium') {
        entry.zigzagPhase += delta * 0.004;
        entry.sprite.x += Math.sin(entry.zigzagPhase) * 1.4;
      }
      if (entry.sprite.y > height + 60) {
        this.removeEnemy(entry.sprite);
      }
    });

    this.recycleOffscreenBullets(this.bullets, 'up', -20);
    this.recycleOffscreenBullets(this.enemyBullets, 'down', height + 20);
  }
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    createTextures(this);
    this.scene.start('MainScene');
  }
}

function getParentSize(parent: HTMLElement) {
  const rect = parent.getBoundingClientRect();
  return {
    width: Math.max(Math.round(rect.width), 320),
    height: Math.max(Math.round(rect.height), 480),
  };
}

export function createAirplaneGame(parent: HTMLElement, gameCallbacks: GameCallbacks): Phaser.Game {
  callbacks = gameCallbacks;
  const { width, height } = getParentSize(parent);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#050b14',
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
    scene: [BootScene, MainScene],
  });

  return game;
}

export function restartAirplaneGame(game: Phaser.Game) {
  game.scene.stop('MainScene');
  game.scene.start('MainScene');
  game.scene.resume('MainScene');
}
