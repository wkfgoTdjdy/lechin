// 오두막(3D 공간) 본체. 화면 뼈대(skeleton.js)가 문서에 들어간 뒤 app/(lounge)/lounge/page.js가 start()를 한 번 부른다.
// supabase: 연결(설정 전이면 null → 혼자 모드), member: 로그인한 회원 프로필(없으면 null)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BOARDS, mountBoard, boardCss, h } from './guestbook.js';
import { when } from '@/lib/board';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export async function start({ supabase, member }) {
const SPEED = 4;                 // 초당 이동 거리
const BX = 14.5, Z_MIN = -5.5, Z_MAX = 31.5;   // 걸을 수 있는 범위 (오두막 + 앞마당 + 운동장)
const now = () => performance.now() / 1000;
const hud = document.getElementById('hud');

// ── 방 ───────────────────────────────────────────────
// 가운데가 라운지 홀, 양옆에 취미 방 두 개씩, 앞문 밖은 마당, 그 너머가 운동장. 채팅은 같은 공간 사람에게만 보인다.
// 방 id를 바꾸면 web/lib/presence.js 의 ROOM_HOBBY(게시판의 공간별 인원)도 같이 바꿀 것. 앞에 있는 방이 먼저 잡힌다.
const ROOMS = [
  { id: 'bar', name: '라운지 홀',   x1: -8,  x2: 8,  z1: -6, z2: 6, rug: 0 },
  { id: 'r1',  name: '보드게임 방', x1: -15, x2: -8, z1: -6, z2: 0, rug: 0xd98b6a },
  { id: 'r2',  name: '책방',        x1: -15, x2: -8, z1: 0,  z2: 6, rug: 0x8fae8b },
  { id: 'r3',  name: '창가 카페',   x1: 8,   x2: 15, z1: -6, z2: 0, rug: 0x8eb4cf },
  { id: 'r4',  name: '체력단련실',  x1: 8,   x2: 15, z1: 0,  z2: 6, rug: 0 },
  { id: 'yard', name: '마당',       x1: -15, x2: 15, z1: 6,  z2: 16.5, rug: 0 },
  { id: 'futsal', name: '풋살장',   x1: -11.5, x2: -0.5, z1: 19.5, z2: 28.5, rug: 0 },
  { id: 'court', name: '농구 코트', x1: 1.5, x2: 11.5, z1: 19.5, z2: 28.5, rug: 0 },
  { id: 'track', name: '러닝 트랙', x1: -15, x2: 15, z1: 16.5, z2: 32, rug: 0 },
];
const roomAt = (x, z) => ROOMS.find((r) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2);

// ── 장면 ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;   // 밝은 곳이 하얗게 날아가지 않게
renderer.toneMappingExposure = 1;
document.body.prepend(renderer.domElement);

const SKY = 0xb9d6c2;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 28, 60);
// 주변 반사광: 금속·유리·나무 표면에 은은한 반사가 생긴다
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a4a3a, 0.7));
const sun = new THREE.DirectionalLight(0xffdcae, 2.1);   // 늦은 오후 햇살
sun.position.set(9, 14, 19);
sun.target.position.set(0, 0, 12);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 30, bottom: -30, near: 1, far: 80 });   // 오두막·마당·운동장을 덮는 그림자 범위
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

// 카메라: 고양이를 중심으로 돈다. 휠·두 손가락 = 줌, 오른쪽 버튼·한 손가락 드래그 = 회전(좌우)·내려다보는 각도(위아래), 버튼·키(Q/R, +/−)도 가능.
const camGoal = { yaw: 0, pitch: 0.73, dist: 13.5 }, cam = { yaw: 0, pitch: 0.45, dist: 6.5 };   // cam은 벽장 앞 가까이에서 시작해 camGoal로 부드럽게 따라간다
function moveCam(dYaw, dPitch, zoom) {
  camGoal.yaw += dYaw;
  camGoal.pitch = Math.max(0.3, Math.min(1.4, camGoal.pitch + dPitch));
  camGoal.dist = Math.max(4, Math.min(28, camGoal.dist * zoom));
}
const CAM_STEPS = { left: [-0.5, 0, 1], right: [0.5, 0, 1], in: [0, 0, 0.8], out: [0, 0, 1.25] };
document.getElementById('cam').addEventListener('click', (e) => {
  const step = CAM_STEPS[e.target.dataset?.cam];
  if (step) moveCam(...step);
});
let dragged = 0;   // 이번 누름에서 끌린 거리(px). 끌었으면 걷기(click)로 치지 않는다
{
  // 마우스: 오른쪽 버튼 드래그 = 회전. 터치: 한 손가락 드래그 = 회전, 두 손가락 벌리기·오므리기 = 줌. (톡 누르기 = 걷기는 아래 click)
  const el = renderer.domElement;
  const pts = new Map();   // 누르고 있는 포인터 id → { x, y }
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  el.addEventListener('wheel', (e) => { e.preventDefault(); moveCam(0, 0, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    dragged = 0;
    if (e.pointerType !== 'touch' && e.button !== 2) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const before = pts.size === 2 ? spread() : 0;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    dragged += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1) moveCam(-dx * 0.006, dy * 0.005, 1);
    else if (before > 0) moveCam(0, 0, before / Math.max(spread(), 1));
  });
  for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, (e) => pts.delete(e.pointerId));
}

const mats = new Map();
const mat = (color) => mats.get(color) ?? mats.set(color, new THREE.MeshStandardMaterial({ color })).get(color);
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}
// 블렌더에서 만든 가구·소품 (assets/props.py로 다시 생성). 이름으로 복사해서 놓는다.
// tint를 주면 "Tint" 재질만 그 색으로 칠한다 (방석·러그).
const propsModel = (await new GLTFLoader().loadAsync('/assets/props.glb')).scene;
function prop(name, x, z, ry = 0, scale = 1, tint, y = 0) {
  const o = propsModel.getObjectByName(name).clone();
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(scale);
  o.traverse((m) => {
    m.castShadow = m.receiveShadow = true;
    if (tint === undefined || m.material?.name !== 'Tint') return;
    m.material = m.material.clone();
    m.material.color.set(tint);
  });
  scene.add(o);
  return o;
}

// 고정된 난수: 모든 사람에게 같은 마루결·같은 숲이 보이도록
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// 마루: 길이와 색이 제각각인 판자를 그려서 바닥에 입힌다
function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let row = 0; row < 16; row++) {
    for (let x = -rnd() * 300; x < 512;) {
      const w = 220 + rnd() * 200, top = row * 32;
      g.fillStyle = `hsl(${24 + rnd() * 5}, ${36 + rnd() * 8}%, ${40 + rnd() * 8}%)`;   // 색 차이는 은은하게
      g.fillRect(x, top, w, 32);
      g.strokeStyle = 'rgba(60, 30, 10, .2)';                 // 나뭇결
      for (let k = 0; k < 4; k++) {
        const y = top + 3 + rnd() * 26;
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + w / 3, y + rnd() * 8 - 4, x + w * 2 / 3, y + rnd() * 8 - 4, x + w, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(40, 20, 8, .45)';                   // 판자 이음매
      g.fillRect(x, top, 2, 32);
      x += w;
    }
    g.fillRect(0, row * 32, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 2);
  t.anisotropy = 8;
  return t;
}

// 벽·카운터처럼 못 지나가는 곳. 고양이를 반지름 0.4인 원으로 보고 막는다.
const blockers = [];
const block = (x1, z1, x2, z2) => blockers.push({ x1: x1 - 0.4, x2: x2 + 0.4, z1: z1 - 0.4, z2: z2 + 0.4 });
const blocked = (x, z) => blockers.some((b) => x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2);

// ── 공간 설계 ────────────────────────────────────────
// 높낮이를 준다: 양옆 방은 한 단 높고, 홀 가운데에는 둥근 단, 앞문 밖 데크를 내려가면 낮은 마당.
const ROOM_Y = 0.35, YARD_Y = -0.35, DAIS = { x: 0, z: 2.4, r: 2.9, y: 0.25 };
function floorY(x, z) {
  if (z > 6.2) return Math.abs(x) < 5 && z < 9.75 ? 0 : YARD_Y;   // 데크 / 마당
  if (Math.abs(x) > 8) return ROOM_Y;
  return Math.hypot(x - DAIS.x, z - DAIS.z) < DAIS.r ? DAIS.y : 0;
}

// 통나무: 벽은 눕혀 쌓고(axis x/z), 기둥은 세운다(axis y). 통나무마다 색을 조금씩 다르게.
const logGeo = new THREE.CylinderGeometry(0.21, 0.21, 1, 14);
const logMats = [0x8a5a3a, 0x7d4f31, 0x946443, 0x85563a].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
let logCount = 0;
function log(x, y, z, len, axis, thick = 1) {
  const m = new THREE.Mesh(logGeo, logMats[logCount++ % logMats.length]);
  m.scale.set(thick, len, thick);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}
function wall(x1, z1, x2, z2, h) {   // 축에 나란한 통나무 벽
  const alongX = x1 !== x2, len = Math.abs(alongX ? x2 - x1 : z2 - z1) + 0.3;
  for (let i = 0, n = Math.max(1, Math.round(h / 0.37)); i < n; i++)
    log((x1 + x2) / 2, 0.2 + i * 0.37, (z1 + z2) / 2, len + (i % 2) * 0.12, alongX ? 'x' : 'z');   // 한 줄씩 번갈아 끝이 튀어나오게
  block(Math.min(x1, x2) - 0.15, Math.min(z1, z2) - 0.15, Math.max(x1, x2) + 0.15, Math.max(z1, z2) + 0.15);
}
const post = (x, z, h) => log(x, h / 2, z, h, 'y', 1.3);
function rail(x1, z1, x2, z2) {      // 데크 난간
  const alongX = x1 !== x2, len = Math.abs(alongX ? x2 - x1 : z2 - z1), axis = alongX ? 'x' : 'z';
  log((x1 + x2) / 2, 0.85, (z1 + z2) / 2, len, axis, 0.35);
  log((x1 + x2) / 2, 0.45, (z1 + z2) / 2, len, axis, 0.25);
  for (let i = 0, n = Math.round(len / 1.2); i <= n; i++) log(x1 + (x2 - x1) * i / n, 0.45, z1 + (z2 - z1) * i / n, 0.9, 'y', 0.4);
  block(Math.min(x1, x2) - 0.05, Math.min(z1, z2) - 0.05, Math.max(x1, x2) + 0.05, Math.max(z1, z2) + 0.05);
}
function disc(r, h, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48), mat(color));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

