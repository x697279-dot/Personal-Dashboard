import * as THREE from 'three';

/**
 * 废土切图目录：public/generated_assets/
 * tiles/   128×128 可平铺贴图
 * sprites/ 透明 PNG 角色
 * props/   透明 PNG 摆件
 * vfx/     透明 PNG 特效/拾取物
 */
export const WASTELAND_TILE_SIZE = 128;

export const wastelandAssetManifest = {
  basePath: '/generated_assets',
  tiles: {
    grass: 'tiles/grass.png',
    road: 'tiles/road.png',
    roadCrack: 'tiles/road_crack.png',
    dirt: 'tiles/dirt.png',
  },
  sprites: {
    player: 'sprites/player.png',
    enemyCrawler: 'sprites/enemy_crawler.png',
    enemyRaider: 'sprites/enemy_raider.png',
    enemyBrute: 'sprites/enemy_brute.png',
    enemyBomber: 'sprites/enemy_bomber.png',
    bossMecha: 'sprites/boss_mecha.png',
  },
  props: {
    tree: 'props/tree.png',
    carWreck: 'props/car_wreck.png',
    tent: 'props/tent.png',
    ruins: 'props/ruins.png',
  },
  vfx: {
    pickupXp: 'vfx/pickup_xp.png',
    pickupScrap: 'vfx/pickup_scrap.png',
    fireball: 'vfx/fireball.png',
  },
} as const;

export type WastelandTileTextures = Partial<Record<keyof typeof wastelandAssetManifest.tiles, THREE.Texture>>;
export type WastelandSpriteTextures = Partial<Record<keyof typeof wastelandAssetManifest.sprites, THREE.Texture>>;
export type WastelandPropTextures = Partial<Record<keyof typeof wastelandAssetManifest.props, THREE.Texture>>;
export type WastelandVfxTextures = Partial<Record<keyof typeof wastelandAssetManifest.vfx, THREE.Texture>>;

export type WastelandGameAssets = {
  tiles: WastelandTileTextures;
  sprites: WastelandSpriteTextures;
  props: WastelandPropTextures;
  vfx: WastelandVfxTextures;
};

function assetUrl(relativePath: string) {
  return `${wastelandAssetManifest.basePath}/${relativePath}`;
}

function loadTexture(loader: THREE.TextureLoader, relativePath: string) {
  return new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      assetUrl(relativePath),
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

async function loadCategory<K extends string>(
  loader: THREE.TextureLoader,
  manifest: Record<K, string>,
  keys: readonly K[],
) {
  const result = {} as Partial<Record<K, THREE.Texture>>;
  await Promise.all(
    keys.map(async (key) => {
      try {
        result[key] = await loadTexture(loader, manifest[key]);
      } catch {
        // 单张缺失不阻断
      }
    }),
  );
  return result;
}

export async function tryLoadWastelandAssets(): Promise<WastelandGameAssets | null> {
  const loader = new THREE.TextureLoader();

  try {
    const grass = await loadTexture(loader, wastelandAssetManifest.tiles.grass);
    const [tiles, sprites, props, vfx] = await Promise.all([
      loadCategory(loader, wastelandAssetManifest.tiles, ['road', 'roadCrack', 'dirt']).then((partial) => ({
        grass,
        ...partial,
      })),
      loadCategory(loader, wastelandAssetManifest.sprites, [
        'player',
        'enemyCrawler',
        'enemyRaider',
        'enemyBrute',
        'enemyBomber',
        'bossMecha',
      ]),
      loadCategory(loader, wastelandAssetManifest.props, ['tree', 'carWreck', 'tent', 'ruins']),
      loadCategory(loader, wastelandAssetManifest.vfx, ['pickupXp', 'pickupScrap', 'fireball']),
    ]);

    return { tiles, sprites, props, vfx };
  } catch {
    return null;
  }
}
