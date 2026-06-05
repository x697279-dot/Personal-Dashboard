import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type ViewMode = 'first' | 'third';

type Vehicle = {
  body: THREE.Group;
  axis: 'x' | 'z';
  lane: number;
  offset: number;
  speed: number;
  direction: 1 | -1;
};

type Pedestrian = {
  body: THREE.Group;
  center: THREE.Vector3;
  defeated: boolean;
  defeatTime: number;
  radius: number;
  speed: number;
  phase: number;
};

type HitEffect = {
  object: THREE.Object3D;
  start: number;
  duration: number;
};

type MobileInput = {
  moveX: number;
  moveY: number;
  sprint: boolean;
};

const worldSize = 420;
const cityLimit = 180;
const roadGap = 40;
const roadWidth = 14;
const playerHeight = 2.75;
const playerSpeed = 18;
const sprintSpeed = 28;
const driveSpeed = 42;
const driveBoostSpeed = 62;
const lookLimit = THREE.MathUtils.degToRad(30);

function GamePage() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const mobileInputRef = useRef<MobileInput>({ moveX: 0, moveY: 0, sprint: false });
  const joystickPointerIdRef = useRef<number | null>(null);
  const sceneStateRef = useRef<{
    camera: THREE.PerspectiveCamera;
    setViewMode: (mode: ViewMode) => void;
    fireWeapon: () => void;
    jump: () => void;
    toggleDriving: () => void;
  } | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>('third');
  const [speedText, setSpeedText] = useState('静止');
  const [vehicleText, setVehicleText] = useState('上车');
  const [isSceneLoading, setIsSceneLoading] = useState(true);

  const switchViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    sceneStateRef.current?.setViewMode(mode);
  };

  const resetJoystick = () => {
    mobileInputRef.current.moveX = 0;
    mobileInputRef.current.moveY = 0;
    joystickPointerIdRef.current = null;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate(-50%, -50%)';
    }
  };

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const joystick = joystickRef.current;
    if (!joystick) return;

    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const maxDistance = rect.width * 0.34;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.min(maxDistance, Math.hypot(rawX, rawY));
    const angle = Math.atan2(rawY, rawX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    mobileInputRef.current.moveX = x / maxDistance;
    mobileInputRef.current.moveY = -y / maxDistance;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
  };

  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    joystickPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystick(event);
  };

  const handleJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    updateJoystick(event);
  };

  const handleJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerIdRef.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resetJoystick();
  };

  useEffect(() => {
    const mount = sceneRef.current;
    if (!mount) return;

    setIsSceneLoading(true);
    let frameId = 0;
    let loadingFrameId = 0;
    let disposed = false;
    let hasCompletedFirstFrame = false;
    let pointerDown = false;
    let lookPointerId: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let isGrounded = true;
    let verticalVelocity = 0;
    let yaw = Math.PI;
    let pitch = 0;
    let lastShotTime = 0;
    let latestSpeedText = '静止';

    const clock = new THREE.Clock();
    const mobileInput = mobileInputRef.current;
    const keys = new Set<string>();
    const velocity = new THREE.Vector3();
    const player = new THREE.Group();
    const cameraPivot = new THREE.Group();
    const cameraRig = new THREE.Group();
    const weaponMuzzle = new THREE.Object3D();
    const vehicles: Vehicle[] = [];
    const pedestrians: Pedestrian[] = [];
    const hitEffects: HitEffect[] = [];
    const carVelocity = new THREE.Vector3();
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    let drivableCar: THREE.Group | null = null;
    let isDriving = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 650);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const trackMaterial = <T extends THREE.Material>(material: T) => {
      materials.push(material);
      return material;
    };

    const trackGeometry = <T extends THREE.BufferGeometry>(geometry: T) => {
      geometries.push(geometry);
      return geometry;
    };

    const makeStandard = (color: number, options: THREE.MeshStandardMaterialParameters = {}) =>
      trackMaterial(
        new THREE.MeshStandardMaterial({
          color,
          metalness: 0.06,
          roughness: 0.72,
          ...options,
        }),
      );

    const makeCanvasTexture = (draw: (context: CanvasRenderingContext2D, size: number) => void, repeat = 1) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context) draw(context, 256);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat, repeat);
      textures.push(texture);
      return texture;
    };

    const terrainHeight = () => 0;

    const placeAt = (object: THREE.Object3D, x: number, z: number, y = 0) => {
      object.position.set(x, terrainHeight() + y, z);
    };

    const addBox = (
      parent: THREE.Object3D,
      size: [number, number, number],
      position: [number, number, number],
      material: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(trackGeometry(new THREE.BoxGeometry(...size)), material);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const addCylinder = (
      parent: THREE.Object3D,
      radius: number,
      height: number,
      position: [number, number, number],
      material: THREE.Material,
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = new THREE.Mesh(trackGeometry(new THREE.CylinderGeometry(radius, radius, height, 18)), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    const createLabelTexture = (text: string, fill = '#ffe06b', bg = 'rgba(19, 20, 45, 0.88)') =>
      makeCanvasTexture((context, size) => {
        context.fillStyle = bg;
        context.fillRect(0, 0, size, size);
        context.strokeStyle = fill;
        context.lineWidth = 8;
        context.strokeRect(10, 10, size - 20, size - 20);
        context.fillStyle = fill;
        context.font = 'bold 44px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, size / 2, size / 2);
      });

    const createGround = () => {
      const concrete = makeCanvasTexture((context, size) => {
        context.fillStyle = '#656565';
        context.fillRect(0, 0, size, size);
        for (let i = 0; i < 520; i += 1) {
          const alpha = 0.06 + Math.random() * 0.12;
          context.fillStyle = `rgba(255,255,255,${alpha})`;
          context.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 4, 1 + Math.random() * 4);
        }
      }, 18);

      const base = new THREE.Mesh(
        trackGeometry(new THREE.PlaneGeometry(worldSize, worldSize)),
        makeStandard(0x747474, { map: concrete, roughness: 0.92 }),
      );
      base.rotation.x = -Math.PI / 2;
      base.receiveShadow = true;
      scene.add(base);
    };

    const createRoads = (city: THREE.Group) => {
      const asphalt = makeCanvasTexture((context, size) => {
        context.fillStyle = '#24272d';
        context.fillRect(0, 0, size, size);
        for (let i = 0; i < 640; i += 1) {
          context.fillStyle = `rgba(255,255,255,${Math.random() * 0.13})`;
          context.fillRect(Math.random() * size, Math.random() * size, 1, 1);
        }
      }, 10);
      const roadMaterial = makeStandard(0x24272d, { map: asphalt, roughness: 0.96 });
      const markingMaterial = makeStandard(0xf4d86a, { emissive: 0x8a6c16, emissiveIntensity: 0.12 });
      const curbMaterial = makeStandard(0xd2d0c8, { roughness: 0.84 });
      const grassMaterial = makeStandard(0x32724a, { roughness: 0.88 });

      for (let i = -cityLimit; i <= cityLimit; i += roadGap) {
        addBox(city, [worldSize, 0.08, roadWidth], [0, 0.04, i], roadMaterial);
        addBox(city, [roadWidth, 0.08, worldSize], [i, 0.045, 0], roadMaterial);

        for (let x = -cityLimit - 5; x <= cityLimit + 5; x += 18) addBox(city, [8, 0.035, 0.42], [x, 0.1, i], markingMaterial);
        for (let z = -cityLimit - 5; z <= cityLimit + 5; z += 18) addBox(city, [0.42, 0.035, 8], [i, 0.1, z], markingMaterial);

        addBox(city, [worldSize, 0.22, 1.3], [0, 0.16, i - roadWidth / 2 - 1.1], curbMaterial);
        addBox(city, [worldSize, 0.22, 1.3], [0, 0.16, i + roadWidth / 2 + 1.1], curbMaterial);
        addBox(city, [1.3, 0.22, worldSize], [i - roadWidth / 2 - 1.1, 0.16, 0], curbMaterial);
        addBox(city, [1.3, 0.22, worldSize], [i + roadWidth / 2 + 1.1, 0.16, 0], curbMaterial);
      }

      for (const x of [-144, -104, -24, 56, 104, 144]) {
        for (const z of [-144, -104, -24, 56, 104, 144]) addBox(city, [18, 0.06, 18], [x, 0.075, z], grassMaterial);
      }
    };

    const createWindows = (building: THREE.Group, width: number, height: number, depth: number, face: 'front' | 'side') => {
      const lit = makeStandard(0xffe49a, { emissive: 0xffbf42, emissiveIntensity: 0.9, roughness: 0.45 });
      const dark = makeStandard(0x244653, { emissive: 0x102d38, emissiveIntensity: 0.35, roughness: 0.5 });
      const floors = Math.max(2, Math.floor(height / 4));
      const cols = Math.max(2, Math.floor((face === 'front' ? width : depth) / 3));

      for (let row = 0; row < floors; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const material = Math.random() > 0.42 ? lit : dark;
          const y = 3 + row * 3.3;
          if (face === 'front') {
            const x = -width / 2 + 2 + col * ((width - 4) / Math.max(1, cols - 1));
            addBox(building, [1.1, 1.25, 0.08], [x, y, depth / 2 + 0.055], material);
          } else {
            const z = -depth / 2 + 2 + col * ((depth - 4) / Math.max(1, cols - 1));
            addBox(building, [0.08, 1.25, 1.1], [width / 2 + 0.055, y, z], material);
          }
        }
      }
    };

    const addBuilding = (
      parent: THREE.Object3D,
      x: number,
      z: number,
      width: number,
      depth: number,
      height: number,
      color: number,
      sign?: string,
    ) => {
      const group = new THREE.Group();
      const bodyMaterial = makeStandard(color, { metalness: 0.12, roughness: 0.66 });
      const roofMaterial = makeStandard(0x20242b, { roughness: 0.8 });
      addBox(group, [width, height, depth], [0, height / 2, 0], bodyMaterial);
      addBox(group, [width + 0.8, 0.7, depth + 0.8], [0, height + 0.35, 0], roofMaterial);
      createWindows(group, width, height, depth, 'front');
      createWindows(group, width, height, depth, 'side');

      if (sign) {
        const signMaterial = trackMaterial(
          new THREE.MeshBasicMaterial({
            map: createLabelTexture(sign, Math.random() > 0.5 ? '#ff63c7' : '#42fff2'),
          }),
        );
        const signMesh = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(Math.min(width * 0.82, 12), 3.2)), signMaterial);
        signMesh.position.set(0, Math.min(height - 1.8, 8), depth / 2 + 0.12);
        group.add(signMesh);
      }

      placeAt(group, x, z);
      parent.add(group);
    };

    const addPalm = (parent: THREE.Object3D, x: number, z: number) => {
      const palm = new THREE.Group();
      const trunkMaterial = makeStandard(0x8a5a32, { roughness: 0.82 });
      const leafMaterial = makeStandard(0x21824d, { roughness: 0.9 });
      addCylinder(palm, 0.26, 5.8, [0, 2.9, 0], trunkMaterial);

      for (let i = 0; i < 7; i += 1) {
        const leaf = new THREE.Mesh(trackGeometry(new THREE.ConeGeometry(0.42, 4.6, 8)), leafMaterial);
        leaf.position.y = 6;
        leaf.rotation.z = Math.PI / 2.4;
        leaf.rotation.y = (Math.PI * 2 * i) / 7;
        leaf.castShadow = true;
        palm.add(leaf);
      }

      placeAt(palm, x, z);
      parent.add(palm);
    };

    const addStreetLight = (parent: THREE.Object3D, x: number, z: number) => {
      const poleMaterial = makeStandard(0x242830, { metalness: 0.5, roughness: 0.42 });
      const lampMaterial = makeStandard(0xfff2ba, { emissive: 0xffd36c, emissiveIntensity: 1.1 });
      const light = new THREE.Group();
      addCylinder(light, 0.08, 5.2, [0, 2.6, 0], poleMaterial);
      addBox(light, [1.8, 0.1, 0.12], [0.82, 5.1, 0], poleMaterial);
      addCylinder(light, 0.3, 0.3, [1.65, 4.9, 0], lampMaterial);
      const point = new THREE.PointLight(0xffd89a, 0.9, 26);
      point.position.set(1.65, 4.7, 0);
      light.add(point);
      placeAt(light, x, z);
      parent.add(light);
    };

    const createVehicle = (color: number) => {
      const car = new THREE.Group();
      const bodyMaterial = makeStandard(color, { metalness: 0.26, roughness: 0.42 });
      const glassMaterial = makeStandard(0x183545, { emissive: 0x0e2f40, emissiveIntensity: 0.34, roughness: 0.2 });
      const tireMaterial = makeStandard(0x111111, { roughness: 0.86 });
      const lightMaterial = makeStandard(0xfff3bd, { emissive: 0xffd46f, emissiveIntensity: 0.95 });
      addBox(car, [4.6, 1, 2.2], [0, 0.72, 0], bodyMaterial);
      addBox(car, [2.3, 0.85, 1.7], [-0.35, 1.42, 0], glassMaterial);
      addBox(car, [0.18, 0.22, 0.54], [2.38, 0.84, -0.65], lightMaterial);
      addBox(car, [0.18, 0.22, 0.54], [2.38, 0.84, 0.65], lightMaterial);
      for (const x of [-1.45, 1.45]) {
        for (const z of [-1.12, 1.12]) addCylinder(car, 0.38, 0.3, [x, 0.34, z], tireMaterial, [Math.PI / 2, 0, 0]);
      }
      return car;
    };

    const addVehicle = (
      parent: THREE.Object3D,
      axis: 'x' | 'z',
      lane: number,
      offset: number,
      speed: number,
      direction: 1 | -1,
      color: number,
    ) => {
      const body = createVehicle(color);
      body.rotation.y = axis === 'x' ? (direction > 0 ? 0 : Math.PI) : direction > 0 ? -Math.PI / 2 : Math.PI / 2;
      parent.add(body);
      vehicles.push({ body, axis, lane, offset, speed, direction });
    };

    const addDrivableVehicle = (parent: THREE.Object3D) => {
      drivableCar = createVehicle(0xff63c7);
      drivableCar.position.set(8, 0.05, -18);
      drivableCar.rotation.y = Math.PI / 2;
      drivableCar.name = 'PlayerVehicle';
      parent.add(drivableCar);

      const marker = new THREE.Mesh(
        trackGeometry(new THREE.TorusGeometry(3.1, 0.06, 10, 56)),
        trackMaterial(new THREE.MeshBasicMaterial({ color: 0x7cfff4, transparent: true, opacity: 0.72 })),
      );
      marker.rotation.x = Math.PI / 2;
      marker.position.y = 0.08;
      drivableCar.add(marker);
    };

    const createPedestrian = (color: number) => {
      const person = new THREE.Group();
      const skin = makeStandard(0xd6a070);
      const shirt = makeStandard(color, { roughness: 0.7 });
      const pants = makeStandard(0x2b3440);
      addCylinder(person, 0.2, 1.2, [0, 1.05, 0], shirt);
      addCylinder(person, 0.13, 0.8, [-0.12, 0.42, 0], pants);
      addCylinder(person, 0.13, 0.8, [0.12, 0.42, 0], pants);
      const head = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.24, 14, 10)), skin);
      head.position.y = 1.82;
      head.castShadow = true;
      person.add(head);
      person.scale.setScalar(1.2);
      return person;
    };

    const addPedestrian = (parent: THREE.Object3D, x: number, z: number, color: number) => {
      const body = createPedestrian(color);
      placeAt(body, x, z);
      parent.add(body);
      pedestrians.push({
        body,
        center: new THREE.Vector3(x, 0, z),
        defeated: false,
        defeatTime: 0,
        radius: 5 + Math.random() * 5,
        speed: 0.28 + Math.random() * 0.3,
        phase: Math.random() * Math.PI * 2,
      });
    };

    const createAk47 = () => {
      const rifle = new THREE.Group();
      const darkMetal = makeStandard(0x151719, { metalness: 0.58, roughness: 0.34 });
      const warmWood = makeStandard(0x7a4b27, { roughness: 0.68 });
      const grip = makeStandard(0x26201d, { roughness: 0.76 });
      addBox(rifle, [1.28, 0.18, 0.24], [0, 0, 0], darkMetal);
      addBox(rifle, [0.72, 0.22, 0.2], [0.76, -0.02, 0], warmWood);
      addBox(rifle, [0.5, 0.18, 0.24], [-0.86, -0.02, 0], warmWood);
      addBox(rifle, [0.18, 0.52, 0.2], [-0.2, -0.34, 0], grip);
      addBox(rifle, [0.28, 0.62, 0.18], [0.22, -0.44, 0], darkMetal).rotation.z = -0.24;
      addCylinder(rifle, 0.055, 1.25, [1.55, 0.03, 0], darkMetal, [0, 0, Math.PI / 2]);
      addCylinder(rifle, 0.08, 0.28, [2.24, 0.03, 0], darkMetal, [0, 0, Math.PI / 2]);
      weaponMuzzle.position.set(2.42, 0.03, 0);
      rifle.add(weaponMuzzle);
      rifle.position.set(0.48, 1.6, -0.48);
      rifle.rotation.set(0.06, -0.36, -0.08);
      return rifle;
    };

    const createCity = () => {
      scene.background = new THREE.Color(0xf2a6c3);
      scene.fog = new THREE.Fog(0xf2a6c3, 80, 270);
      createGround();

      const city = new THREE.Group();
      scene.add(city);
      createRoads(city);

      const colors = [0x5c7c91, 0xd0a564, 0x4e5268, 0xb56576, 0x7a9d76, 0xd4d0c5, 0x33415c, 0xc77656];
      const signs = ['HOTEL', 'CLUB', 'AUTO', 'DINER', 'ARCADE', 'MOTEL', 'RADIO', 'SHOP'];
      let signIndex = 0;

      for (let x = -140; x <= 140; x += roadGap) {
        for (let z = -140; z <= 140; z += roadGap) {
          const width = 13 + Math.random() * 12;
          const depth = 12 + Math.random() * 13;
          const height = 10 + Math.random() * 38;
          const color = colors[(signIndex + Math.floor(Math.random() * colors.length)) % colors.length] ?? 0x6d7485;
          addBuilding(
            city,
            x + (Math.random() - 0.5) * 10,
            z + (Math.random() - 0.5) * 10,
            width,
            depth,
            height,
            color,
            Math.random() > 0.52 ? signs[signIndex++ % signs.length] : undefined,
          );
        }
      }

      for (let i = -180; i <= 180; i += 24) {
        addPalm(city, i, -108);
        addPalm(city, i, 108);
      }

      const roadLanes = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
      for (let i = -160; i <= 160; i += 40) {
        for (const lane of roadLanes) addStreetLight(city, i - 10, lane + 10);
      }

      const carColors = [0xf05a5a, 0xffd166, 0x5cc8ff, 0xffffff, 0x111827, 0x36d399];
      for (let i = 0; i < 28; i += 1) {
        const axis = i % 2 === 0 ? 'x' : 'z';
        const lane = roadLanes[i % roadLanes.length] + (i % 3 === 0 ? -3.2 : 3.2);
        addVehicle(city, axis, lane, -cityLimit - 12 + Math.random() * (cityLimit * 2 + 24), 11 + Math.random() * 12, Math.random() > 0.5 ? 1 : -1, carColors[i % carColors.length] ?? 0xffffff);
      }
      addDrivableVehicle(city);

      const peopleColors = [0xff6b6b, 0x4ecdc4, 0xf7d794, 0x786fa6, 0x63cdda, 0xea8685];
      for (let i = 0; i < 30; i += 1) {
        const road = roadLanes[Math.floor(Math.random() * roadLanes.length)] ?? 0;
        const side = Math.random() > 0.5 ? road + roadWidth / 2 + 4 : road - roadWidth / 2 - 4;
        const along = -cityLimit + Math.random() * cityLimit * 2;
        const vertical = Math.random() > 0.5;
        addPedestrian(city, vertical ? side : along, vertical ? along : side, peopleColors[i % peopleColors.length] ?? 0xffffff);
      }

      const beach = new THREE.Mesh(trackGeometry(new THREE.PlaneGeometry(worldSize, 44)), makeStandard(0xe9c47f, { roughness: 0.94 }));
      beach.rotation.x = -Math.PI / 2;
      beach.position.set(0, 0.06, -worldSize / 2 + 22);
      city.add(beach);
      const sea = new THREE.Mesh(
        trackGeometry(new THREE.PlaneGeometry(worldSize, 36)),
        makeStandard(0x3baec8, { emissive: 0x126071, emissiveIntensity: 0.18, roughness: 0.38, metalness: 0.02 }),
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, 0.08, -worldSize / 2 + 4);
      city.add(sea);

      const woodMaterial = makeStandard(0x9b6a3d, { roughness: 0.78 });
      const umbrellaColors = [0xff63c7, 0x42fff2, 0xffe06b, 0xffffff];
      addBox(city, [worldSize * 0.72, 0.28, 5.6], [0, 0.22, -worldSize / 2 + 44], woodMaterial);
      for (let x = -150; x <= 150; x += 30) {
        addBox(city, [8, 0.22, 2.4], [x, 0.28, -worldSize / 2 + 57], woodMaterial);
        addBox(city, [8, 0.22, 2.4], [x + 10, 0.28, -worldSize / 2 + 31], woodMaterial);
      }

      for (let i = 0; i < 12; i += 1) {
        const x = -165 + i * 30;
        const z = -worldSize / 2 + 58 + (i % 2) * 15;
        const umbrella = new THREE.Group();
        addCylinder(umbrella, 0.08, 3.2, [0, 1.6, 0], woodMaterial);
        const canopy = new THREE.Mesh(
          trackGeometry(new THREE.ConeGeometry(2.2, 0.9, 24)),
          makeStandard(umbrellaColors[i % umbrellaColors.length] ?? 0xffffff, { roughness: 0.72 }),
        );
        canopy.position.y = 3.25;
        canopy.castShadow = true;
        umbrella.add(canopy);
        placeAt(umbrella, x, z);
        city.add(umbrella);

        const chairMaterial = makeStandard(i % 2 === 0 ? 0x42fff2 : 0xff63c7, { roughness: 0.76 });
        addBox(city, [3.2, 0.18, 1.1], [x + 3.8, 0.28, z + 2.8], chairMaterial);
        addBox(city, [1.1, 1.1, 0.18], [x + 5.1, 0.84, z + 2.4], chairMaterial);
      }

      for (let x = -180; x <= 180; x += 45) {
        const light = new THREE.PointLight(0xffd89a, 0.75, 34);
        light.position.set(x, 4.4, -worldSize / 2 + 45);
        city.add(light);
      }
    };

    const createPlayer = () => {
      const coatMaterial = makeStandard(0x1f6f9c, { roughness: 0.58 });
      const skinMaterial = makeStandard(0xd7aa78, { roughness: 0.74 });
      const darkMaterial = makeStandard(0x20242d, { roughness: 0.78 });
      const shoeMaterial = makeStandard(0x101114, { roughness: 0.82 });
      const body = new THREE.Mesh(trackGeometry(new THREE.CapsuleGeometry(0.55, 1.45, 10, 18)), coatMaterial);
      body.position.y = 1.45;
      const head = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.38, 18, 14)), skinMaterial);
      head.position.y = 2.48;
      const hair = new THREE.Mesh(trackGeometry(new THREE.SphereGeometry(0.39, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), darkMaterial);
      hair.position.y = 2.62;
      addBox(player, [0.78, 1.05, 0.28], [0, 1.42, 0.48], darkMaterial);

      for (const x of [-0.24, 0.24]) {
        addCylinder(player, 0.12, 0.98, [x, 0.58, 0], darkMaterial);
        addBox(player, [0.26, 0.15, 0.46], [x, 0.09, -0.08], shoeMaterial);
      }
      for (const x of [-0.68, 0.68]) {
        const arm = addCylinder(player, 0.09, 1.18, [x, 1.52, 0], skinMaterial);
        arm.rotation.z = x > 0 ? -0.18 : 0.18;
      }

      player.add(createAk47());
      player.add(body, head, hair, cameraPivot);
      cameraPivot.position.y = playerHeight;
      cameraPivot.add(cameraRig);
      cameraRig.add(camera);
      player.traverse((object) => {
        object.castShadow = true;
      });
    };

    const setViewMode = (mode: ViewMode) => {
      if (mode === 'first') {
        camera.position.set(0, 0.08, -0.16);
        camera.lookAt(0, 0.04, 5);
      } else {
        camera.position.set(0, 2.55, 9.4);
        camera.lookAt(0, 1.7, -8);
      }
    };

    const addTimedEffect = (object: THREE.Object3D, duration: number) => {
      scene.add(object);
      hitEffects.push({ object, start: clock.elapsedTime, duration });
    };

    const addShotTrail = (start: THREE.Vector3, end: THREE.Vector3) => {
      const trail = new THREE.Line(
        trackGeometry(new THREE.BufferGeometry().setFromPoints([start, end])),
        trackMaterial(new THREE.LineBasicMaterial({ color: 0xfff2a6, transparent: true, opacity: 0.88 })),
      );
      addTimedEffect(trail, 0.12);

      const flash = new THREE.Mesh(
        trackGeometry(new THREE.SphereGeometry(0.16, 10, 8)),
        trackMaterial(new THREE.MeshBasicMaterial({ color: 0xfff2a6, transparent: true, opacity: 0.95 })),
      );
      flash.position.copy(start);
      addTimedEffect(flash, 0.08);
    };

    const addHitEffect = (position: THREE.Vector3) => {
      const ring = new THREE.Mesh(
        trackGeometry(new THREE.TorusGeometry(0.55, 0.045, 10, 32)),
        trackMaterial(new THREE.MeshBasicMaterial({ color: 0xffea73, transparent: true, opacity: 0.95 })),
      );
      ring.position.copy(position);
      ring.rotation.x = Math.PI / 2;
      addTimedEffect(ring, 0.42);
    };

    const defeatPedestrian = (pedestrian: Pedestrian, hitPoint: THREE.Vector3) => {
      pedestrian.defeated = true;
      pedestrian.defeatTime = clock.elapsedTime;
      pedestrian.body.rotation.set(0, pedestrian.body.rotation.y, Math.PI / 2);
      pedestrian.body.position.y = 0.28;
      pedestrian.body.scale.set(1.2, 1.2, 1.2);
      addHitEffect(hitPoint);
    };

    const fireWeapon = () => {
      if (clock.elapsedTime - lastShotTime < 0.16) return;
      lastShotTime = clock.elapsedTime;

      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3();
      camera.getWorldPosition(origin);
      camera.getWorldDirection(direction);

      const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, 115);
      let target: { distance: number; pedestrian: Pedestrian; point: THREE.Vector3 } | undefined;

      pedestrians.forEach((pedestrian) => {
        if (pedestrian.defeated) return;
        const hits = raycaster.intersectObject(pedestrian.body, true);
        if (!hits.length) return;
        const hit = hits[0];
        if (!target || hit.distance < target.distance) target = { distance: hit.distance, pedestrian, point: hit.point.clone() };
      });

      const muzzle = new THREE.Vector3();
      weaponMuzzle.getWorldPosition(muzzle);
      const end = target?.point ?? origin.clone().add(direction.multiplyScalar(80));
      addShotTrail(muzzle, end);
      if (target) defeatPedestrian(target.pedestrian, target.point);
    };

    const jump = () => {
      if (isDriving || !isGrounded) return;
      verticalVelocity = 15.5;
      isGrounded = false;
    };

    const toggleDriving = () => {
      if (!drivableCar) return;

      if (isDriving) {
        isDriving = false;
        player.visible = true;
        player.position.set(drivableCar.position.x + 3.4, terrainHeight(), drivableCar.position.z + 1.8);
        velocity.set(0, 0, 0);
        carVelocity.set(0, 0, 0);
        setVehicleText('上车');
        setSpeedText('下车');
        return;
      }

      const distance = player.position.distanceTo(drivableCar.position);
      if (distance > 10) {
        setSpeedText('靠近车辆');
        return;
      }

      isDriving = true;
      player.visible = false;
      verticalVelocity = 0;
      isGrounded = true;
      velocity.set(0, 0, 0);
      setVehicleText('下车');
      setSpeedText('驾驶');
    };

    sceneStateRef.current = { camera, setViewMode, fireWeapon, jump, toggleDriving };

    const getMoveDirection = () => {
      const direction = new THREE.Vector3();
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      if (keys.has('KeyW')) direction.add(forward);
      if (keys.has('KeyS')) direction.sub(forward);
      if (keys.has('KeyD')) direction.add(right);
      if (keys.has('KeyA')) direction.sub(right);
      if (Math.abs(mobileInput.moveY) > 0.04) direction.addScaledVector(forward, mobileInput.moveY);
      if (Math.abs(mobileInput.moveX) > 0.04) direction.addScaledVector(right, mobileInput.moveX);
      return direction.lengthSq() > 0 ? direction.normalize() : direction;
    };

    const updatePlayer = (delta: number) => {
      const direction = getMoveDirection();
      if (isDriving && drivableCar) {
        const targetSpeed = mobileInput.sprint || keys.has('ShiftLeft') || keys.has('ShiftRight') ? driveBoostSpeed : driveSpeed;
        carVelocity.lerp(direction.multiplyScalar(targetSpeed), Math.min(1, delta * 5.5));
        drivableCar.position.addScaledVector(carVelocity, delta);
        drivableCar.position.x = THREE.MathUtils.clamp(drivableCar.position.x, -worldSize / 2 + 6, worldSize / 2 - 6);
        drivableCar.position.z = THREE.MathUtils.clamp(drivableCar.position.z, -worldSize / 2 + 6, worldSize / 2 - 6);
        if (carVelocity.lengthSq() > 1) {
          drivableCar.rotation.y = Math.atan2(-carVelocity.z, carVelocity.x);
          yaw = Math.atan2(-carVelocity.x, -carVelocity.z);
        }

        player.position.copy(drivableCar.position);
        player.position.y = terrainHeight();
        player.rotation.y = yaw;
        cameraPivot.rotation.x = pitch;

        const nextSpeedText = carVelocity.length() > driveSpeed + 4 ? '疾驰' : carVelocity.length() > 1 ? '驾驶' : '停车';
        if (nextSpeedText !== latestSpeedText) {
          latestSpeedText = nextSpeedText;
          setSpeedText(nextSpeedText);
        }
        return;
      }

      const targetSpeed = keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileInput.sprint ? sprintSpeed : playerSpeed;
      velocity.lerp(direction.multiplyScalar(targetSpeed), Math.min(1, delta * 8));
      player.position.addScaledVector(velocity, delta);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -worldSize / 2 + 4, worldSize / 2 - 4);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -worldSize / 2 + 4, worldSize / 2 - 4);
      verticalVelocity -= 38 * delta;
      player.position.y += verticalVelocity * delta;

      if (player.position.y <= terrainHeight()) {
        player.position.y = terrainHeight();
        verticalVelocity = 0;
        isGrounded = true;
      } else {
        isGrounded = false;
      }

      player.rotation.y = yaw;
      cameraPivot.rotation.x = pitch;

      const speed = velocity.length();
      const nextSpeedText = !isGrounded ? '跳跃' : speed < 0.4 ? '静止' : speed > playerSpeed + 2 ? '奔跑' : '行走';
      if (nextSpeedText !== latestSpeedText) {
        latestSpeedText = nextSpeedText;
        setSpeedText(nextSpeedText);
      }
    };

    const updateVehicles = (delta: number) => {
      vehicles.forEach((vehicle) => {
        vehicle.offset += vehicle.speed * vehicle.direction * delta;
        if (vehicle.offset > cityLimit + 18) vehicle.offset = -cityLimit - 18;
        if (vehicle.offset < -cityLimit - 18) vehicle.offset = cityLimit + 18;
        if (vehicle.axis === 'x') vehicle.body.position.set(vehicle.offset, 0.05, vehicle.lane);
        else vehicle.body.position.set(vehicle.lane, 0.05, vehicle.offset);
      });
    };

    const updatePedestrians = (elapsed: number) => {
      pedestrians.forEach((pedestrian) => {
        if (pedestrian.defeated) {
          pedestrian.body.position.y = 0.28 + Math.sin((elapsed - pedestrian.defeatTime) * 8) * 0.02;
          return;
        }
        const angle = elapsed * pedestrian.speed + pedestrian.phase;
        pedestrian.body.position.set(
          pedestrian.center.x + Math.cos(angle) * pedestrian.radius,
          0,
          pedestrian.center.z + Math.sin(angle) * pedestrian.radius * 0.45,
        );
        pedestrian.body.rotation.y = -angle + Math.PI / 2;
      });
    };

    const updateHitEffects = (elapsed: number) => {
      for (let i = hitEffects.length - 1; i >= 0; i -= 1) {
        const effect = hitEffects[i];
        const progress = (elapsed - effect.start) / effect.duration;
        if (progress >= 1) {
          scene.remove(effect.object);
          hitEffects.splice(i, 1);
          continue;
        }
        effect.object.scale.multiplyScalar(1 + (progress < 0.5 ? 0.015 : 0.006));
        effect.object.traverse((object) => {
          const material = (object as THREE.Mesh | THREE.Line).material as THREE.Material | undefined;
          if (material && 'opacity' in material) material.opacity = Math.max(0, 1 - progress);
        });
      }
    };

    const resize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;
      updatePlayer(delta);
      updateVehicles(delta);
      updatePedestrians(elapsed);
      updateHitEffects(elapsed);
      renderer.render(scene, camera);
      if (!hasCompletedFirstFrame) {
        hasCompletedFirstFrame = true;
        loadingFrameId = requestAnimationFrame(() => {
          if (!disposed) setIsSceneLoading(false);
        });
      }
      frameId = requestAnimationFrame(animate);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE'].includes(event.code)) event.preventDefault();
      if (event.code === 'Space') jump();
      if (event.code === 'KeyE' && !event.repeat) toggleDriving();
      keys.add(event.code);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement | null)?.closest?.('button, .mobile-controls')) return;
      if (event.pointerType !== 'touch') fireWeapon();
      pointerDown = true;
      lookPointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (lookPointerId !== null && event.pointerId !== lookPointerId) return;
      pointerDown = false;
      lookPointerId = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      if (lookPointerId !== null && event.pointerId !== lookPointerId) return;
      const movementX = event.movementX || event.clientX - lastPointerX;
      const movementY = event.movementY || event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      yaw -= movementX * 0.004;
      pitch = THREE.MathUtils.clamp(pitch - movementY * 0.003, -lookLimit, lookLimit);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointermove', onPointerMove);

    createCity();
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
    sun.position.set(-70, 92, 42);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xffd8ea, 0x28325c, 1.8));
    const neonPink = new THREE.PointLight(0xff4fb8, 2.2, 90);
    neonPink.position.set(-28, 16, -34);
    scene.add(neonPink);
    const neonCyan = new THREE.PointLight(0x47fff1, 2.1, 90);
    neonCyan.position.set(36, 14, 42);
    scene.add(neonCyan);
    createPlayer();
    placeAt(player, 0, -18);
    player.rotation.y = yaw;
    scene.add(player);
    setViewMode('third');
    resize();
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(loadingFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      sceneStateRef.current = null;
      resetJoystick();
      renderer.dispose();
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="character-scene-page">
      <div ref={sceneRef} className="scene-stage" />

      {isSceneLoading ? (
        <div className="game-loading-overlay" role="status" aria-live="polite">
          <div className="game-loading-card">
            <div className="game-loading-spinner" />
            <p className="game-eyebrow">Loading 3D World</p>
            <h2>正在加载海滨城市</h2>
            <span>首次进入需要创建建筑、车辆、海边元素和可驾驶车辆，请稍等...</span>
          </div>
        </div>
      ) : null}

      <div className="hud top-hud">
        <div>
          <div className="game-eyebrow">VICE CITY BLOCK</div>
          <h1>3D 人物场景</h1>
        </div>
        <div className="game-status-dot">
          <span />
          {speedText}
        </div>
      </div>

      <button className="back-home-button" type="button" onClick={() => { window.location.hash = '#/'; }}>
        返回主页
      </button>

      <div className="view-switch">
        <button className={viewMode === 'first' ? 'active' : ''} type="button" onClick={() => switchViewMode('first')}>
          第一人称
        </button>
        <button className={viewMode === 'third' ? 'active' : ''} type="button" onClick={() => switchViewMode('third')}>
          第三人称
        </button>
      </div>

      <div className="crosshair" />

      <div className="control-card">
        <span>W/A/S/D 移动</span>
        <span>Shift 奔跑</span>
        <span>Space 跳跃</span>
        <span>左键 射击</span>
        <span>E 上/下车</span>
        <span>移动端使用摇杆与按钮</span>
      </div>

      <div className="mobile-controls" aria-label="移动端控制">
        <div
          ref={joystickRef}
          className="mobile-joystick"
          role="application"
          aria-label="移动摇杆"
          onPointerDown={handleJoystickPointerDown}
          onPointerMove={handleJoystickPointerMove}
          onPointerUp={handleJoystickPointerUp}
          onPointerCancel={handleJoystickPointerUp}
        >
          <div ref={joystickKnobRef} className="mobile-joystick-knob" />
        </div>

        <div className="mobile-action-pad">
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              mobileInputRef.current.sprint = true;
            }}
            onPointerUp={() => {
              mobileInputRef.current.sprint = false;
            }}
            onPointerLeave={() => {
              mobileInputRef.current.sprint = false;
            }}
            onPointerCancel={() => {
              mobileInputRef.current.sprint = false;
            }}
          >
            奔跑
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              sceneStateRef.current?.jump();
            }}
          >
            跳跃
          </button>
          <button
            className="shoot-button"
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              sceneStateRef.current?.fireWeapon();
            }}
          >
            射击
          </button>
          <button
            className="vehicle-button"
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              sceneStateRef.current?.toggleDriving();
            }}
          >
            {vehicleText}
          </button>
        </div>
      </div>
    </div>
  );
}

export { GamePage };