// 바닥
const plankMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.7 });
box(140, 0.2, 140, 0x5c8a55, 0, YARD_Y - 0.1, 0);                       // 숲 바닥
box(31, 0.5, 13, 0x6f665e, 0, -0.34, 0);                                // 돌 기초
box(30.6, 0.2, 12.6, 0, 0, -0.1, 0).material = plankMat;                // 홀 마루
for (const x of [-11.5, 11.5]) {
  box(6.8, ROOM_Y, 12.3, 0, x, ROOM_Y / 2, 0).material = plankMat;      // 한 단 높은 방
  for (const z of [-3, 3]) box(0.7, ROOM_Y / 2, 2.4, 0x9a6b42, x - Math.sign(x) * 3.95, ROOM_Y / 4, z);   // 문 앞 디딤단
}
disc(3.3, 0.12, 0x7a4f2e, DAIS.x, 0.06, DAIS.z);                        // 홀 가운데 둥근 단 (2단)
disc(DAIS.r, DAIS.y, 0x9a6b42, DAIS.x, DAIS.y / 2, DAIS.z);

// 벽: 뒤는 높고 앞으로 올수록 낮아진다. 뒷벽 위에는 박공(세모 지붕 벽)과 둥근 창.
wall(-15, -6, 15, -6, 3);
for (let k = 0; k < 9; k++) log(0, 3.16 + k * 0.37, -6, 30 * (1 - (k + 1) / 10), 'x');
prop('RoundWindow', 0, -5.7, 0, 1, undefined, 4.5);
for (const s of [-1, 1]) {
  wall(15 * s, -6, 15 * s, -2, 3); wall(15 * s, -2, 15 * s, 2, 2.2); wall(15 * s, 2, 15 * s, 6, 1.5);   // 옆벽은 계단식
  post(15 * s, -6, 3.7); post(15 * s, 6, 1.9);
  wall(8 * s, -6, 8 * s, -4.3, 2); wall(8 * s, -1.7, 8 * s, 1.7, 2); wall(8 * s, 4.3, 8 * s, 6, 2);     // 바와 방 사이. z=-3, z=3 에 문
  for (const z of [-4.3, -1.7, 1.7, 4.3]) post(8 * s, z, 2.6);                                         // 문설주
  for (const z of [-3, 3]) log(8 * s, 2.6, z, 3.1, 'z', 0.8);                                          // 문 위 가로대
  wall(15 * s, 0, 8 * s, 0, 1.4);                                                                      // 방과 방 사이
  wall(15 * s, 6, 8 * s, 6, 1.1); wall(8 * s, 6, 2 * s, 6, 0.5);                                       // 앞벽은 낮게 (안이 보이도록), 가운데는 앞문
  post(2 * s, 6, 2.8);
}
log(0, 2.8, 6, 4.6, 'x', 0.9);                                          // 앞문 위 가로대

// 앉을 자리: { x, z, ry(바라보는 방향), h(엉덩이 높이) }
const SEATS = [];
function tableSet(cx, cz, color, y = 0, n = 4, r = 1.5) {   // 둥근 탁자 + 둘러앉는 방석
  prop('Table', cx, cz, 0, 1, undefined, y);
  for (let i = 0; i < n; i++) {
    const a = Math.PI / n + i * 2 * Math.PI / n, x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
    prop('Cushion', x, z, 0, 1, color, y);
    SEATS.push({ x, z, ry: Math.atan2(cx - x, cz - z), h: 0.25 });
  }
}
for (const r of ROOMS.filter((r) => r.rug)) {
  const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
  prop('Rug', cx, cz, 0, 1, r.rug, ROOM_Y);
  if (r.id === 'r2') tableSet(cx, cz, 0xf2e6d0, ROOM_Y);   // 책방만 둥근 탁자. 나머지 방은 아래 '취미 방 꾸미기'에서
}
// 자리 하나: (x, z)에 앉아 (cx, cz)를 바라본다
const seatAt = (x, z, cx, cz, h) => SEATS.push({ x, z, ry: Math.atan2(cx - x, cz - z), h }) && SEATS.at(-1);
prop('Rug', DAIS.x, DAIS.z, 0, 1, 0xc8553d, DAIS.y);
tableSet(DAIS.x, DAIS.z, 0xe8c9a0, DAIS.y, 6, 1.75);

// 타오르는 불: 위로 오르며 작아지고 붉어지는 빛 입자 + 튀는 불티 + 일렁이는 조명
const glow = document.createElement('canvas');
glow.width = glow.height = 64;
{
  const g = glow.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.4, 'rgba(255, 255, 255, .5)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
}
const glowTex = new THREE.CanvasTexture(glow);
const fires = [];
function makeFire(x, y, z, size = 1) {
  const light = new THREE.PointLight(0xff7a2a, 9, 12);
  light.position.set(x, y + 0.5, z + 0.4);
  scene.add(light);
  const bits = Array.from({ length: 50 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(s);
    return { s, spark: i >= 42, age: Math.random(), life: 0.7, x: (Math.random() - 0.5) * 0.7, drift: 0 };
  });
  fires.push({ x, y, z, size, light, bits });
}
const HOT = new THREE.Color(1, 0.8, 0.3), COOL = new THREE.Color(1, 0.15, 0.02);
function burn(dt, t) {
  for (const F of fires) {
    for (const f of F.bits) {
      f.age += dt / f.life;
      if (f.age >= 1) {   // 다 탄 입자는 장작 위에서 다시 태어난다
        f.age = 0;
        f.life = f.spark ? 1.2 + Math.random() : 0.5 + Math.random() * 0.5;
        f.x = (Math.random() - 0.5) * (f.spark ? 0.5 : 0.75);
        f.drift = (Math.random() - 0.5) * 0.7;
      }
      const a = f.age, rise = f.spark ? 1.6 : 0.85 - Math.abs(f.x) * 0.6;   // 가운데 불꽃이 더 높이 오른다
      f.s.position.set(F.x + F.size * (f.x * (1 - a * 0.5) + (f.spark ? f.drift * a : Math.sin(t * 9 + f.x * 20) * 0.03)),
                       F.y + F.size * a * rise, F.z + (f.spark ? a * 0.4 : 0));
      f.s.scale.setScalar(F.size * (f.spark ? 0.06 : 0.55 * (1 - a) + 0.12));
      f.s.material.color.lerpColors(HOT, COOL, f.spark ? 0.3 : a);
      f.s.material.opacity = (f.spark ? 1 : 0.6) * (1 - a);
    }
    F.light.intensity = 9 + Math.sin(t * 11 + F.x) * 1.6 + Math.sin(t * 23.7) * 1.1 + Math.sin(t * 47) * 0.7;
  }
}

// 방마다 하나씩 있는 물건 (방은 한 단 높으니 ROOM_Y에 놓는다)
prop('Fireplace', -11.5, -5.55, 0, 1, undefined, ROOM_Y);
makeFire(-11.5, ROOM_Y + 0.25, -5.13);
prop('Bookshelf', -14.6, 3, Math.PI / 2, 1, undefined, ROOM_Y);
prop('Window', 11.5, -5.8, 0, 1, undefined, ROOM_Y);
prop('Painting', 14.72, -4, -Math.PI / 2, 1, 0x9cc7d8, ROOM_Y);
prop('Plant', 14.2, -5.2, 0, 1, undefined, ROOM_Y);
for (const [x, z] of [[-14.2, -0.7], [-9, 5.2], [8.8, -5.2], [8.8, 0.8]]) prop('Lamp', x, z, 0, 1, undefined, ROOM_Y);
for (const [x, z] of [[-7.2, 5.2], [7.2, 5.2]]) prop('Lamp', x, z);
prop('Plant', -7.2, 0.6, 0, 1.4);
prop('Plant', 7.2, 0.6, 1, 1.4);

// ── 취미 방 꾸미기 ───────────────────────────────────
// 보드게임 방(r1): 긴 게임 탁자에 여섯 자리, 벽에 게임 상자 선반. 벽난로는 그대로.
const GAME_AT = { x: -11.5, z: -3 };
prop('GameTable', GAME_AT.x, GAME_AT.z, 0, 1, undefined, ROOM_Y);
prop('GameShelf', -14.6, -2.9, Math.PI / 2, 1, undefined, ROOM_Y);
for (const [dx, dz] of [[-0.8, -1.25], [0.8, -1.25], [-0.8, 1.25], [0.8, 1.25], [-1.8, 0], [1.8, 0]]) {
  prop('Cushion', GAME_AT.x + dx, GAME_AT.z + dz, 0, 1, 0xf2e6d0, ROOM_Y);
  seatAt(GAME_AT.x + dx, GAME_AT.z + dz, GAME_AT.x, GAME_AT.z, 0.25);
}
// 책방(r2): 이달의 책 진열대와 푹신한 의자 둘
const READ_AT = { x: -11.5, z: 0.6 };
prop('BookDisplay', READ_AT.x, READ_AT.z, 0, 1, undefined, ROOM_Y);
for (const z of [1.2, 5]) {
  const s = seatAt(-13.9, z, -11.5, 3, 0.5);
  prop('ReadingChair', s.x, s.z, s.ry, 1, 0x8fae8b, ROOM_Y);
}
// 창가 카페(r3): 넷이 앉는 탁자 둘 (더블데이트)
const CAFE = [{ x: 10.6, z: -3 }, { x: 13.2, z: -3 }];
for (const c of CAFE) {
  prop('CafeTable', c.x, c.z, 0, 1, 0xf7efe2, ROOM_Y);
  for (const [dx, dz] of [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]]) {
    const s = seatAt(c.x + dx, c.z + dz, c.x, c.z, 0.5);
    prop('Chair', s.x, s.z, s.ry, 1, 0x8eb4cf, ROOM_Y);
  }
}
// 체력단련실(r4): 덤벨 거치대, 철봉, 벤치, 거울, 매트
const RACK_AT = { x: 14.4, z: 3 }, MATS_AT = { x: 10.35, z: 3.3 };
prop('DumbbellRack', RACK_AT.x, RACK_AT.z, -Math.PI / 2, 1, undefined, ROOM_Y);
prop('PullupBar', 13.3, 5.3, 0, 1, undefined, ROOM_Y);
prop('Bench', 12.6, 2.6, 0, 1, undefined, ROOM_Y);
prop('Mirror', 11.8, 0.35, 0, 1, undefined, ROOM_Y);
for (const [x, z, ry, color] of [[9.8, 3.3, 0, 0x7fb7a3], [10.9, 3.3, 0, 0xd9b4d0], [11.2, 5.1, Math.PI / 2, 0x8eb4cf]])
  prop('Mat', x, z, ry, 1, color, ROOM_Y);

