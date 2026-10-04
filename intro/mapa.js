// La Trampa del Mono — vuelo 3D sobre el dibujo de la cancha (presentación oficial, "en San Diego te espera…").
// El dibujo de Rorro (assets/cancha.webp, 1 unidad = 1 yarda) acostado en el piso; la cámara arranca arriba,
// baja al tee del 15, sigue la pelota hasta el green y vuelve a subir mientras se dibujan el 16 y el 17
// y se abren los ojos de los monos en los árboles. Todo sale del tiempo t (hf-seek), cuadro por cuadro.
import * as THREE from "three";
import { MAPA } from "./mapa-datos.js";

const P = window.PRESENTACION.mapa; // { desde, hasta }
const L = P.hasta - P.desde;
const canvas = document.getElementById("mapa");
const W = 1920;
const H = 1080;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FONDO = new THREE.Color("#0c2b1c");
scene.background = FONDO;
scene.fog = new THREE.Fog(FONDO, 260, 820);
const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 3000);

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

// ── el piso y el dibujo ──
const piso = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: "#102f20" }));
piso.rotation.x = -Math.PI / 2;
piso.position.set(MAPA.ancho / 2, -0.2, MAPA.alto / 2);
scene.add(piso);

const loader = new THREE.TextureLoader();
const tex = loader.load("assets/cancha.webp", () => avisar());
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
const dibujo = new THREE.Mesh(
  new THREE.PlaneGeometry(MAPA.ancho, MAPA.alto),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02 }),
);
dibujo.rotation.x = -Math.PI / 2;
dibujo.position.set(MAPA.ancho / 2, 0, MAPA.alto / 2);
scene.add(dibujo);

// mapa (x, y del dibujo) → mundo (x, altura, z)
const v3 = (p, h = 0) => new THREE.Vector3(p[0], h, p[1]);

// ── banderas ──
const banderas = MAPA.hoyos.map((h, i) => {
  const g = new THREE.Group();
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 11, 8), new THREE.MeshBasicMaterial({ color: "#f4eeda" }));
  palo.position.y = 5.5;
  const forma = new THREE.Shape();
  forma.moveTo(0, 0);
  forma.lineTo(5.2, -1.4);
  forma.lineTo(0, -2.8);
  forma.closePath();
  const tela = new THREE.Mesh(new THREE.ShapeGeometry(forma), new THREE.MeshBasicMaterial({ color: "#e8c34a", side: THREE.DoubleSide }));
  tela.position.set(0.2, 11, 0);
  const copa = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ color: "#081a10" }));
  copa.rotation.x = -Math.PI / 2;
  copa.position.y = 0.05;
  g.add(palo, tela, copa);
  g.position.copy(v3(h.pin));
  g.userData = { tela, i };
  scene.add(g);
  return g;
});

// ── las tres vueltas: la pelota vuela del tee al green por la calle ──
function ruta(h) {
  // del tee a la bandera pasando por la calle (dos golpes en los par 4, uno en el par 3)
  const piques = h.par === 3 ? [h.tee, h.pin] : [h.tee, h.calle[Math.min(h.calle.length - 1, 2)], h.pin];
  const pts = [];
  for (let k = 0; k < piques.length - 1; k++) {
    const a = piques[k];
    const b = piques[k + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const alto = Math.min(34, d * 0.16);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * u, 4 * alto * u * (1 - u) + 0.6, a[1] + (b[1] - a[1]) * u));
    }
  }
  return new THREE.CatmullRomCurve3(pts);
}
const rutas = MAPA.hoyos.map((h) => {
  const curva = ruta(h);
  const geo = new THREE.TubeGeometry(curva, 220, 0.38, 6, false);
  const mat = new THREE.MeshBasicMaterial({ color: "#f4eeda", transparent: true, opacity: 0.85 });
  const tubo = new THREE.Mesh(geo, mat);
  tubo.geometry.setDrawRange(0, 0);
  scene.add(tubo);
  return { curva, tubo, total: geo.index.count };
});
const pelota = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 14), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
scene.add(pelota);
const sombra = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.35 }));
sombra.rotation.x = -Math.PI / 2;
scene.add(sombra);