// 받침대: 라운지 홀에는 방명록, 취미 공간마다 그 취미의 모임 게시대 (가까이 가면 버튼이 뜬다)
const BOOKS = [
  { board: 'bar', x: 4.1, z: -5.2, ry: 0, y: 0 },
  { hobby: '보드게임', x: -8.9, z: -0.9, ry: -Math.PI / 2, y: ROOM_Y },
  { hobby: '독서', x: -8.9, z: 0.9, ry: -Math.PI / 2, y: ROOM_Y },
  { hobby: '더블데이트', x: 8.9, z: -0.9, ry: Math.PI / 2, y: ROOM_Y },
  { hobby: '헬스', x: 8.9, z: 5.2, ry: Math.PI / 2, y: ROOM_Y },
  { hobby: '풋살', x: -6, z: 18.9, ry: Math.PI, y: YARD_Y },
  { hobby: '러닝', x: 0.5, z: 18.9, ry: Math.PI, y: YARD_Y },
  { hobby: '농구', x: 6.5, z: 18.9, ry: Math.PI, y: YARD_Y },
];
for (const b of BOOKS) prop('Guestbook', b.x, b.z, b.ry, 1, undefined, b.y);

// 바: 긴 카운터, 술병 선반, 맥주 탭, 스툴
prop('Counter', -1.5, -4.2);
block(-6, -4.6, 3, -3.8);
prop('Shelf', -1.5, -5.65);
prop('BeerTap', 1.6, -4.3, Math.PI, 1, undefined, 1.08);   // 카운터 위, 바텐더 쪽을 보게
const barLight = new THREE.PointLight(0xffc98a, 5, 11);    // 바 위의 따뜻한 조명
barLight.position.set(-1.5, 2.7, -3.4);
scene.add(barLight);
// 커피 스테이션: 카운터 왼쪽 끝. 가까이 가면 커피를 내려 마실 수 있다.
const COFFEE_AT = { x: -6.9, z: -5.45 };
prop('CoffeeStation', COFFEE_AT.x, COFFEE_AT.z);
block(-7.8, -5.8, -6, -5.1);
for (const x of [-5, -3.5, -2, -0.5, 1, 2.5]) {
  prop('Stool', x, -3.1);
  SEATS.push({ x, z: -3.1, ry: Math.PI, h: 0.45 });
}

// 벽장: 처음 들어오면 여기서 걸어 나온다.
const CLOSET = { x: 6, z: -5.2 };
prop('Closet', CLOSET.x, -5.25);
const closetDoors = [prop('ClosetDoorL', CLOSET.x - 0.95, -4.65), prop('ClosetDoorR', CLOSET.x + 0.95, -4.65)];   // 경첩 자리에 단다

// ── 앞마당 ───────────────────────────────────────────
// 앞문 → 데크 → 계단 → 디딤돌 → 모닥불. 옆에는 연못과 꽃밭.
box(10, 0.4, 3.7, 0, 0, -0.2, 7.95).material = plankMat;                // 데크
rail(-5, 6.25, -5, 9.8); rail(5, 6.25, 5, 9.8); rail(-5, 9.8, -1.7, 9.8); rail(1.7, 9.8, 5, 9.8);
box(3.4, 0.2, 0.5, 0x9a6b42, 0, -0.2, 10.05);                           // 계단
box(3.4, 0.2, 0.5, 0x8a5d38, 0, -0.32, 10.5);
for (const [x, z, r] of [[0.2, 11.15, 0.5], [-0.25, 11.9, 0.42]]) disc(r, 0.06, 0x8d8780, x, YARD_Y + 0.03, z);   // 디딤돌

const CAMP = { x: 0, z: 13 };
prop('Campfire', CAMP.x, CAMP.z, 0, 1, undefined, YARD_Y);
block(CAMP.x - 0.3, CAMP.z - 0.3, CAMP.x + 0.3, CAMP.z + 0.3);
makeFire(CAMP.x, YARD_Y + 0.2, CAMP.z, 1.3);
for (const a of [0, 1.3, -1.3]) {                                        // 모닥불을 둘러싼 통나무 벤치 (집 쪽은 비워 둔다)
  const bx = CAMP.x + Math.sin(a) * 2.2, bz = CAMP.z + Math.cos(a) * 2.2;
  prop('LogBench', bx, bz, a, 1, undefined, YARD_Y);
  for (const d of [-0.5, 0.5]) {
    const x = bx + Math.cos(a) * d, z = bz - Math.sin(a) * d;
    SEATS.push({ x, z, ry: Math.atan2(CAMP.x - x, CAMP.z - z), h: 0.45 });
  }
}

const POND = { x: 9.6, z: 11.6 };
const pond = disc(1, 0.04, 0, POND.x, YARD_Y + 0.02, POND.z);
pond.scale.set(2.6, 1, 1.8);
pond.castShadow = false;
pond.material = new THREE.MeshStandardMaterial({ color: 0x4f9fb8, roughness: 0.05, metalness: 0.4 });   // 하늘이 비치는 물
block(POND.x - 2.2, POND.z - 1.4, POND.x + 2.2, POND.z + 1.4);
for (let i = 0; i < 11; i++) {
  const a = i / 11 * Math.PI * 2 + rnd() * 0.3;
  prop('Rock', POND.x + Math.cos(a) * 2.9, POND.z + Math.sin(a) * 2.05, rnd() * 6.28, 0.55 + rnd() * 0.7, undefined, YARD_Y);
}
for (const [x, z] of [[-13, 7.6], [-10.6, 8.3], [13, 7.5], [12.6, 14.6], [-12.8, 14.2], [-6.6, 8.1], [6.6, 8.3], [6.2, 13.9]])
  prop('Bush', x, z, rnd() * 6.28, 0.8 + rnd() * 0.6, undefined, YARD_Y);
for (const [x, z] of [[-5.7, 10.3], [5.7, 10.3], [-3.2, 12.2], [3.2, 12.2]]) prop('Lantern', x, z, x > 0 ? Math.PI : 0, 1, undefined, YARD_Y);
for (let i = 0; i < 34; i++)                                             // 꽃밭
  prop('Flower', -13.5 + rnd() * 8, 9.3 + rnd() * 5.8, rnd() * 6.28, 0.9 + rnd() * 0.7, [0xf28fa8, 0xf6d55c, 0xffffff, 0xb497e6, 0xf2a35e][i % 5], YARD_Y);
for (let i = 0; i < 7; i++) prop('Rock', -14 + rnd() * 28, 9 + rnd() * 6.5, rnd() * 6.28, 0.3 + rnd() * 0.4, undefined, YARD_Y);

// ── 운동장 ───────────────────────────────────────────
// 마당 너머: 왼쪽 풋살장, 오른쪽 농구 반코트, 둘을 한 바퀴 감싸는 러닝 트랙. 바닥 선은 그림 한 장으로 깐다.
const FIELD = { x: 0, z: 24, w: 30, d: 15 };   // x -15..15, z 16.5..31.5
function fieldTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = FIELD.w * S; c.height = FIELD.d * S;
  const g = c.getContext('2d'), X = (x) => (x + 15) * S, Z = (z) => (z - 16.5) * S;
  const rect = (x1, z1, x2, z2) => [X(x1), Z(z1), (x2 - x1) * S, (z2 - z1) * S];
  const GRASS = '#5c8a55', LINE = 'rgba(255, 255, 255, .9)';
  g.fillStyle = GRASS; g.fillRect(0, 0, c.width, c.height);
  // 트랙: 붉은 고리에 흰 레인 선
  g.fillStyle = '#b5533c'; g.beginPath(); g.roundRect(...rect(-14.5, 16.5, 14.5, 31.5), 3 * S); g.fill();
  g.fillStyle = GRASS; g.beginPath(); g.roundRect(...rect(-12.5, 18.5, 12.5, 29.5), S); g.fill();
  g.strokeStyle = LINE; g.lineWidth = 3;
  for (const d of [0.67, 1.33]) { g.beginPath(); g.roundRect(...rect(-14.5 + d, 16.5 + d, 14.5 - d, 31.5 - d), (3 - d) * S); g.stroke(); }
  g.fillStyle = LINE; g.fillRect(X(-3) - 4, Z(16.5), 8, 2 * S);   // 출발선
  // 풋살장: 줄무늬 잔디, 중앙선·중앙원·벌칙 구역
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#4f8f4a' : '#5a9c54'; g.fillRect(...rect(-11.5 + i * 1.1, 19.5, -11.5 + (i + 1) * 1.1, 28.5)); }
  g.lineWidth = 5;
  g.strokeRect(...rect(-11.5, 19.5, -0.5, 28.5));
  g.strokeRect(...rect(-11.5, 21.5, -9.5, 26.5)); g.strokeRect(...rect(-2.5, 21.5, -0.5, 26.5));
  g.beginPath(); g.moveTo(X(-6), Z(19.5)); g.lineTo(X(-6), Z(28.5)); g.stroke();
  g.beginPath(); g.arc(X(-6), Z(24), 1.5 * S, 0, Math.PI * 2); g.stroke();
  // 농구 반코트: 나무색 바닥, 붉은 골밑, 자유투 원, 3점 선
  g.fillStyle = '#c98a55'; g.fillRect(...rect(1.5, 19.5, 11.5, 28.5));
  g.fillStyle = '#b5533c'; g.fillRect(...rect(7.3, 22.2, 11.5, 25.8));
  g.strokeRect(...rect(1.5, 19.5, 11.5, 28.5)); g.strokeRect(...rect(7.3, 22.2, 11.5, 25.8));
  g.beginPath(); g.arc(X(7.3), Z(24), 1.8 * S, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(X(11.5), Z(19.7)); g.lineTo(X(11), Z(19.7)); g.arc(X(11), Z(24), 4.3 * S, -Math.PI / 2, Math.PI / 2, true); g.lineTo(X(11.5), Z(28.3)); g.stroke();
  g.beginPath(); g.arc(X(1.5), Z(24), 1.5 * S, -Math.PI / 2, Math.PI / 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.d), new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;   // 그림의 위쪽이 오두막 쪽
  ground.position.set(FIELD.x, YARD_Y + 0.012, FIELD.z);
  ground.receiveShadow = true;
  scene.add(ground);
}
for (const [x, ry] of [[-11.5, Math.PI / 2], [-0.5, -Math.PI / 2]]) {     // 골대 둘이 마주 본다
  prop('Goal', x, FIELD.z, ry, 1, undefined, YARD_Y);
  block(Math.min(x, x - Math.sin(ry) * 0.8), FIELD.z - 1.5, Math.max(x, x - Math.sin(ry) * 0.8), FIELD.z + 1.5);
}
const BALL_AT = new THREE.Vector3(-6, YARD_Y + 0.2, FIELD.z);
const soccer = prop('SoccerBall', BALL_AT.x, BALL_AT.z, 0, 1, undefined, BALL_AT.y);
prop('Hoop', 11.9, FIELD.z, -Math.PI / 2, 1, undefined, YARD_Y);
block(11.75, FIELD.z - 0.15, 12.05, FIELD.z + 0.15);
const RIM = new THREE.Vector3(11.02, YARD_Y + 2.3, FIELD.z);              // assets/props.py 의 림 위치 (0, -0.88, 2.3)를 돌린 값
const HOOP_BALL_AT = new THREE.Vector3(8.5, YARD_Y + 0.22, FIELD.z + 0.8);
const hoopBall = prop('Basketball', HOOP_BALL_AT.x, HOOP_BALL_AT.z, 0, 1, undefined, HOOP_BALL_AT.y);
for (const x of [-10, -7.5, -4.5, -2]) prop('Cone', x, 29, 0, 1, undefined, YARD_Y);
prop('StartArch', -3, 17.5, Math.PI / 2, 1, 0xf0a64a, YARD_Y);          // 트랙 출발선 위
prop('Fountain', 0.5, 29.1, Math.PI, 1, undefined, YARD_Y);
block(0.3, 28.9, 0.7, 29.3);
for (const x of [-6, 6.5]) {                                              // 구경하는 통나무 벤치
  prop('LogBench', x, 29.1, 0, 1, undefined, YARD_Y);
  for (const d of [-0.5, 0.5]) seatAt(x + d, 29.1, x + d, FIELD.z, 0.45);
}
for (const [x, z] of [[-3.2, 16.2], [3.2, 16.2], [-13.6, 17.2], [13.6, 17.2]]) prop('Lantern', x, z, x > 0 ? Math.PI : 0, 1, undefined, YARD_Y);

// 공이 날아가는 연출: obj를 지금 자리에서 to까지 dur초 동안, 가운데가 arc만큼 솟는 포물선으로 옮긴다.
// ponytail: 공은 각자 화면에서만 날아간다 (남에게는 차는 몸짓만 보인다). 같이 보이게 하려면 broadcast로 알린다.
const flights = [];
const flying = (obj) => flights.some((f) => f.obj === obj);
function fly(obj, to, dur, arc, then) { flights.push({ obj, from: obj.position.clone(), to, dur, arc, t: 0, then }); }
function moveFlights(dt) {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t = Math.min(1, f.t + dt / f.dur);
    f.obj.position.lerpVectors(f.from, f.to, f.t);
    f.obj.position.y += Math.sin(f.t * Math.PI) * f.arc;
    f.obj.rotation.x += dt * 9;
    if (f.t === 1) { flights.splice(i, 1); f.then?.(); }
  }
}

// 숲: 오두막 뒤와 양옆에 나무
for (let i = 0; i < 170; i++) {
  const x = rnd() * 76 - 38, z = rnd() * 62 - 26, s = 0.8 + rnd() * 0.9, turn = rnd() * 6.28;
  if (Math.abs(x) < 17.5 && z > -8.5) continue;   // 오두막과 마당·운동장, 카메라 앞은 비운다
  prop('Tree', x, z, turn, s, undefined, YARD_Y);
}

console.assert(roomAt(0, 0).id === 'bar' && roomAt(-11, -3).id === 'r1' && roomAt(0, 12).id === 'yard' && blocked(-8, 0) && !blocked(-8, -3)
  && !blocked(0, 0) && !blocked(0, 6) && blocked(5, 6) && floorY(-11, 3) === ROOM_Y && floorY(0, 2.4) === DAIS.y && floorY(0, 12) === YARD_Y, '방·벽·높낮이 배치');

// ── 아바타 ───────────────────────────────────────────
// 블렌더에서 만든 모델 (assets/avatar.py로 다시 생성). "Body" 재질만 사람마다 다른 색.
// PARTS는 avatar.py가 붙인 조각 이름. 각 조각의 원점이 관절이라 rotation만 주면 움직인다.
const PARTS = ['Head', 'EyesOpen', 'EyesHappy', 'MouthOpen', 'Blush', 'ArmL', 'ArmR', 'FootL', 'FootR', 'Tail', 'Coffee', 'Beer', 'BowTie', 'Shaker'];
// 감정표현: 몸짓(pose 함수)과 머리 옆에 뜨는 그림. 숫자 키 1~0 으로도 쓸 수 있다 (EMOTES 순서).
const EMOTES = ['laugh', 'wave', 'bow', 'clap', 'dance', 'love', 'surprise', 'think', 'cry', 'angry', 'sleep'];
const SPORTS = ['kick', 'shoot', 'lift', 'squat', 'read', 'cheers', 'dice'];   // 취미 공간에서만 하는 동작
const EMOJI = { kick: '⚽', shoot: '🏀', lift: '💪', squat: '🔥', read: '📖', cheers: '🥂', dice: '🎲', wave: '👋', clap: '👏', dance: '🎵', love: '💕', surprise: '❗', think: '💭', cry: '💧', angry: '💢', sleep: '💤' };
const ACTS = ['idle', 'coffee', 'beer', 'drunk', ...EMOTES, ...SPORTS];
const avatarModel = (await new GLTFLoader().loadAsync('/assets/avatar.glb')).scene;
console.assert(PARTS.every((n) => avatarModel.getObjectByName(n)), 'avatar.glb에 빠진 조각이 있음');

// 고양이 무늬. 모델의 털 구역(assets/avatar.py의 재질 이름)마다 색을 정한다.
// 따로 적지 않은 구역은 바탕 털색을 따라가고, 줄무늬는 Stripe를 적은 고양이에게만 보인다.
function coat(Fur, o = {}) {
  const c = { Fur, Patch1: Fur, Patch2: Fur, EarL: Fur, EarR: Fur, Tail: Fur, Paw: Fur, Muzzle: Fur, Bib: Fur, Eye: 0x2a2222, Whisker: 0x2a2222, ...o };
  c.Stripe ??= Fur;
  c.StripeP1 = o.Stripe ?? c.Patch1;   // 얼룩 위를 지나는 줄무늬
  c.StripeP2 = o.Stripe ?? c.Patch2;
  c.TailStripe ??= o.Stripe ?? c.Tail;
  return c;
}
const WHITE = 0xfbf4e8, ORANGE = 0xf0a04b, BLACK = 0x2e2a28, GRAY = 0x8f8a84;
const COATS = [
  coat(0xf2b06a, { Stripe: 0xd27f2e, Paw: WHITE, Muzzle: WHITE, Bib: WHITE }),                                   // 0 치즈
  coat(0x9d968c, { Stripe: 0x4b4540, Muzzle: 0xd9d2c6 }),                                                        // 1 고등어
  coat(WHITE, { Patch1: ORANGE, Patch2: BLACK, EarL: BLACK, EarR: ORANGE, Tail: BLACK, TailStripe: ORANGE }),    // 2 삼색이
  coat(BLACK, { Paw: WHITE, Muzzle: WHITE, Bib: WHITE, Eye: 0x1c1a19 }),                                         // 3 턱시도
  coat(WHITE),                                                                                                   // 4 흰둥이
  coat(BLACK, { Eye: 0xd9df62, Whisker: 0xe8e2d8 }),                                                             // 5 까망이
  coat(WHITE, { Patch1: GRAY, Patch2: GRAY, EarL: GRAY, EarR: GRAY, Tail: GRAY }),                               // 6 젖소(회색 얼룩)
  coat(0xf1e3cc, { Muzzle: 0x5c463a, EarL: 0x5c463a, EarR: 0x5c463a, Tail: 0x5c463a, Paw: 0x5c463a, Eye: 0x4f93cf }),   // 7 샴
];
const coatMats = COATS.map(() => new Map());   // 같은 무늬끼리는 재질을 같이 쓴다
function coatMaterial(cat, original) {
  const color = COATS[cat][original.name];
  if (color === undefined) return original;
  if (!coatMats[cat].has(original.name)) {
    const m = original.clone();
    m.color.set(color);
    coatMats[cat].set(original.name, m);
  }
  return coatMats[cat].get(original.name);
}
const COAT_NAMES = ['치즈', '고등어', '삼색이', '턱시도', '흰둥이', '까망이', '회색 얼룩', '샴'];
const validCat = (n) => Number.isInteger(n) ? ((n % COATS.length) + COATS.length) % COATS.length : 0;

function applyCoat(a, cat) {   // 외형 입히기 (나중에 바꿀 때도 쓴다)
  a.userData.cat = cat;
  a.userData.model.traverse((o) => { if (o.material) o.material = coatMaterial(cat, o.material); });
}

function makeAvatar(cat, x, z) {
  const model = avatarModel.clone();
  model.traverse((o) => { o.castShadow = true; });
  const root = new THREE.Group();   // root: 위치·방향 / model: 그 안에서 들썩임·비틀거림
  root.add(model);
  root.position.set(x, 0, z);
  const bubble = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'bubble', hidden: true }));
  const tag = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'tag', hidden: true }));
  const emo = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'emo', hidden: true }));
  root.userData = { model, bubble, tag, emo, nick: '', status: '', bubbleUntil: 0, act: 'idle', actAt: 0, seat: -1,
                    p: Object.fromEntries(PARTS.map((n) => [n, model.getObjectByName(n)])) };
  root.userData.p.BowTie.visible = false;   // 나비넥타이는 바텐더만
  applyCoat(root, cat);
  scene.add(root);
  return root;
}
function removeAvatar(a) { scene.remove(a); a.userData.bubble.remove(); a.userData.tag.remove(); a.userData.emo.remove(); }
// 머리 위 이름표: "닉네임 · 지금 하는 일"
function setTag(a, nick, status) {
  Object.assign(a.userData, { nick, status });
  a.userData.tag.textContent = [nick, status].filter(Boolean).join(' · ');
}