// ── los ojos en los árboles: un par de ojos de mono (los del logo) que mira siempre a la cámara ──
function texturaOjos() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  for (const cx of [64, 192]) {
    g.fillStyle = "#f4eeda";
    g.beginPath();
    g.ellipse(cx, 64, 46, 60, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8c34a";
    g.beginPath();
    g.ellipse(cx + 4, 70, 27, 31, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0c2b1c";
    g.beginPath();
    g.ellipse(cx + 4, 70, 17, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(cx + 12, 58, 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const N = MAPA.arboles.length;
const ojos = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(3.4, 1.7),
  new THREE.MeshBasicMaterial({ map: texturaOjos(), transparent: true, depthWrite: false, fog: false }),
  N,
);
ojos.frustumCulled = false;
scene.add(ojos);
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// ── la cámara: keyframes (tiempo dentro del vuelo, posición, a dónde mira, fov) ──
const h15 = MAPA.hoyos[0];
const CAM = [
  [0.0, [110, 360, 560], [110, 0, 215], 38],
  [1.45, [70, 46, 470], [52, 0, 330], 46],
  [2.75, [44, 40, 170], [36, 0, 60], 44],
  [3.55, [70, 120, 150], [80, 0, 190], 42],
  [L, [110, 300, 560], [110, 0, 220], 38],
];
function camaraEn(s) {
  let i = 0;
  while (i < CAM.length - 2 && s > CAM[i + 1][0]) i++;
  const [ta, pa, la, fa] = CAM[i];
  const [tb, pb, lb, fb] = CAM[i + 1];
  const u = ease(clamp((s - ta) / (tb - ta), 0, 1));
  const mix = (a, b) => a.map((v, k) => v + (b[k] - v) * u);
  return { pos: mix(pa, pb), mira: mix(la, lb), fov: fa + (fb - fa) * u };
}

// ── carteles de cada hoyo (HTML, ubicados con la proyección) ──
const carteles = MAPA.hoyos.map((h) => document.getElementById("mapa-h" + h.n));
// cuándo se dibuja cada vuelta (segundos dentro del vuelo) y cuándo aparece su cartel
const VUELTAS = [
  [1.25, 3.0],
  [3.05, 4.15],
  [3.55, 4.6],
];

function render(t) {
  const s = t - P.desde;
  if (s < -0.2 || s > L + 0.2) return;
  const c = camaraEn(clamp(s, 0, L));
  camera.position.set(...c.pos);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(new THREE.Vector3(...c.mira));

  // vueltas: el tubo crece detrás de la pelota
  let bola = null;
  rutas.forEach((r, i) => {
    const [a, b] = VUELTAS[i];
    const u = ease(ramp(s, a, b));
    r.tubo.geometry.setDrawRange(0, Math.floor(r.total * u / 3) * 3);
    if (u > 0 && u < 1) bola = r.curva.getPointAt(u);
  });
  if (!bola && s >= VUELTAS[0][1]) bola = v3(h15.pin, 0.6);
  pelota.visible = sombra.visible = !!bola;
  if (bola) {
    pelota.position.copy(bola);
    sombra.position.set(bola.x, 0.06, bola.z);
  }
  // banderas: la tela flamea
  banderas.forEach((g) => {
    g.userData.tela.rotation.y = Math.sin(t * 5 + g.userData.i) * 0.35;
  });

  // ojos: se abren de a uno (más hacia el final, "con su abrazo macabro") y parpadean
  const q = camera.quaternion;
  for (let i = 0; i < N; i++) {
    const [x, y, r] = MAPA.arboles[i];
    const abre = i % 2 ? 99 : 2.5 + r * 2.4; // la mitad de los árboles, y recién con "su abrazo macabro"
    let a = ease(ramp(s, abre, abre + 0.18));
    const parpadeo = (s * 0.9 + r * 7) % 2.6;
    if (parpadeo < 0.12) a *= Math.abs(parpadeo - 0.06) / 0.06;
    _p.set(x, 2.2, y);
    _s.set(1, Math.max(0.001, a), 1);
    _m.compose(_p, q, _s);
    ojos.setMatrixAt(i, _m);
  }
  ojos.instanceMatrix.needsUpdate = true;

  renderer.render(scene, camera);

  // carteles: arriba de cada bandera
  MAPA.hoyos.forEach((h, i) => {
    const el = carteles[i];
    if (!el) return;
    const p = v3(h.pin, 15).project(camera);
    const x = (p.x * 0.5 + 0.5) * W;
    const y = (-p.y * 0.5 + 0.5) * H;
    const ver = ramp(s, VUELTAS[i][1] - 0.15, VUELTAS[i][1] + 0.15);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${(0.6 + 0.4 * ver).toFixed(3)})`;
    el.style.opacity = p.z < 1 ? ver.toFixed(3) : "0";
  });
}

let ultimo = window.__hfThreeTime || 0;
window.addEventListener("hf-seek", (ev) => {
  ultimo = ev.detail.time;
  render(ultimo);
});
function avisar() {
  render(ultimo);
  if (window.__resolverMapa) window.__resolverMapa();
}
render(ultimo);