// 목표 쪽으로 한 걸음. 걸었으면 true. collide면 벽에 막히고, 막힌 축만 빼고 미끄러진다.
// ponytail: 길찾기 없음. 벽 너머를 클릭하면 벽 앞에서 멈춘다. 필요해지면 navmesh.
function walk(a, to, maxDist, collide) {
  const pos = a.position, dx = to.x - pos.x, dz = to.z - pos.z, len = Math.hypot(dx, dz);
  if (len < 1e-3) return false;
  const k = Math.min(1, maxDist / len), x0 = pos.x, z0 = pos.z;
  if (!collide || !blocked(x0 + dx * k, z0)) pos.x = x0 + dx * k;
  if (!collide || !blocked(pos.x, z0 + dz * k)) pos.z = z0 + dz * k;
  if (pos.x === x0 && pos.z === z0) return false;
  a.rotation.y = Math.atan2(dx, dz);   // 가는 쪽을 바라보기
  return true;
}

// 매 프레임 자세를 통째로 다시 계산한다 (상태가 없어서 동작이 바뀌어도 꼬이지 않음).
const CUP_REST = new THREE.Vector3(0.4, 0.45, 0.42), CUP_SIP = new THREE.Vector3(0.2, 1.0, 0.58);
const { smoothstep } = THREE.MathUtils;
function pose(a, moving, t) {
  const { model, p, act, emo } = a.userData, at = t - a.userData.actAt;
  const seat = SEATS[a.userData.seat];
  const sitting = !!seat && !moving && Math.hypot(a.position.x - seat.x, a.position.z - seat.z) < 0.05;
  if (sitting) a.rotation.y = seat.ry;
  const step = moving ? Math.sin(t * (act === 'drunk' ? 8 : 13)) : 0;   // 걸음 박자
  const beat = (hz) => Math.sin(at * hz), bounce = (hz) => Math.abs(Math.sin(at * hz));
  // 한 모금 = 2초: 컵을 들고(0.4초) 마시고 내린다. k: 0(내림) ~ 1(입에 댐)
  const c = at % 2, k = act === 'coffee' || act === 'beer' ? smoothstep(c, 0, 0.4) - smoothstep(c, 1.2, 1.6) : 0;

  // 기본 자세(서기·걷기·앉기)에서 시작해서, 지금 동작이 필요한 것만 덮어쓴다.
  // 몸: y 높이, x 좌우 떨림, lean 앞으로 숙임, tilt 옆으로 기울임, turn 돌기 / 팔: x 앞뒤, z 옆으로 벌림(왼팔 −, 오른팔 +)
  const P = { y: (sitting ? seat.h : 0) + Math.abs(step) * 0.05, x: 0, lean: 0, tilt: 0, turn: 0, headX: 0, headZ: 0,
              armLx: -step * 0.6, armRx: step * 0.6, armLz: 0, armRz: 0, tail: Math.sin(t * 1.5) * 0.15,
              happy: false, mouth: false, blush: false };
  switch (act) {
    case 'coffee': case 'beer':   // 컵을 입으로
      P.headX = -0.2 * k; P.armRx = -(0.9 + 1.3 * k); P.armRz = -0.6 * k; P.happy = k > 0.3; P.blush = act === 'beer'; break;
    case 'drunk':                 // 비틀비틀
      P.tilt = Math.sin(t * 2.2) * 0.16; P.lean = Math.sin(t * 1.7) * 0.07; P.headZ = Math.sin(t * 2.2 + 1) * 0.14; P.happy = P.blush = true; break;
    case 'serve':                 // 바텐더: 두 손으로 셰이커 흔들기
      P.armLx = P.armRx = -1.7 + beat(26) * 0.3; P.armLz = 0.9; P.armRz = -0.9; break;
    case 'kick':                  // 몸을 젖혔다가 앞으로 차기
      P.lean = -0.3 * Math.sin(Math.min(at / 0.6, 1) * Math.PI * 2); P.y += Math.sin(Math.min(at / 0.6, 1) * Math.PI) * 0.12; P.armLz = -0.9; P.armRz = 0.9; break;
    case 'shoot':                 // 두 팔을 머리 위로 뻗으며 폴짝
      P.armLx = P.armRx = -2.7; P.armLz = 0.25; P.armRz = -0.25; P.y += Math.sin(Math.min(at / 0.7, 1) * Math.PI) * 0.3; P.headX = -0.2; break;
    case 'lift':                  // 두 팔을 올렸다 내렸다 (덤벨)
      P.armLx = P.armRx = -(1.3 + 1.2 * (0.5 - 0.5 * Math.cos(at * 4))); P.armLz = -0.35; P.armRz = 0.35; break;
    case 'squat':                 // 팔을 앞으로 뻗고 앉았다 일어났다
      P.y -= 0.16 * (0.5 - 0.5 * Math.cos(at * 4)); P.lean = 0.15 * (0.5 - 0.5 * Math.cos(at * 4)); P.armLx = P.armRx = -1.5; break;
    case 'read':                  // 두 손으로 책을 펴 들고 고개 숙여 읽기
      P.headX = 0.28; P.headZ = Math.sin(at * 0.8) * 0.04; P.armLx = P.armRx = -1.25; P.armLz = 0.4; P.armRz = -0.4; break;
    case 'cheers':                // 잔을 높이 들고 들썩
      P.armRx = -2.6; P.armRz = -0.2; P.y += bounce(6) * 0.04; P.happy = P.mouth = true; break;
    case 'dice':                  // 손을 흔들다 던지기
      P.armRx = -1.6 + (at < 0.8 ? beat(30) * 0.35 : -0.6); P.armRz = -0.4; P.happy = at > 0.8; break;
    case 'laugh':                 // 들썩이며 팔 벌리고 꼬리 흔들기
      P.y += bounce(13) * 0.07; P.headX = -0.2 - bounce(13) * 0.08; P.armLz = -(0.5 + bounce(13) * 0.5); P.armRz = 0.5 + bounce(13) * 0.5;
      P.tail = Math.sin(t * 18) * 0.5; P.happy = P.mouth = true; break;
    case 'wave':                  // 한 손 높이 들고 흔들기
      P.armRz = 2.3 + beat(12) * 0.4; P.headZ = -0.1; P.happy = true; break;
    case 'bow':                   // 꾸벅 숙였다 일어나기
      P.lean = 0.6 * Math.sin(Math.min(at / 1.6, 1) * Math.PI); break;
    case 'clap':                  // 두 손을 앞에서 마주치기
      P.armLx = P.armRx = -1.5; P.armLz = 0.45 + bounce(14) * 0.5; P.armRz = -(0.45 + bounce(14) * 0.5); P.y += bounce(14) * 0.02; P.happy = true; break;
    case 'dance':                 // 통통 뛰며 좌우로 흔들고 팔을 번갈아 들기
      P.y += bounce(8) * 0.12; P.tilt = beat(8) * 0.2; P.turn = beat(4) * 0.6; P.armLz = -(1.6 + beat(8) * 0.6); P.armRz = 1.6 - beat(8) * 0.6;
      P.tail = beat(16) * 0.5; P.happy = true; break;
    case 'love':                  // 두 손 모으고 살랑살랑
      P.y += bounce(5) * 0.05; P.tilt = beat(3) * 0.1; P.armLx = P.armRx = -1.5; P.armLz = 0.8; P.armRz = -0.8; P.happy = P.blush = true; break;
    case 'surprise':              // 폴짝 뛰며 팔 번쩍
      P.y += Math.sin(Math.min(at / 0.5, 1) * Math.PI) * 0.35; P.armLz = -1.3; P.armRz = 1.3; P.headX = -0.15; P.mouth = true; break;
    case 'think':                 // 한 손을 턱에 대고 갸웃
      P.armRx = -2.1; P.armRz = -0.75; P.headZ = 0.15; P.headX = -0.08; break;
    case 'cry':                   // 고개 숙이고 두 손으로 눈 가리고 훌쩍
      P.headX = 0.25; P.headZ = beat(20) * 0.04; P.armLx = P.armRx = -1.9; P.armLz = 0.7; P.armRz = -0.7; P.happy = true; break;
    case 'angry':                 // 부들부들 떨며 발 구르기
      P.x = beat(45) * 0.03; P.y += bounce(10) * 0.04; P.headX = 0.15; P.armLz = -0.7; P.armRz = 0.7; P.tail = beat(25) * 0.6; break;
    case 'sleep':                 // 고개 떨구고 꾸벅꾸벅
      P.headX = 0.3 + Math.sin(at * 1.5) * 0.06; P.headZ = 0.2; P.y += Math.sin(at * 2) * 0.015; P.tail = 0; P.happy = true; break;
  }

  model.position.set(P.x, P.y, 0);
  model.rotation.set(P.lean, P.turn, P.tilt);
  p.Head.rotation.x = P.headX;
  p.Head.rotation.z = P.headZ;
  p.FootL.rotation.x = sitting ? -1.2 : step * 0.7;   // 앉으면 발을 앞으로
  p.FootR.rotation.x = sitting ? -1.2 : -step * 0.7;
  p.ArmL.rotation.x = P.armLx;
  p.ArmL.rotation.z = P.armLz;
  p.ArmR.rotation.x = P.armRx;
  p.ArmR.rotation.z = P.armRz;
  p.Tail.rotation.y = P.tail;
  p.EyesOpen.visible = !P.happy;
  p.EyesHappy.visible = P.happy;   // 웃는 눈(^ ^)은 감은 눈으로도 쓴다
  p.MouthOpen.visible = P.mouth;
  p.Blush.visible = P.blush;
  p.Shaker.visible = act === 'serve';
  if (act === 'serve') p.Shaker.position.set(0, 0.8 + beat(26) * 0.09, 0.5);
  for (const [name, cup] of [['coffee', p.Coffee], ['beer', p.Beer]]) {
    cup.visible = act === name;
    cup.position.lerpVectors(CUP_REST, CUP_SIP, k);
    cup.rotation.x = -0.9 * k;
  }
  const mark = EMOJI[act] ?? '';   // 머리 옆에 뜨는 그림
  if (emo.textContent !== mark) emo.textContent = mark;
}

// 말풍선: 머리 위 화면 좌표에 HTML을 띄운다.
const v3 = new THREE.Vector3();
function say(a, text) {
  a.userData.bubble.textContent = text;   // textContent라 남이 보낸 글에 태그가 있어도 실행되지 않는다
  a.userData.bubbleUntil = now() + 5;
}
function placeBubble(a, t) {   // 이름표는 머리 바로 위, 말풍선은 그 위
  const { bubble, tag, emo } = a.userData;
  bubble.hidden = t > a.userData.bubbleUntil;
  tag.hidden = !tag.textContent;
  emo.hidden = !emo.textContent;
  for (const [el, up, shift] of [[tag, 2.0, '-50%'], [bubble, 2.45, '-50%'], [emo, 1.9, '60%']]) {   // 감정 그림은 머리 오른쪽 위에서 둥실
    if (el.hidden) continue;
    v3.set(a.position.x, a.position.y + up + (el === emo ? Math.sin(t * 4) * 0.06 : 0), a.position.z).project(camera);
    el.style.transform = `translate(${(v3.x + 1) / 2 * innerWidth}px, ${(1 - v3.y) / 2 * innerHeight}px) translate(${shift}, -100%)`;
  }
}

// ── 나 ───────────────────────────────────────────────
// 방 안 좌표만 통과. 남이 보낸 값에도 쓰므로 여기서 검증한다.
function clampPos(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x: Math.max(-BX, Math.min(BX, x)), z: Math.max(Z_MIN, Math.min(Z_MAX, z)) };
}
console.assert(clampPos(NaN, 0) === null && clampPos(99, -99).x === BX && clampPos('1', 0) === null, 'clampPos');

const q = new URLSearchParams(location.search);
const startAt = clampPos(...(q.get('at') ?? '').split(',').map(Number));   // 확인용: ?at=-11.5,-3 → 그 자리에서 시작
const myId = member?.id ?? crypto.randomUUID();
// 내 고양이 외형은 들어올 때마다 같다. 회원은 가입할 때 정해져 DB(profiles.cat)에 저장된 것, 혼자 모드는 이 브라우저에 저장된 것.
function savedCat() {
  if (member) {
    if (Number.isInteger(member.cat)) return member.cat;
    return [...member.id].reduce((hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0, 0);   // DB에 아직 cat 칸이 없어도(002 미실행) 계정마다 늘 같은 고양이
  }
  try {
    const saved = localStorage.getItem('cat');
    if (saved !== null) return Number(saved);
  } catch {}
  const picked = Math.floor(Math.random() * COATS.length);
  try { localStorage.setItem('cat', picked); } catch {}
  return picked;
}
let myCat = validCat(savedCat());
const me = makeAvatar(myCat, startAt?.x ?? CLOSET.x, startAt?.z ?? CLOSET.z);

// 지금 하는 일: 적어 두면 머리 위 이름표에 뜨고 다른 사람에게도 보인다. 다음에 와도 남아 있다.
const statusInput = document.getElementById('status');
try { statusInput.value = localStorage.getItem('status') ?? ''; } catch {}
setTag(me, member?.nickname ?? '', statusInput.value.trim());
statusInput.addEventListener('change', () => {
  setTag(me, me.userData.nick, statusInput.value.trim());
  try { localStorage.setItem('status', me.userData.status); } catch {}
  net.state();
  statusInput.blur();
});
const target = me.position.clone();   // 입장 연출이 시작되면 벽장 밖으로 걸어 나온다
let myRoom = null, online = 0;
// 멀티플레이가 켜지면 남에게 알리는 함수로 바뀐다
const net = { state() {}, chat() {} };

// 동작이 끝나는 시간(초)과 그다음 동작. 커피 4초(두 모금), 술 4초 → 취함 15초 → 원래대로
const NEXT = { coffee: [4, 'idle'], beer: [4, 'drunk'], drunk: [15, 'idle'], laugh: [3, 'idle'], wave: [2.5, 'idle'], bow: [1.6, 'idle'], clap: [3, 'idle'],
               dance: [6, 'idle'], kick: [1.2, 'idle'], shoot: [1.4, 'idle'], lift: [6, 'idle'], squat: [6, 'idle'], read: [12, 'idle'], cheers: [3, 'idle'], dice: [2, 'idle'], love: [3.5, 'idle'], surprise: [1.5, 'idle'], think: [4, 'idle'], cry: [4, 'idle'], angry: [3, 'idle'], sleep: [10, 'idle'] };
let actTimer;
function setAct(act) {
  clearTimeout(actTimer);
  me.userData.act = act;
  me.userData.actAt = now();
  net.state();
  if (NEXT[act]) actTimer = setTimeout(setAct, NEXT[act][0] * 1000, NEXT[act][1]);
}
document.getElementById('acts').addEventListener('click', (e) => {
  const act = e.target.dataset?.act;
  if (act) document.getElementById('emotes').open = false;   // 고르면 감정표현 메뉴를 닫는다
  if (act === 'beer') orderBeer();
  else if (ACTS.includes(act)) setAct(act);
});
if (ACTS.includes(q.get('act'))) setAct(q.get('act'));   // 확인용: ?act=drunk

// 앉기: 자리를 클릭하거나, 가까운 자리 옆에서 E. 움직이면 일어난다.
// ponytail: 자리 선점 없음. 두 마리가 같은 자리에 겹쳐 앉을 수 있다.
function setSeat(i) {
  if (me.userData.seat === i) return;
  me.userData.seat = i;
  if (i >= 0) target.set(SEATS[i].x, 0, SEATS[i].z);
  net.state();
}
const nearestSeat = (x, z, max) => SEATS.reduce((best, s, i) => {
  const d = Math.hypot(s.x - x, s.z - z);
  return d < best.d ? { i, d } : best;
}, { i: -1, d: max }).i;
function toggleSit() { setSeat(me.userData.seat >= 0 ? -1 : nearestSeat(me.position.x, me.position.z, 2.5)); }
if (q.has('sit')) toggleSit();   // 확인용: ?at=-3.5,2&sit

const ray = new THREE.Raycaster();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), seatTop = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.4);
renderer.domElement.addEventListener('click', (e) => {
  if (dragged > 8) return;   // 끌었으면 카메라 조작이었다
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1), camera);
  const top = ray.ray.intersectPlane(seatTop, new THREE.Vector3());
  const seat = top ? nearestSeat(top.x, top.z, 0.6) : -1;
  if (seat >= 0) return setSeat(seat);
  const hit = ray.ray.intersectPlane(floor, new THREE.Vector3());
  const p = hit && clampPos(hit.x, hit.z);
  if (p) { setSeat(-1); target.set(p.x, 0, p.z); }
});

// WASD·방향키. e.code를 써서 한글 입력 상태에서도 동작한다. 채팅 입력 중에는 무시.
const MOVE_KEYS = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
                    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const held = new Set();
let keyWalking = false;
const chatInput = document.getElementById('chat');
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) {   // 글자를 치는 중에는 고양이를 움직이지 않는다
    if (e.code === 'Escape') e.target.blur();
    return;
  }
  if (MOVE_KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
  else if (e.code === 'KeyE') toggleSit();
  else if (/^Digit\d$/.test(e.code)) setAct(EMOTES[(Number(e.code[5]) + 9) % 10]);   // 1~9, 0 = 감정표현
  else if (e.code === 'KeyQ') moveCam(...CAM_STEPS.left);
  else if (e.code === 'KeyR') moveCam(...CAM_STEPS.right);
  else if (e.code === 'Equal' || e.code === 'NumpadAdd') moveCam(...CAM_STEPS.in);
  else if (e.code === 'Minus' || e.code === 'NumpadSubtract') moveCam(...CAM_STEPS.out);
  else if (e.code === 'Enter') { chatInput.focus(); e.preventDefault(); }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());   // 창을 벗어나면 keyup을 못 받으므로
chatInput.addEventListener('focus', () => held.clear());
function applyKeys() {
  let x = 0, z = 0;
  for (const code of held) { x += MOVE_KEYS[code][0]; z += MOVE_KEYS[code][1]; }
  if (x || z) {
    setSeat(-1);
    // 화면 기준 방향을 카메라가 돌아간 만큼 돌린다 (W는 항상 화면 안쪽)
    const len = Math.hypot(x, z), c = Math.cos(cam.yaw), sn = Math.sin(cam.yaw);
    const p = clampPos(me.position.x + (x * c + z * sn) / len, me.position.z + (-x * sn + z * c) / len);   // 누른 쪽 한 걸음 앞을 목표로
    target.set(p.x, 0, p.z);
  } else if (keyWalking) target.copy(me.position);   // 키를 떼면 그 자리에 멈춤
  keyWalking = !!(x || z);
}

document.getElementById('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  chatInput.value = '';
  if (!text) return chatInput.blur();
  say(me, text);
  net.chat(text);
});
if (q.get('say')) say(me, q.get('say').slice(0, 200));   // 확인용: ?say=안녕

// 트랙 바퀴 수: 트랙 고리 위에 있는 동안 운동장 한가운데를 중심으로 돈 각도를 더한다. 운동장을 나가면 0으로.
// ponytail: 운동장을 가로질러도 각도는 이어진다 (지름길을 막지 않는다).
const turned = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));   // 두 각도의 차이 (-π..π)
console.assert(Math.abs(turned(3, -3) - (2 * Math.PI - 6)) < 1e-9 && turned(1, 1.5) === 0.5, 'turned');
let lapAngle = null, lapSum = 0, laps = 0;
function countLaps() {
  const { x, z } = me.position;
  if (myRoom?.id !== 'track' || !(Math.abs(x) > 12.5 || z < 18.5 || z > 29.5)) { lapAngle = null; return; }
  const a = Math.atan2(z - FIELD.z, x - FIELD.x);
  if (lapAngle !== null) lapSum += turned(lapAngle, a);
  lapAngle = a;
  const n = Math.floor(Math.abs(lapSum) / (2 * Math.PI));
  if (n > laps) { laps = n; say(me, `🏃 ${n}바퀴!`); net.chat(`🏃 ${n}바퀴!`); }
}
function refreshRoom() {
  countLaps();
  const r = roomAt(me.position.x, me.position.z) ?? myRoom;
  if (r === myRoom) return;
  myRoom = r;
  if (r.z1 < 16) lapSum = laps = 0;   // 운동장 밖으로 나감
  showHud();
  net.state();   // 게시판이 공간별 인원을 셀 수 있게 지금 있는 방을 알린다
}

// ── 방명록·초대 코드 창 ──────────────────────────────
const panel = document.getElementById('panel'), panelBody = document.getElementById('panelBody');
const inviteBtn = document.getElementById('inviteBtn');
document.querySelector('#menu > div').addEventListener('click', () => { document.getElementById('menu').open = false; });   // 고르면 메뉴를 닫는다
function openPanel(title) {
  document.getElementById('panelTitle').textContent = title;
  panelBody.replaceChildren();
  panel.hidden = false;
}
document.getElementById('panelClose').addEventListener('click', () => { panel.hidden = true; });
// 취미 공간의 모임 게시대: 게시판과 같은 글·모임을 읽는다. 글은 새 탭에서 열려 오두막에 그대로 머문다.
async function openHobby(hobby) {
  openPanel(`📋 ${hobby} 모임 게시대`);
  boardCss();
  const [m, a] = await Promise.all([
    supabase.from('meetups').select('article_id, starts_at, sido, district, capacity, articles!inner(title, category), rsvps(count)')
      .eq('status', 'open').gte('starts_at', new Date().toISOString()).eq('rsvps.status', 'going').eq('articles.category', hobby)
      .order('starts_at').limit(5),
    supabase.from('articles').select('id, title, nickname').eq('category', hobby).order('created_at', { ascending: false }).limit(8),
  ]);
  const link = (id, text) => h('a', { href: `/p/${id}`, target: '_blank', rel: 'noopener', textContent: text, style: 'color: inherit; font-weight: 700;' });
  const empty = (text) => h('li', { className: 'bd-empty', textContent: text });
  const meets = (m.data ?? []).map((x) => {
    const note = h('span', { className: 'bd-meta' });
    return h('li', { className: 'bd-post' }, link(x.article_id, x.articles.title),
      h('div', { className: 'bd-meta', textContent: meetLine(x) }),
      h('button', { className: 'bd-link', type: 'button', textContent: '참가 신청', onclick: async () => {
        const { data, error } = await supabase.rpc('join_meetup', { p_meetup: x.article_id });
        note.textContent = error ? ' 신청하지 못했어요: ' + error.message
          : ' ' + ({ going: '참가 확정!', waiting: '대기 중이에요', pending: '수락을 기다리는 중이에요' }[data] ?? '');
      } }), note);
  });
  const posts = (a.data ?? []).map((x) => h('li', { className: 'bd-post' }, link(x.id, x.title), h('span', { className: 'bd-meta', textContent: ' ' + x.nickname })));
  const error = m.error ?? a.error;
  panelBody.replaceChildren(h('div', { className: 'bd' },
    error && h('p', { className: 'bd-msg', textContent: '불러오지 못했어요: ' + error.message }),
    h('strong', { textContent: '다가오는 모임' }), h('ol', { className: 'bd-list' }, ...(meets.length ? meets : [empty('예정된 모임이 없어요.')])),
    h('strong', { textContent: '최근 글' }), h('ol', { className: 'bd-list' }, ...(posts.length ? posts : [empty('아직 글이 없어요.')])),
    h('a', { href: `/write?c=${encodeURIComponent(hobby)}`, target: '_blank', rel: 'noopener', textContent: '✏️ 글쓰기 · 모임 열기', style: 'color: inherit;' })));
}
const meetLine = (x) => `${when(x.starts_at)} · ${x.sido} ${x.district} · ${(x.rsvps[0]?.count ?? 0) + 1}/${x.capacity}명`;
function openBook(board) {
  openPanel(`📖 ${BOARDS[board]} 방명록`);
  mountBoard(panelBody, supabase, member, board);
}
document.getElementById('lookBtn').addEventListener('click', () => {   // 외형 바꾸기: 고르면 저장되고 다음에도 그대로
  openPanel('🐱 고양이 외형');
  const note = document.createElement('p');
  note.textContent = '고르면 바로 바뀌고, 다음에 들어와도 그대로예요.';
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
  COAT_NAMES.forEach((name, cat) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.setAttribute('aria-pressed', cat === myCat);
    b.addEventListener('click', async () => {
      if (supabase) {
        const { error } = await supabase.rpc('set_cat', { p_cat: cat });
        if (error) { note.textContent = '바꾸지 못했어요: ' + error.message; return; }
      } else {
        try { localStorage.setItem('cat', cat); } catch {}
      }
      myCat = cat;
      applyCoat(me, cat);
      net.state();
      for (const other of row.children) other.setAttribute('aria-pressed', other === b);
    });
    row.append(b);
  });
  panelBody.replaceChildren(note, row);
});
inviteBtn.disabled = !supabase;
inviteBtn.title = supabase ? '' : '가입한 뒤에 쓸 수 있어요';
inviteBtn.addEventListener('click', async () => {   // 처음 누를 때 3개가 발급되고, 그 뒤로는 같은 3개가 보인다
  openPanel('🎟 초대 코드');
  const { data, error } = await supabase.rpc('my_invites');
  const note = document.createElement('p');
  note.textContent = error ? '초대 코드를 불러오지 못했어요: ' + error.message : '친구에게 나눠 줄 초대 코드예요. 계정당 3개가 전부이고, 하나를 한 번만 쓸 수 있어요.';
  const list = document.createElement('ul');
  for (const inv of data ?? []) {
    const li = document.createElement('li'), code = document.createElement('code');
    code.textContent = inv.invite_code;
    li.className = inv.is_used ? 'used' : '';
    li.append(code, inv.is_used ? ' 사용됨' : '');
    list.append(li);
  }
  panelBody.replaceChildren(note, list);
});

// ── 그 자리에 가면 뜨는 행동 버튼 ────────────────────
// where(): 지금 이 행동을 할 수 있으면 버튼을 띄울 3D 위치 { x, y, z }, 아니면 null
const spots = [];
function addSpot(label, where, run) {
  const el = document.body.appendChild(Object.assign(document.createElement('button'), { className: 'spot', textContent: label, hidden: true }));
  el.addEventListener('click', run);
  spots.push({ el, where });
  return el;
}
function placeSpots() {
  for (const s of spots) {
    const at = s.where();
    s.el.hidden = !at;
    if (!at) continue;
    v3.set(at.x, at.y, at.z).project(camera);
    s.el.style.transform = `translate(${(v3.x + 1) / 2 * innerWidth}px, ${(1 - v3.y) / 2 * innerHeight}px) translate(-50%, -50%)`;
  }
}
const near = (p, dist) => Math.hypot(me.position.x - p.x, me.position.z - p.z) < dist;

addSpot('☕ 커피 내리기', () => near(COFFEE_AT, 2.6) && me.userData.act !== 'coffee' ? { x: COFFEE_AT.x, y: 2.2, z: COFFEE_AT.z } : null,
  () => setAct('coffee'));
addSpot('🍺 술 주문', () => {   // 카운터 앞에 서면 내 앞 카운터 위에 뜬다
  const { x, z } = me.position;
  return x > -6.4 && x < 3.6 && z > -3.9 && z < -1.8 && !order && me.userData.act !== 'beer' ? { x: Math.max(-5.4, Math.min(2.4, x)), y: 1.6, z: -4.1 } : null;
}, () => orderBeer());
const seatNearMe = () => me.userData.seat < 0 ? nearestSeat(me.position.x, me.position.z, 1.7) : -1;
addSpot('🪑 앉기 (E)', () => {
  const s = SEATS[seatNearMe()];
  return s ? { x: s.x, y: floorY(s.x, s.z) + 1.0, z: s.z } : null;
}, () => setSeat(seatNearMe()));
const leave = () => { location.href = '/'; };   // 메인(게시판)으로 나가기: ☰ 메뉴에서, 또는 들어왔던 벽장 앞에서
document.getElementById('exitBtn').addEventListener('click', leave);
addSpot('🚪 게시판으로 나가기', () => near(CLOSET, 1.8) && now() - introAt > 6 ? { x: CLOSET.x, y: 2.9, z: CLOSET.z } : null, leave);
const standNearMe = () => supabase && BOOKS.find((b) => near(b, 2.2));
addSpot('📖 방명록', () => {
  const b = standNearMe();
  return b?.board ? { x: b.x, y: b.y + 1.7, z: b.z } : null;
}, () => openBook(standNearMe().board));
addSpot('📋 모임 게시대', () => {
  const b = standNearMe();
  return b?.hobby ? { x: b.x, y: b.y + 1.7, z: b.z } : null;
}, () => openHobby(standNearMe().hobby));

// 모임 팻말: 24시간 안에 열리는 모임이 있는 취미는 게시대 위에 일정이 떠 있다 (멀리서도 보이고, 누르면 게시대가 열린다).
const soon = new Map();   // 취미 → 가장 가까운 모임 한 줄
async function loadSoon() {
  const { data } = await supabase.from('meetups').select('article_id, starts_at, sido, district, capacity, articles!inner(category), rsvps(count)')
    .eq('status', 'open').gte('starts_at', new Date().toISOString()).lte('starts_at', new Date(Date.now() + 24 * 3600e3).toISOString())
    .eq('rsvps.status', 'going').order('starts_at');
  soon.clear();
  for (const x of data ?? []) if (!soon.has(x.articles.category)) soon.set(x.articles.category, '📌 ' + meetLine(x));
}
if (supabase) { loadSoon(); setInterval(loadSoon, 5 * 60e3); }
for (const b of BOOKS.filter((b) => b.hobby)) {
  const el = addSpot('', () => {
    if (!soon.has(b.hobby) || near(b, 2.2) || !near(b, 12)) return null;
    el.textContent = soon.get(b.hobby);
    return { x: b.x, y: b.y + 2.4, z: b.z };
  }, () => openHobby(b.hobby));
}

// 취미 공간에서만 하는 행동
const resting = (act) => me.userData.act !== act && me.userData.seat < 0;
addSpot('⚽ 공 차기', () => near(BALL_AT, 2) && !flying(soccer) && soccer.position.equals(BALL_AT) ? { x: BALL_AT.x, y: YARD_Y + 1.6, z: BALL_AT.z } : null, () => {
  setAct('kick');
  const goalX = me.position.x < BALL_AT.x ? -1 : -11;   // 내가 선 반대편 골대로
  fly(soccer, new THREE.Vector3(goalX, BALL_AT.y, BALL_AT.z + Math.random() * 2 - 1), 0.7, 0.8, () => setTimeout(() => soccer.position.copy(BALL_AT), 1200));
});
addSpot('🏀 슛', () => myRoom?.id === 'court' && !flying(hoopBall) && hoopBall.position.equals(HOOP_BALL_AT) ? { x: RIM.x, y: RIM.y + 1, z: RIM.z } : null, () => {
  setAct('shoot');
  hoopBall.position.set(me.position.x, YARD_Y + 1.5, me.position.z);
  fly(hoopBall, RIM, 0.9, 1.4, () => fly(hoopBall, new THREE.Vector3(RIM.x, HOOP_BALL_AT.y, RIM.z), 0.4, 0, () => setTimeout(() => hoopBall.position.copy(HOOP_BALL_AT), 800)));
});
addSpot('🎲 주사위 굴리기', () => near(GAME_AT, 2.6) && me.userData.act !== 'dice' ? { x: GAME_AT.x, y: ROOM_Y + 1.5, z: GAME_AT.z } : null, () => {
  setAct('dice');
  const text = `🎲 ${1 + Math.floor(Math.random() * 6)}`;   // 같은 방 사람에게도 결과가 말풍선으로 보인다
  setTimeout(() => { say(me, text); net.chat(text); }, 900);
});
addSpot('📖 책 읽기', () => near(READ_AT, 2) && me.userData.act !== 'read' ? { x: READ_AT.x, y: ROOM_Y + 2, z: READ_AT.z } : null, () => setAct('read'));
addSpot('🥂 건배', () => {
  const c = me.userData.act !== 'cheers' && CAFE.find((c) => near(c, 1.9));
  return c ? { x: c.x, y: ROOM_Y + 1.8, z: c.z } : null;
}, () => setAct('cheers'));
addSpot('🏋️ 덤벨 들기', () => near(RACK_AT, 2.2) && resting('lift') ? { x: RACK_AT.x, y: ROOM_Y + 1.7, z: RACK_AT.z } : null, () => setAct('lift'));
addSpot('🦵 스쿼트', () => near(MATS_AT, 1.4) && resting('squat') ? { x: MATS_AT.x, y: ROOM_Y + 1.5, z: MATS_AT.z } : null, () => setAct('squat'));

// ── 바텐더 ───────────────────────────────────────────
// 카운터 뒤를 오가며 주문을 받는다: 손님 앞으로 걸어와서 → 셰이커를 흔들고 → 술을 내준다.
// ponytail: 각자 화면에만 있는 바텐더. 남이 주문하는 모습은 안 보인다. 필요해지면 주문을 broadcast.
const BAR_Z = -4.95, BAR_STEP = 0.5;
box(9, BAR_STEP, 1.1, 0x6e4428, -1.5, BAR_STEP / 2, -5.25);   // 바텐더가 올라서는 발판 (카운터에 가려지지 않게)
const bartender = makeAvatar(3, -1.5, BAR_Z);   // 턱시도
setTag(bartender, '바텐더', '');
bartender.position.y = BAR_STEP;
bartender.userData.p.BowTie.visible = true;
const barTarget = new THREE.Vector3(-1.5, 0, BAR_Z);
let order = null;   // { serveUntil }
function orderBeer() {
  if (order) return;
  order = { serveUntil: 0 };
  barTarget.x = Math.max(-5.4, Math.min(2.4, me.position.x));   // 손님 맞은편으로
  say(bartender, '네, 금방 드릴게요!');
}
function tendBar(dt, t) {
  const moving = walk(bartender, barTarget, 3 * dt, false);
  if (!moving) bartender.rotation.y = 0;   // 서 있을 땐 손님 쪽을 본다
  if (order && !moving) {
    const u = bartender.userData;
    if (!order.serveUntil) { order.serveUntil = t + 1.6; u.act = 'serve'; u.actAt = t; }
    else if (t > order.serveUntil) {
      order = null;
      u.act = 'idle';
      say(bartender, '맛있게 드세요 🍺');
      setAct('beer');
    }
  }
  pose(bartender, moving, t);
  placeBubble(bartender, t);
}
function showHud() { hud.textContent = `📍 ${myRoom.name} · ` + (online ? `접속 ${online}명` : '혼자 모드'); }

// ── 다른 사람들 ──────────────────────────────────────
const others = new Map();   // id → { mesh, target }

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// 입장 연출: 로딩 화면의 문이 열리고 → 3D 벽장 문이 열리고 → 고양이가 걸어 나오고 → 카메라가 뒤로 빠진다.
let introAt = Infinity;   // 연출 시작 시각. 그 전에는 문이 닫혀 있고 카메라도 멈춰 있다.
function enter() {
  const intro = document.getElementById('intro');
  if (startAt) { introAt = -100; Object.assign(cam, camGoal); return intro.remove(); }   // 확인용 ?at= 은 연출 생략
  introAt = now();
  intro.classList.add('open');
  setTimeout(() => intro.classList.add('done'), 800);
  setTimeout(() => intro.remove(), 1500);
  setTimeout(() => { if (me.userData.seat < 0 && !keyWalking) target.set(CLOSET.x, 0, -3); }, 1900);
}
setTimeout(enter, Math.max(300, 1400 - performance.now()));   // 로딩 애니메이션이 너무 순식간에 지나가지 않게

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1), t = now();
  applyKeys();
  const moving = walk(me, target, SPEED * (me.userData.act === 'drunk' ? 0.5 : myRoom?.id === 'track' ? 1.6 : 1) * dt, true);   // 취하면 느릿느릿, 트랙에서는 달린다
  if (!moving) target.copy(me.position);   // 벽에 막히면 거기서 멈춤
  const settle = Math.min(1, dt * 12);     // 단을 오르내릴 때 부드럽게
  me.position.y += (floorY(me.position.x, me.position.z) - me.position.y) * settle;
  pose(me, moving, t);
  refreshRoom();
  tendBar(dt, t);
  // 남은 조금 더 빠르게 따라가게 해서 10Hz 사이를 메운다
  for (const o of others.values()) {
    pose(o.mesh, walk(o.mesh, o.target, SPEED * 2 * dt, false), t);
    o.mesh.position.y += (floorY(o.mesh.position.x, o.mesh.position.z) - o.mesh.position.y) * settle;
  }
  const open = 1.9 * smoothstep(t - introAt, 0.9, 1.8);   // 벽장 문
  closetDoors[0].rotation.y = -open;
  closetDoors[1].rotation.y = open;
  const ease = t < introAt ? 0 : Math.min(1, dt * (t - introAt < 5 ? 1.4 : 10));   // 입장할 때는 천천히 뒤로 빠진다
  for (const k in cam) cam[k] += (camGoal[k] - cam[k]) * ease;
  const flat = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(me.position.x + Math.sin(cam.yaw) * flat, me.position.y + Math.sin(cam.pitch) * cam.dist, me.position.z + Math.cos(cam.yaw) * flat);
  camera.lookAt(me.position.x, me.position.y + 0.8, me.position.z);
  placeBubble(me, t);
  placeSpots();
  for (const o of others.values()) placeBubble(o.mesh, t);
  burn(dt, t);
  moveFlights(dt);
  renderer.render(scene, camera);
});

// ── 멀티플레이 (Supabase Realtime) ───────────────────
if (supabase) {
  try {
    await supabase.realtime.setAuth();   // 로그인한 회원 자격으로 접속 (비공개 채널은 회원만 통과)
    const channel = supabase.channel('lounge', { config: { private: true, presence: { key: myId } } });
    let live = false, sent = null;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      for (const id of Object.keys(state)) {
        if (id === myId) continue;
        const s = state[id].at(-1) ?? {};
        if (!others.has(id)) {
          const mesh = makeAvatar(validCat(s.cat), CLOSET.x, CLOSET.z);
          others.set(id, { mesh, target: new THREE.Vector3(CLOSET.x, 0, -3) });
        }
        // 남이 보낸 동작·자리는 아는 값일 때만 받는다
        const o = others.get(id), u = o.mesh.userData, act = ACTS.includes(s.act) ? s.act : 'idle';
        if (u.act !== act) { u.act = act; u.actAt = now(); }
        u.seat = Number.isInteger(s.seat) && SEATS[s.seat] ? s.seat : -1;
        if (u.cat !== validCat(s.cat)) applyCoat(o.mesh, validCat(s.cat));   // 외형을 바꾼 사람
        setTag(o.mesh, typeof s.nick === 'string' ? s.nick.slice(0, 20) : '', typeof s.status === 'string' ? s.status.slice(0, 30) : '');
        if (u.seat >= 0) o.target.set(SEATS[u.seat].x, 0, SEATS[u.seat].z);
      }
      for (const [id, o] of others) {
        if (id in state) continue;
        removeAvatar(o.mesh);
        others.delete(id);
      }
      online = Object.keys(state).length;
      showHud();
    });
    channel.on('presence', { event: 'join' }, () => { sent = null; });   // 새로 온 사람에게 내 위치 다시 보내기
    channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const o = others.get(payload?.id);
      const p = clampPos(payload?.x, payload?.z);
      if (o && p && o.mesh.userData.seat < 0) o.target.set(p.x, 0, p.z);
    });
    // ponytail: 방 구분은 받는 쪽에서 거른다(같은 채널). 진짜 비공개가 필요하면 방마다 채널을 나눌 것.
    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      const o = others.get(payload?.id);
      if (o && payload.room === myRoom?.id && typeof payload.text === 'string') say(o.mesh, (o.mesh.userData.nick ? o.mesh.userData.nick + ': ' : '') + payload.text.slice(0, 200));
    });
    net.state = () => { if (live) channel.track({ room: myRoom?.id, cat: myCat, act: me.userData.act, seat: me.userData.seat, nick: member.nickname, status: me.userData.status }); };
    net.chat = (text) => { if (live) channel.send({ type: 'broadcast', event: 'chat', payload: { id: myId, room: myRoom.id, text } }); };
    channel.subscribe((status) => {
      live = status === 'SUBSCRIBED';
      if (live) net.state();
      else { online = 0; showHud(); }
    });

    // ponytail: 위치를 누구나 속여 보낼 수 있음(서버 검증 없음). 판정이 필요해지면 권위 서버로.
    setInterval(() => {
      const { x, z } = me.position;
      if (!live || (sent && sent.x === x && sent.z === z)) return;
      sent = { x, z };
      channel.send({ type: 'broadcast', event: 'pos', payload: { id: myId, x, z } });
    }, 100);
  } catch (err) {
    console.error(err);
  }
}
}
