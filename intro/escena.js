// La Trampa del Mono — escena 3D de la intro.
// Un jugador de golf camina sin fin por el fairway del 15; la cámara va adelante, en diagonal,
// caminando para atrás. Todo sale del tiempo que manda HyperFrames (evento hf-seek): nada de relojes ni azar suelto.
import * as THREE from "three";

const CUE = window.CUES;
const W = 1920;
const H = 1080;

// ---------- utilidades deterministas ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (u) => u * u * (3 - 2 * u);
const ramp = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : smooth(clamp((t - a) / (b - a))));
const bump = (t, a, b) => (t < a || t > b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
const EASE = {
  lin: (u) => u,
  in: (u) => u * u * u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  back: (u) => {
    const c1 = 1.9;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  },
  step: (u) => (u < 1 ? 0 : 1),
};
const mix = (a, b, k) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], k)) : lerp(a, b, k));
// claves: [[t, valor, ease?], ...] — el ease es el del tramo que llega a esa clave
function kf(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (t <= k1[0]) {
      const k0 = keys[i - 1];
      const u = (t - k0[0]) / Math.max(1e-6, k1[0] - k0[0]);
      return mix(k0[1], k1[1], EASE[k1[2] || "io"](clamp(u)));
    }
  }
  return keys[keys.length - 1][1];
}
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const ruido = (t, s) => Math.sin(t * 1.31 + s) * 0.5 + Math.sin(t * 2.71 + s * 1.7) * 0.3 + Math.sin(t * 5.13 + s * 2.3) * 0.2;
const col = (hex) => new THREE.Color(hex);
const mixCol = (a, b, k) => a.clone().lerp(b, clamp(k));

// ---------- paleta SDGA ----------
const SDGA = {
  green950: "#0c2b1c",
  green900: "#14402a",
  green700: "#1c5638",
  green500: "#2e7d4f",
  green300: "#6fae87",
  cream: "#f4eeda",
  gold: "#e8c34a",
  goldDark: "#c9a22e",
};

// ---------- render ----------
const canvas = document.getElementById("escena");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, W / H, 0.08, 420);
scene.add(camera);
scene.fog = new THREE.Fog(0xdfe3c4, 30, 190);

// sombreado en bandas, como afiche pintado
const toonRamp = (() => {
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();
const toon = (hex, extra = {}) => new THREE.MeshToonMaterial({ color: col(hex), gradientMap: toonRamp, ...extra });

// ---------- luces ----------
const hemi = new THREE.HemisphereLight(0xfff6dc, 0x3d6b3a, 1.6);
scene.add(hemi);
const sol = new THREE.DirectionalLight(0xffe6b0, 2.4);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = -14;
sol.shadow.camera.right = 14;
sol.shadow.camera.top = 14;
sol.shadow.camera.bottom = -14;
sol.shadow.camera.near = 1;
sol.shadow.camera.far = 80;
sol.shadow.bias = -0.0006;
sol.shadow.normalBias = 0.02;
scene.add(sol, sol.target);
const contra = new THREE.DirectionalLight(0xe8c34a, 0); // contraluz dorado de atrás
scene.add(contra, contra.target);
const relleno = new THREE.PointLight(0xf4eeda, 0, 14, 1.4); // luz del camarógrafo
camera.add(relleno);
relleno.position.set(0.4, 0.3, 0.5);

// ---------- cielo ----------
const cielo = new THREE.Mesh(
  new THREE.SphereGeometry(380, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      arriba: { value: col("#a9cfb9") },
      horizonte: { value: col("#f3e6bf") },
      abajo: { value: col("#dfe3c4") },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 arriba; uniform vec3 horizonte; uniform vec3 abajo; varying vec3 vP;
      void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(horizonte, arriba, pow(smoothstep(0.0, 0.55, y), 0.8)) : mix(horizonte, abajo, smoothstep(0.0, 0.08, -y));
      gl_FragColor = vec4(c, 1.0); }`,
  }),
);
cielo.renderOrder = -10;
scene.add(cielo);

// ---------- suelo: rough, primer corte y fairway con franjas de corte ----------
function texturaFranjas() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "#5aa463";
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = "#4b9556";
  g.fillRect(0, 128, 64, 128);
  // textura de pasto: puntitos con azar sembrado
  for (let i = 0; i < 1400; i++) {
    const x = hash(i, 1) * 64;
    const y = hash(i, 2) * 256;
    g.fillStyle = hash(i, 3) > 0.5 ? "rgba(255,255,230,0.07)" : "rgba(10,40,20,0.08)";
    g.fillRect(x, y, 1, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function texturaRough() {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "#2f6b3c";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const x = hash(i, 11) * 256;
    const y = hash(i, 12) * 256;
    const r = hash(i, 13);
    g.fillStyle = r > 0.6 ? "rgba(120,170,90,0.18)" : r > 0.3 ? "rgba(12,43,28,0.22)" : "rgba(60,110,60,0.25)";
    g.fillRect(x, y, 1 + (r > 0.85 ? 1 : 0), 2 + Math.floor(r * 3));
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
const LARGO = 420;
const texRough = texturaRough();
texRough.repeat.set(LARGO / 7, LARGO / 7);
const texFranjas = texturaFranjas();
texFranjas.repeat.set(1, LARGO / 8);
const sueloMat = (opts) => new THREE.MeshLambertMaterial(opts);
const rough = new THREE.Mesh(new THREE.PlaneGeometry(LARGO, LARGO), sueloMat({ map: texRough }));
rough.rotation.x = -Math.PI / 2;
rough.receiveShadow = true;
const corte = new THREE.Mesh(new THREE.PlaneGeometry(1, LARGO), sueloMat({ color: col("#3f8a4c"), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
corte.rotation.x = -Math.PI / 2;
corte.receiveShadow = true;
const fairway = new THREE.Mesh(new THREE.PlaneGeometry(1, LARGO), sueloMat({ map: texFranjas, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
fairway.rotation.x = -Math.PI / 2;
fairway.receiveShadow = true;
scene.add(rough, corte, fairway);

// ---------- árboles (instanciados, reciclados por "casillero" a lo largo del camino) ----------
const SEP = 3.4; // metros entre casilleros
const FILAS = 3;
const MAX_ARB = 460;
const geoTronco = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0);
const geoCono = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
const geoCopa = new THREE.IcosahedronGeometry(1, 1);
const matArbol = (hex) => toon(hex, { flatShading: true });
const troncos = new THREE.InstancedMesh(geoTronco, matArbol("#ffffff"), MAX_ARB);
const conos = new THREE.InstancedMesh(geoCono, matArbol("#ffffff"), MAX_ARB * 3);
const copas = new THREE.InstancedMesh(geoCopa, matArbol("#ffffff"), MAX_ARB * 3);
for (const m of [troncos, conos, copas]) {
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
}
const PINOS = ["#1c5638", "#14402a", "#24603f", "#1a4d33"].map(col);
const FRONDAS = ["#2e7d4f", "#3b7f45", "#4a8a47", "#2f6e43"].map(col);
const TRONCOS = ["#5a3d28", "#4a3222", "#6b4a30"].map(col);

// ojos de mono en los árboles: esclerótica dorada que brilla, pupila y halo
const MAX_OJOS = 520;
const geoOjo = new THREE.SphereGeometry(1, 14, 10);
const ojos = new THREE.InstancedMesh(geoOjo, new THREE.MeshBasicMaterial({ color: col(SDGA.gold), fog: false }), MAX_OJOS);
const pupilas = new THREE.InstancedMesh(geoOjo, new THREE.MeshBasicMaterial({ color: col("#0b0d08"), fog: false }), MAX_OJOS);
const halos = new THREE.InstancedMesh(
  geoOjo,
  new THREE.MeshBasicMaterial({ color: col("#ffd860"), fog: false, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }),
  MAX_OJOS,
);
for (const m of [ojos, pupilas, halos]) {
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
}

// ---------- materiales del jugador ----------
const M = {
  piel: toon("#e2a77f"),
  chomba: toon(SDGA.cream),
  pantalon: toon("#8c8466"),
  zapato: toon("#f7f5ee"),
  suela: toon("#2b2b2b"),
  boina: toon(SDGA.green700),
  parche: toon(SDGA.cream),
  pelo: toon("#3a2a1f"),
  ojoBlanco: new THREE.MeshBasicMaterial({ color: col("#fbfaf4") }),
  negro: new THREE.MeshBasicMaterial({ color: col("#141414") }),
  ceja: toon("#3a2a1f"),
  boca: new THREE.MeshBasicMaterial({ color: col("#5b2a22") }),
  bolsa: toon(SDGA.green900),
  oro: toon(SDGA.gold),
  palo: toon("#c9ccd1"),
  guante: toon("#ffffff"),
  fundaRoja: toon("#bc4b3c"),
  fundaVerde: toon(SDGA.green300),
};

function capsula(r, largo, mat, abajo = true) {
  const g = new THREE.CapsuleGeometry(r, largo, 4, 10);
  if (abajo) g.translate(0, -largo / 2 - r * 0.2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}
function esfera(r, mat, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
function caja(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

// ---------- el jugador (mira a +Z en su espacio local) ----------
function crearJugador() {
  const root = new THREE.Group();
  const cadera = new THREE.Group();
  cadera.position.y = 0.98;
  root.add(cadera);
  const pelvis = esfera(0.16, M.pantalon, 1.02, 0.62, 0.8);
  pelvis.position.y = 0.03;
  cadera.add(pelvis);

  const piernas = [];
  for (const lado of [-1, 1]) {
    const muslo = new THREE.Group();
    muslo.position.set(0.105 * lado, -0.02, 0);
    cadera.add(muslo);
    muslo.add(capsula(0.078, 0.36, M.pantalon));
    const rodilla = new THREE.Group();
    rodilla.position.y = -0.45;
    muslo.add(rodilla);
    rodilla.add(capsula(0.064, 0.36, M.pantalon));
    const tobillo = new THREE.Group();
    tobillo.position.y = -0.45;
    rodilla.add(tobillo);
    const zapato = caja(0.11, 0.075, 0.27, M.zapato);
    zapato.position.set(0, -0.035, 0.055);
    const suela = caja(0.115, 0.022, 0.275, M.suela);
    suela.position.set(0, -0.08, 0.055);
    tobillo.add(zapato, suela);
    piernas.push({ muslo, rodilla, tobillo });
  }

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  cadera.add(torso);
  const pecho = capsula(0.165, 0.3, M.chomba, false);
  pecho.scale.set(1.28, 1, 0.78);
  pecho.position.y = 0.3;
  torso.add(pecho);
  const cuello = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 14), M.chomba);
  cuello.rotation.x = Math.PI / 2;
  cuello.position.y = 0.55;
  torso.add(cuello);
  // correa de la bolsa cruzada sobre el pecho
  const correa = caja(0.05, 0.62, 0.02, M.bolsa);
  correa.position.set(0.0, 0.3, 0.135);
  correa.rotation.z = 0.62;
  torso.add(correa);

  const nuca = new THREE.Group();
  nuca.position.y = 0.58;
  torso.add(nuca);
  const cuelloPiel = capsula(0.05, 0.06, M.piel, false);
  cuelloPiel.position.y = 0.03;
  nuca.add(cuelloPiel);
  const cabeza = new THREE.Group();
  cabeza.position.y = 0.08;
  nuca.add(cabeza);
  const craneo = esfera(0.13, M.piel, 0.95, 1.06, 1);
  craneo.position.y = 0.12;
  cabeza.add(craneo);
  const pelo = esfera(0.133, M.pelo, 0.97, 0.9, 1);
  pelo.position.set(0, 0.13, -0.022);
  cabeza.add(pelo);
  for (const lado of [-1, 1]) {
    const oreja = esfera(0.03, M.piel, 0.6, 1, 0.9);
    oreja.position.set(0.123 * lado, 0.11, -0.005);
    cabeza.add(oreja);
  }
  const nariz = esfera(0.025, M.piel, 0.9, 1, 1.2);
  nariz.position.set(0, 0.1, 0.13);
  cabeza.add(nariz);
  const ojosJ = [];
  const cejas = [];
  for (const lado of [-1, 1]) {
    const ojo = new THREE.Group();
    ojo.position.set(0.047 * lado, 0.135, 0.118);
    cabeza.add(ojo);
    const blanco = new THREE.Mesh(new THREE.SphereGeometry(0.027, 14, 10), M.ojoBlanco);
    blanco.scale.set(1, 1.1, 0.8);
    ojo.add(blanco);
    const pupila = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 10, 8), M.negro);
    pupila.position.z = 0.02;
    ojo.add(pupila);
    ojosJ.push({ ojo, blanco, pupila, lado });
    const ceja = caja(0.05, 0.012, 0.012, M.ceja);
    ceja.position.set(0.05 * lado, 0.183, 0.118);
    cabeza.add(ceja);
    cejas.push({ ceja, lado });
  }
  const boca = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), M.boca);
  boca.scale.set(1.3, 0.45, 0.5);
  boca.position.set(0, 0.052, 0.122);
  cabeza.add(boca);
  // la Boina Verde: gorra plana toda verde con el SDGA crema bordado al frente
  const boina = new THREE.Group();
  boina.position.set(0, 0.19, 0.012);
  boina.rotation.x = 0.12;
  cabeza.add(boina);
  const copaBoina = esfera(0.145, M.boina, 1.04, 0.5, 1.13);
  copaBoina.position.set(0, 0.02, 0.0);
  boina.add(copaBoina);
  const visera = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.014, 20, 1, false, -Math.PI / 2, Math.PI), M.boina);
  visera.scale.set(1.05, 1, 0.75);
  visera.position.set(0, -0.025, 0.12);
  visera.rotation.x = 0.16;
  visera.castShadow = true;
  boina.add(visera);
  const parche = caja(0.075, 0.018, 0.01, M.parche);
  parche.position.set(0, 0.005, 0.158);
  parche.rotation.x = -0.35;
  boina.add(parche);

  const brazos = [];
  for (const lado of [-1, 1]) {
    const hombro = new THREE.Group();
    hombro.position.set(0.215 * lado, 0.49, 0);
    torso.add(hombro);
    const manga = capsula(0.072, 0.1, M.chomba);
    hombro.add(manga);
    const brazo = capsula(0.053, 0.2, M.piel);
    brazo.position.y = -0.04;
    hombro.add(brazo);
    const codo = new THREE.Group();
    codo.position.y = -0.29;
    hombro.add(codo);
    codo.add(capsula(0.047, 0.2, M.piel));
    const mano = esfera(0.052, lado < 0 ? M.guante : M.piel, 0.85, 1.1, 0.9);
    mano.position.y = -0.29;
    codo.add(mano);
    brazos.push({ hombro, codo, lado });
  }

  // bolsa de golf en la espalda, cruzada, con palos y fundas
  const bolsa = new THREE.Group();
  bolsa.position.set(0.04, 0.02, -0.26);
  bolsa.rotation.set(0.12, 0, -0.45);
  torso.add(bolsa);
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.115, 0.92, 14), M.bolsa);
  tubo.castShadow = true;
  bolsa.add(tubo);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 16), M.oro);
  aro.rotation.x = Math.PI / 2;
  aro.position.y = 0.45;
  bolsa.add(aro);
  const franja = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.128, 0.08, 14), M.oro);
  franja.position.y = 0.05;
  bolsa.add(franja);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 14), M.suela);
  base.position.y = -0.47;
  bolsa.add(base);
  const fundas = [M.bolsa, M.fundaVerde, M.palo, M.boina];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 5), M.palo);
    palo.position.set(Math.cos(a) * 0.06, 0.52, Math.sin(a) * 0.06);
    bolsa.add(palo);
    const funda = esfera(0.05, fundas[i], 1, 1.3, 1);
    funda.position.set(Math.cos(a) * 0.065, 0.62 + (i % 2) * 0.04, Math.sin(a) * 0.065);
    bolsa.add(funda);
    const pompon = esfera(0.022, fundas[(i + 1) % 4]);
    pompon.position.set(funda.position.x, funda.position.y + 0.075, funda.position.z);
    bolsa.add(pompon);
  }
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { root, cadera, piernas, torso, nuca, cabeza, ojosJ, cejas, boca, brazos, bolsa };
}
const J = crearJugador();
scene.add(J.root);

// ---------- monos ----------
const MM = {
  pelaje: toon("#5a3a24"),
  cara: toon("#d9b48a"),
  ojo: new THREE.MeshBasicMaterial({ color: col(SDGA.gold), fog: false }),
  pupila: new THREE.MeshBasicMaterial({ color: col("#0b0d08"), fog: false }),
};
function crearMono() {
  const g = new THREE.Group();
  const cuerpo = esfera(0.28, MM.pelaje, 0.9, 1.15, 0.85);
  cuerpo.position.y = 0.42;
  g.add(cuerpo);
  const panza = esfera(0.2, MM.cara, 0.8, 1, 0.5);
  panza.position.set(0, 0.4, 0.13);
  g.add(panza);
  const cabeza = new THREE.Group();
  cabeza.position.y = 0.82;
  g.add(cabeza);
  cabeza.add(esfera(0.2, MM.pelaje));
  const cara = esfera(0.15, MM.cara, 1.1, 0.95, 0.6);
  cara.position.set(0, -0.02, 0.11);
  cabeza.add(cara);
  const hocico = esfera(0.08, MM.cara, 1.3, 0.8, 0.9);
  hocico.position.set(0, -0.08, 0.17);
  cabeza.add(hocico);
  for (const lado of [-1, 1]) {
    const oreja = esfera(0.075, MM.cara, 0.5, 1, 1);
    oreja.position.set(0.2 * lado, 0.02, 0);
    cabeza.add(oreja);
    const ojo = esfera(0.038, MM.ojo, 1, 1.1, 0.7);
    ojo.position.set(0.06 * lado, 0.03, 0.19);
    cabeza.add(ojo);
    const p = esfera(0.018, MM.pupila);
    p.position.set(0.06 * lado, 0.03, 0.215);
    cabeza.add(p);
  }
  const miembros = [];
  for (const [x, y, largo] of [
    [-0.24, 0.6, 0.36],
    [0.24, 0.6, 0.36],
    [-0.13, 0.22, 0.26],
    [0.13, 0.22, 0.26],
  ]) {
    const j = new THREE.Group();
    j.position.set(x, y, 0);
    j.add(capsula(0.055, largo, MM.pelaje));
    g.add(j);
    miembros.push(j);
  }
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.3, -0.2),
    new THREE.Vector3(0, 0.2, -0.5),
    new THREE.Vector3(0, 0.55, -0.75),
    new THREE.Vector3(0, 0.85, -0.62),
    new THREE.Vector3(0, 0.78, -0.45),
  ]);
  const cola = new THREE.Mesh(new THREE.TubeGeometry(curva, 24, 0.03, 6, false), MM.pelaje);
  cola.castShadow = true;
  g.add(cola);
  g.traverse((o) => {
    if (o.isMesh && o.material !== MM.ojo && o.material !== MM.pupila) o.castShadow = true;
  });
  return { g, cabeza, miembros, cola };
}
const monos = [crearMono(), crearMono(), crearMono()];
for (const m of monos) {
  m.g.rotation.order = "YXZ";
  scene.add(m.g);
}
const colgado = crearMono(); // el que cae cabeza abajo en el susto
camera.add(colgado.g);
const liana = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3, 5).translate(0, -1.5, 0), MM.pelaje);
colgado.g.add(liana);

// ---------- la pelota que se pierde en el cielo ----------
const pelota = esfera(0.1, new THREE.MeshBasicMaterial({ color: col("#ffffff"), fog: false }));
pelota.castShadow = false;
scene.add(pelota);
const estela = new THREE.InstancedMesh(
  new THREE.SphereGeometry(1, 8, 6),
  new THREE.MeshBasicMaterial({ color: col("#fffbe8"), transparent: true, opacity: 0.35, fog: false, depthWrite: false }),
  18,
);
estela.frustumCulled = false;
scene.add(estela);

// ---------- cartel del hoyo 15 y marcas de salida ----------
const cartel = new THREE.Group();
scene.add(cartel);
let texCartel = null;
function armarCartel() {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 640;
  const g = cv.getContext("2d");
  g.fillStyle = SDGA.cream;
  g.fillRect(0, 0, 512, 640);
  g.strokeStyle = SDGA.green900;
  g.lineWidth = 14;
  g.strokeRect(22, 22, 468, 596);
  g.fillStyle = SDGA.green900;
  g.textAlign = "center";
  g.font = "400 74px Anton";
  g.fillText("HOYO", 256, 128);
  g.font = "400 300px Anton";
  g.fillText("15", 256, 432);
  g.fillStyle = SDGA.gold;
  g.fillRect(48, 470, 416, 92);
  g.fillStyle = SDGA.green900;
  g.font = "400 56px Anton";
  g.fillText("PAR 4 · 352 YD", 256, 537);
  texCartel = new THREE.CanvasTexture(cv);
  texCartel.colorSpace = THREE.SRGBColorSpace;
  texCartel.anisotropy = 8;
  const placa = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.02, 0.06), [
    toon("#6b4a30"),
    toon("#6b4a30"),
    toon("#6b4a30"),
    toon("#6b4a30"),
    new THREE.MeshToonMaterial({ map: texCartel, gradientMap: toonRamp }),
    new THREE.MeshToonMaterial({ map: texCartel, gradientMap: toonRamp }),
  ]);
  placa.position.y = 1.55;
  placa.castShadow = true;
  const poste = caja(0.1, 1.2, 0.1, toon("#5a3d28"));
  poste.position.y = 0.6;
  cartel.add(placa, poste);
  // marcas blancas del tee del 15 (el del dibujo de Rorro)
  for (const x of [1.2, 4.6]) {
    const marca = caja(0.22, 0.2, 0.22, toon("#ffffff"));
    marca.position.set(x, 0.1, -1.6);
    cartel.add(marca);
  }
  const tee = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), sueloMat({ color: col("#6db574"), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  tee.rotation.x = -Math.PI / 2;
  tee.position.set(2.9, 0.0, -1.2);
  tee.receiveShadow = true;
  cartel.add(tee);
}

// ---------- marcha: cadencia en compases (un ciclo de pasos por compás, pisa en el 1 y el 3) ----------
const CAL = 1 / CUE.COMPAS; // ciclos por segundo caminando tranquilo
const RAP = 2 / CUE.COMPAS; // asustado: un paso por negra
function cadencia(t) {
  return kf(
    [
      [0, CAL],
      [CUE.frena, CAL],
      [CUE.quieto, 0, "out"],
      [CUE.drop + 0.42, 0, "step"],
      [CUE.drop + 0.9, RAP, "out"],
      [CUE.gira, RAP],
      [CUE.gira + 0.7, 0.35 * CAL],
      [CUE.cara - 0.3, 0.35 * CAL],
      [CUE.cara + 0.2, 0],
      [CUE.logo, 0, "step"],
      [CUE.logo + 0.01, CAL, "step"],
      [99, CAL],
    ],
    t,
  );
}
function zancada(t) {
  return kf(
    [
      [0, 1.5],
      [CUE.drop, 1.5],
      [CUE.drop + 0.9, 1.12],
      [CUE.logo, 1.12],
      [CUE.logo + 0.01, 1.5, "step"],
    ],
    t,
  );
}
// integración fija (se arma una sola vez): fase de la marcha y distancia recorrida
const PASO = 1 / 600;
const N = Math.ceil((CUE.FIN + 2) / PASO);
const FASE = new Float32Array(N + 1);
const DIST = new Float32Array(N + 1);
for (let i = 1; i <= N; i++) {
  const t = (i - 0.5) * PASO;
  const f = cadencia(t);
  FASE[i] = FASE[i - 1] + f * PASO;
  DIST[i] = DIST[i - 1] + f * zancada(t) * PASO;
}
const tabla = (arr, t) => {
  const x = clamp(t / PASO, 0, N);
  const i = Math.floor(x);
  const k = x - i;
  return i >= N ? arr[N] : arr[i] * (1 - k) + arr[i + 1] * k;
};
// el talón izquierdo pisa en los tiempos fuertes
const FASE0 = 0.25 - (CUE.C0 * CAL) % 1;
const faseEn = (t) => (tabla(FASE, t) + FASE0) * Math.PI * 2;
const distEn = (t) => tabla(DIST, t);

// ---------- curvas de la historia ----------
const tension = (t) =>
  t < CUE.drop ? lerp(0, 0.42, ramp(t, CUE.cambia, CUE.miran + 2)) + 0.12 * ramp(t, CUE.frena, CUE.hueco) : t < CUE.logo ? 1 : 0.88;
const miedo = (t) => (t < CUE.drop ? 0.35 * ramp(t, CUE.miran - 1, CUE.miran + 2) + 0.4 * ramp(t, CUE.frena, CUE.hueco) : t < CUE.logo ? 1 : 0);
const anchoFairway = (t) =>
  t < CUE.drop ? lerp(10, 8, ramp(t, CUE.cambia, CUE.frena)) - 0.8 * ramp(t, CUE.frena, CUE.hueco) : t < CUE.logo ? lerp(6.2, 5.6, ramp(t, CUE.drop, CUE.cara)) : 6.4;
const inclinacion = (t) => (t < CUE.drop ? 0.05 * ramp(t, CUE.miran, CUE.hueco) : t < CUE.logo ? 0.15 + 0.05 * ramp(t, CUE.drop, CUE.cara) : 0.1);
// apertura de ojos: unos pocos antes del drop, todos de golpe en el drop
function aperturaOjo(t, h1, h2, h3) {
  let abre;
  const MIRAN = CUE.c(11) + B; // la palabra MIRAN
  if (h1 < 0.12) abre = MIRAN;
  else if (h1 < 0.45) abre = CUE.miran + Math.floor(h2 * 22) * B;
  else abre = CUE.drop + h2 * 0.35;
  if (h1 >= 0.45 && t >= CUE.logo) abre = CUE.logo + 0.4 + h2 * 0.9;
  let a = clamp((t - abre) / 0.13);
  if (t >= CUE.logo && t < CUE.logo + 0.35) a = 0; // en el corte cierran todos y vuelven a abrir
  if (t >= CUE.logo && h1 < 0.45) a = clamp((t - (CUE.logo + 0.35 + h2 * 0.3)) / 0.13);
  // parpadeos sembrados
  const per = 2.6 + h3 * 3.2;
  const ph = ((t + h2 * 7.1) % per) / per;
  const parp = ph < 0.05 ? 1 - Math.sin((ph / 0.05) * Math.PI) : 1;
  return a * parp;
}

// mirada del jugador (yaw relativo al cuerpo, pitch): sale de la letra — mira para todos lados
const B = CUE.COMPAS / 4; // una negra
function mirada(t) {
  if (t >= CUE.logo) return [0.05 * Math.sin(t * 0.9), -0.05];
  if (t >= CUE.cara) return [0, 0];
  if (t >= CUE.drop) {
    if (t < CUE.drop + 0.5) return [0, -0.45 * bump(t, CUE.drop, CUE.drop + 0.5)];
    if (t >= CUE.pelota - 0.1 && t < CUE.pelota + 1.4) {
      const u = clamp((t - CUE.pelota + 0.1) / 1.5);
      return [lerp(0.5, -0.9, EASE.io(u)), lerp(-0.1, -0.4, EASE.out(u))];
    }
    // ojeadas nerviosas cada media negra… cada dos negras, con azar sembrado
    const i = Math.floor((t - CUE.drop) / (2 * B));
    const u = ((t - CUE.drop) / (2 * B)) % 1;
    const y0 = (hash(i, 7) - 0.5) * 2.1;
    const y1 = (hash(i + 1, 7) - 0.5) * 2.1;
    const p0 = (hash(i, 8) - 0.6) * 0.6;
    const p1 = (hash(i + 1, 8) - 0.6) * 0.6;
    const k = EASE.out(clamp(u / 0.35));
    return [lerp(y0, y1, k), lerp(p0, p1, k)];
  }
  if (t >= CUE.vuelve) {
    // la previa del drop: cabeza de un lado al otro en cada negra
    const i = Math.floor((t - CUE.vuelve) / B);
    const u = ((t - CUE.vuelve) / B) % 1;
    const lado = i % 2 === 0 ? 1 : -1;
    return [lerp(-lado * 0.85, lado * 0.85, EASE.out(clamp(u / 0.4))), -0.08];
  }
  return kf(
    [
      [0, [0, 0]],
      [3.4, [0, 0]],
      [4.6, [0.15, -0.28]], // mira el cielo, tranquilo
      [6.2, [0.15, -0.28]],
      [7.2, [0, 0]],
      [CUE.cartel - 0.6, [0, 0]],
      [CUE.cartel + 0.4, [0.75, 0.05]], // mira el cartel del 15
      [CUE.cartel + 1.6, [0.75, 0.05]],
      [CUE.cambia + 0.5, [0, -0.15]], // se nubla: mira arriba
      [CUE.miran, [0, -0.1]],
      [CUE.miran + 0.35, [0.7, 0], "out"],
      [CUE.miran + 1.1, [0.7, 0]],
      [CUE.miran + 1.6, [-0.1, 0]],
      [15.9, [-0.1, 0]],
      [16.3, [-0.8, -0.05], "out"],
      [16.9, [-0.8, -0.05]],
      [17.5, [1.35, 0.0]], // por arriba del hombro
      [18.3, [1.35, 0.0]],
      [18.8, [0.2, 0]],
      [CUE.quieto, [0.95, -0.12]],
      [19.95, [0.95, -0.12]],
      [CUE.hueco - 0.05, [-0.95, -0.12]],
      [CUE.hueco, [-0.95, -0.12]],
    ],
    t,
  );
}

// ---------- planos de cámara (offset y punto de mira relativos al jugador) ----------
const PLANOS = [
  {
    hasta: CUE.drop,
    off: [
      [0, [1.15, 0.2, -2.5]],
      [CUE.C0, [1.25, 0.24, -2.9], "lin"],
      [4.4, [2.6, 1.5, -5.6], "io"], // grúa que sube y lo presenta
      [11.5, [2.45, 1.42, -5.1], "io"],
      [CUE.frena, [2.2, 1.3, -4.5], "io"],
      [CUE.hueco, [1.45, 1.5, -2.9], "io"], // se acerca en el silencio
      [CUE.drop, [1.3, 1.52, -2.55], "io"],
    ],
    mira: [
      [0, [0.15, 0.55, 1.2]],
      [CUE.C0, [0.15, 0.62, 1.2], "lin"],
      [4.4, [0.15, 1.05, 1.2], "io"],
      [11.5, [0.2, 1.08, 1.0], "io"],
      [CUE.frena, [0.05, 1.15, 0.8], "io"],
      [CUE.hueco, [-0.25, 1.38, 0.4], "io"],
      [CUE.drop, [-0.2, 1.42, 0.35], "io"],
    ],
    fov: [
      [0, 42],
      [4.4, 36],
      [CUE.hueco, 33],
      [CUE.drop, 32],
    ],
    roll: [
      [0, 0],
      [CUE.frena, 0],
      [CUE.hueco, 0.035],
    ],
  },
  {
    hasta: CUE.logo,
    off: [
      [CUE.drop, [1.9, 0.62, -3.5]], // corte en el drop: bajo y con dutch
      [CUE.gira, [2.3, 0.85, -4.3], "io"],
      [CUE.cara, [2.0, 1.15, -3.6], "io"],
      [CUE.logo, [0.85, 1.82, -1.8], "in"], // empuja hasta la cara
    ],
    mira: [
      [CUE.drop, [-0.45, 1.25, 1.4]],
      [CUE.gira, [-0.3, 1.15, 1.0], "io"],
      [CUE.cara, [-0.15, 1.45, 0.3], "io"],
      [CUE.logo, [-0.03, 1.74, 0.0], "in"],
    ],
    fov: [
      [CUE.drop, 44],
      [CUE.gira, 40],
      [CUE.cara, 36],
      [CUE.logo, 30, "in"],
    ],
    roll: [
      [CUE.drop, 0.09],
      [CUE.gira, -0.05],
      [CUE.cara, 0.03],
      [CUE.logo, 0.07],
    ],
  },
  {
    hasta: 999,
    off: [
      [CUE.logo, [0.0, 7.2, -15.5]], // gran plano: el fairway infinito y el bosque mirando
      [CUE.FIN, [0.0, 8.6, -17.5], "lin"],
    ],
    mira: [
      [CUE.logo, [0, 0.6, 18]],
      [CUE.FIN, [0, 0.4, 18], "lin"],
    ],
    fov: [
      [CUE.logo, 40],
      [CUE.FIN, 38, "lin"],
    ],
    roll: [[CUE.logo, 0]],
  },
];

// ---------- armado de un cuadro ----------
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const CERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _base = new THREE.Matrix4();
const _baseOjo = new THREE.Matrix4();
const _q2 = new THREE.Quaternion();
const _cam = new THREE.Vector3();

function posarJugador(t) {
  const d = distEn(t);
  const fase = faseEn(t);
  const f = miedo(t);
  const vel = cadencia(t) / CAL;
  const amp = clamp(vel * 1.25);
  const rapido = clamp((vel - 1) * 1.2);
  J.root.position.set(0, 0, -d);

  // rumbo del cuerpo: mira a -Z; gira 360 en el compás 20; después enfrenta a cámara
  let rumbo = Math.PI;
  if (t >= CUE.gira && t < CUE.logo) {
    const u = clamp((t - CUE.gira) / (CUE.cara - CUE.gira));
    rumbo += EASE.io(u) * Math.PI * 2;
    if (t >= CUE.cara - 0.2) rumbo += -0.42 * ramp(t, CUE.cara - 0.2, CUE.cara + 0.5);
  }
  J.root.rotation.y = rumbo;

  // salto del susto en el drop
  const salto = bump(t, CUE.drop, CUE.drop + 0.38);
  J.root.position.y = 0.16 * salto;

  // piernas
  const agach = 0.1 * f + 0.12 * salto;
  J.piernas.forEach((pi, idx) => {
    const p = fase + (idx === 0 ? 0 : Math.PI);
    const muslo = amp * (0.42 + 0.1 * rapido) * Math.sin(p);
    const rod = amp * (0.08 + 1.05 * Math.pow(Math.max(0, Math.cos(p + 0.25)), 2)) + agach * 1.6;
    pi.muslo.rotation.x = -muslo - agach * 0.9;
    pi.muslo.rotation.z = idx === 0 ? 0.02 : -0.02;
    pi.rodilla.rotation.x = rod;
    pi.tobillo.rotation.x = -(-muslo + rod) * 0.55 + amp * 0.15 * Math.max(0, -Math.sin(p - 0.4)) - agach * 0.6;
  });
  // cadera: sube y baja dos veces por ciclo, se mece
  J.cadera.position.y = 0.98 - amp * 0.03 * (0.5 + 0.5 * Math.cos(2 * fase)) - agach * 0.11;
  J.cadera.position.x = amp * 0.022 * Math.sin(fase);
  J.cadera.rotation.y = amp * 0.12 * Math.sin(fase);
  J.cadera.rotation.z = amp * 0.04 * Math.sin(fase);
  // torso: se encorva con el miedo, contra-rota
  const temblor = f * 0.012 * Math.sin(t * 61) + f * 0.008 * Math.sin(t * 47 + 1);
  J.torso.rotation.x = 0.04 + 0.16 * f + 0.06 * rapido + 0.2 * salto * -1;
  J.torso.rotation.y = -amp * 0.16 * Math.sin(fase);
  J.torso.rotation.z = temblor;

  // brazos: balanceo opuesto a las piernas; con miedo, la derecha agarra la correa
  J.brazos.forEach((b) => {
    const p = fase + (b.lado < 0 ? 0 : Math.PI);
    const balanceo = amp * (0.42 + 0.15 * rapido) * Math.sin(p) * (1 - 0.55 * f);
    let hx = balanceo;
    let hz = b.lado * (0.1 + 0.06 * f);
    let cx = -(0.28 + 0.3 * Math.max(0, -Math.sin(p)) * amp) - 0.35 * f;
    if (b.lado > 0) {
      // agarra la correa a la altura del pecho
      const k = clamp(f * 1.4);
      hx = lerp(hx, -0.55, k);
      hz = lerp(hz, -0.32, k);
      cx = lerp(cx, -1.85, k);
    }
    hx += -1.2 * salto;
    hz += b.lado * 0.9 * salto;
    b.hombro.rotation.set(hx, 0, hz);
    b.hombro.position.y = 0.49 + 0.035 * f;
    b.codo.rotation.x = cx;
  });

  // cabeza
  let [yaw, pitch] = mirada(t);
  if (t >= CUE.cara && t < CUE.logo) {
    // a cámara: el yaw que lo deja mirando al lente
    const dirCam = Math.atan2(camera.position.x - J.root.position.x, camera.position.z - J.root.position.z);
    let rel = dirCam - J.root.rotation.y;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    yaw = lerp(yaw, clamp(rel, -1.3, 1.3), ramp(t, CUE.cara, CUE.cara + 0.35));
    pitch = lerp(pitch, -0.12, ramp(t, CUE.cara, CUE.cara + 0.35));
  }
  const tiemblaCabeza = f * 0.025 * Math.sin(t * 57);
  J.nuca.rotation.set(pitch * 0.35 - 0.08 * f, yaw * 0.35, 0);
  J.cabeza.rotation.set(pitch * 0.65 + 0.05 * f, yaw * 0.65 + tiemblaCabeza, tiemblaCabeza * 0.5);

  // cara: ojos que se mueven antes que la cabeza, cejas de preocupación, boca
  const anticipo = mirada(t + 0.12);
  const ox = clamp((anticipo[0] - yaw) * 0.6 + yaw * 0.12, -0.5, 0.5);
  const oy = clamp(-(anticipo[1] - pitch) * 0.5, -0.4, 0.4);
  const pupilaChica = 1 - 0.2 * f;
  const abiertos = 1 + 0.15 * f;
  for (const o of J.ojosJ) {
    o.pupila.position.set(ox * 0.016, oy * 0.014 - 0.004, 0.02);
    o.pupila.scale.setScalar(pupilaChica);
    o.blanco.scale.set(1, 1.1 * abiertos, 0.8);
  }
  for (const c of J.cejas) {
    c.ceja.rotation.z = -c.lado * (0.08 + 0.42 * f);
    c.ceja.position.y = 0.183 + 0.014 * f;
  }
  const grito = f * (0.6 + 0.4 * ramp(t, CUE.cara, CUE.cara + 0.3) * (t < CUE.logo ? 1 : 0));
  J.boca.scale.set(1.3 - 0.5 * grito, 0.45 + 1.1 * grito, 0.5);

  // la bolsa rebota
  J.bolsa.rotation.z = -0.45 + amp * 0.05 * Math.sin(2 * fase + 0.6);
  J.bolsa.rotation.x = 0.12 + amp * 0.04 * Math.cos(2 * fase);
  return { d, f };
}

function posarArboles(t, d, cabezaJ, mirarCamara) {
  const FW = anchoFairway(t);
  const lean = inclinacion(t);
  const kMin = Math.floor((d - 215) / SEP);
  const kMax = Math.ceil((d + 26) / SEP);
  let nT = 0;
  let nC = 0;
  let nB = 0;
  let nO = 0;
  const objetivo = mirarCamara ? _cam.copy(camera.position) : cabezaJ;
  for (const lado of [-1, 1]) {
    for (let fila = 0; fila < FILAS; fila++) {
      for (let k = kMin; k <= kMax; k++) {
        const sem = fila * 2 + (lado > 0 ? 1 : 0);
        const h1 = hash(k, sem, 1);
        if (fila === 0 && h1 < 0.07) continue;
        if (nT >= MAX_ARB) break;
        const pino = hash(k, sem, 2) < 0.6;
        const s = 0.82 + 0.5 * hash(k, sem, 3);
        const z = -k * SEP - (fila % 2) * SEP * 0.5 + (hash(k, sem, 5) - 0.5) * SEP * 0.7;
        const x = lado * (FW + 2.2 + fila * 3.7 + hash(k, sem, 4) * 2.0);
        const fase = hash(k, sem, 6) * 6.28;
        const meneo = 0.018 * Math.sin(t * 0.9 + fase) + 0.03 * inclinacion(t) * Math.sin(t * 2.2 + fase);
        _e.set(meneo * 0.6, hash(k, sem, 7) * 6.28, lado * (lean * (0.7 + 0.6 * hash(k, sem, 8))) * (fila === 0 ? 1 : 0.6) + meneo);
        _q.setFromEuler(_e);
        _p.set(x, 0, z);
        _s.set(1, 1, 1);
        const base = _base.compose(_p, _q, _s);
        _e.set(meneo * 0.6, 0, lado * (lean * (0.7 + 0.6 * hash(k, sem, 8))) * (fila === 0 ? 1 : 0.6) + meneo);
        const baseOjo = _baseOjo.compose(_p.set(x, 0, z), _q2.setFromEuler(_e), _s.set(1, 1, 1));
        const ci = Math.floor(hash(k, sem, 9) * 4);
        // tronco
        const altoTronco = pino ? 2.2 * s : 3.2 * s;
        _m2.makeScale(s * (pino ? 1 : 1.2), altoTronco, s * (pino ? 1 : 1.2));
        _m.multiplyMatrices(base, _m2);
        troncos.setMatrixAt(nT, _m);
        troncos.setColorAt(nT, TRONCOS[ci % 3]);
        nT++;
        if (pino) {
          const niveles = [
            [1.5, 2.0, 4.0],
            [3.3, 1.6, 3.5],
            [5.0, 1.12, 3.0],
          ];
          for (const [y, r, alto] of niveles) {
            _m2.compose(_p.set(0, y * s, 0), _q.identity(), _s.set(r * s, alto * s, r * s));
            _m.multiplyMatrices(base, _m2);
            conos.setMatrixAt(nC, _m);
            conos.setColorAt(nC, PINOS[ci]);
            nC++;
          }
        } else {
          const blobs = [
            [0, 4.5, 0, 2.1],
            [0.9, 5.5, 0.4, 1.6],
            [-0.85, 5.25, -0.6, 1.55],
          ];
          for (const [bx, by, bz, r] of blobs) {
            _m2.compose(_p.set(bx * s, by * s, bz * s), _q.identity(), _s.set(r * s, r * s * 0.9, r * s));
            _m.multiplyMatrices(base, _m2);
            copas.setMatrixAt(nB, _m);
            copas.setColorAt(nB, FRONDAS[ci]);
            nB++;
          }
        }
        // ojos en las dos filas de adelante
        if (fila < 2 && nO < MAX_OJOS - 2) {
          const h = hash(k, sem, 10);
          if (h < 0.62) {
            const ab = aperturaOjo(t, hash(k, sem, 11), hash(k, sem, 12), hash(k, sem, 13));
            const r = (t < CUE.drop ? 0.16 : 0.13) * s;
            const yOjo = pino ? 2.05 * s : 3.5 * s;
            const radio = pino ? 1.86 * s : (Math.sqrt(Math.max(0, 2.1 * 2.1 - 1.0)) + 0.1) * s;
            for (const dz of [-1, 1]) {
              _v.set(-lado * radio, yOjo, dz * 0.19 * s).applyMatrix4(baseOjo);
              if (ab <= 0.001) {
                ojos.setMatrixAt(nO, CERO);
                pupilas.setMatrixAt(nO, CERO);
                halos.setMatrixAt(nO, CERO);
              } else {
                _m.compose(_v, _q.identity(), _s.set(r, r * 0.78 * ab, r));
                ojos.setMatrixAt(nO, _m);
                _m.compose(_v, _q.identity(), _s.set(r * 2.1, r * 1.8 * ab, r * 2.1));
                halos.setMatrixAt(nO, _m);
                _w.copy(objetivo).sub(_v).normalize().multiplyScalar(r * 0.62);
                _w.add(_v);
                _m.compose(_w, _q.identity(), _s.set(r * 0.52, r * 0.6 * ab, r * 0.52));
                pupilas.setMatrixAt(nO, _m);
              }
              nO++;
            }
          }
        }
      }
    }
  }
  troncos.count = nT;
  conos.count = nC;
  copas.count = nB;
  ojos.count = pupilas.count = halos.count = nO;
  for (const m of [troncos, conos, copas, ojos, pupilas, halos]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  return FW;
}

function posarMonos(t, d, FW) {
  // cruzan el fairway detrás del jugador, de pinos a pinos (como en el juego)
  const salidas = [CUE.monos - 0.4, CUE.monos + 0.45, CUE.monos + 1.2];
  monos.forEach((m, i) => {
    const t0 = salidas[i];
    const dur = 2.3;
    const u = (t - t0) / dur;
    if (t < CUE.drop || u < 0 || u > 1 || t >= CUE.logo) {
      m.g.visible = false;
      return;
    }
    m.g.visible = true;
    const zMundo = -distEn(t0) + 6.5 + i * 3.6;
    const sentido = i === 1 ? -1 : 1;
    const ancho = FW + 4;
    const x = sentido * lerp(-ancho, ancho, u);
    const saltos = 5;
    const y = 0.55 * Math.abs(Math.sin(u * saltos * Math.PI));
    m.g.position.set(x, y, zMundo);
    m.g.scale.setScalar(1.8);
    m.g.rotation.set(0.35, sentido > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    const p = u * saltos * Math.PI * 2;
    m.miembros.forEach((j, n) => {
      j.rotation.x = Math.sin(p + n * 1.6) * 0.9 - 0.4;
    });
    m.cabeza.rotation.y = Math.sin(p * 0.5) * 0.3 + (sentido > 0 ? -0.6 : 0.6); // mira al jugador al cruzar
  });
  // el colgado: baja cabeza abajo arriba a la derecha, pegado al lente
  const c = colgado;
  if (t >= CUE.susto && t < CUE.logo) {
    c.g.visible = true;
    const u = clamp((t - CUE.susto) / 0.28);
    const caida = EASE.back(u);
    const pendulo = Math.sin((t - CUE.susto) * 7.5) * 0.22 * Math.exp(-(t - CUE.susto) * 1.8);
    c.g.position.set(0.52, lerp(1.9, 0.84, caida), -1.75);
    c.g.scale.setScalar(0.82);
    c.g.rotation.set(0.1, 0.35, Math.PI + pendulo);
    c.miembros.forEach((j, n) => {
      j.rotation.x = -0.5 + Math.sin(t * 9 + n) * 0.25;
      j.rotation.z = (n % 2 ? 1 : -1) * 0.6;
    });
    c.cabeza.rotation.set(0.2, 0, Math.sin(t * 5) * 0.15);
  } else c.g.visible = false;
}

function posarPelota(t, d) {
  const t0 = CUE.pelota;
  const dur = 1.45;
  const u = (t - t0) / dur;
  if (u < 0 || u > 1 || t >= CUE.logo) {
    pelota.visible = false;
    estela.count = 0;
    return;
  }
  pelota.visible = true;
  const desde = new THREE.Vector3(3.2, 2.6, -distEn(t0) - 5);
  const hasta = new THREE.Vector3(-anchoFairway(t0) - 7, 7.5, -distEn(t0) + 48);
  const pos = (uu) => {
    const v = desde.clone().lerp(hasta, uu);
    v.y += Math.sin(uu * Math.PI) * 3.4;
    return v;
  };
  pelota.position.copy(pos(u));
  pelota.scale.setScalar(2.6 * (1 - 0.35 * u));
  let n = 0;
  for (let i = 1; i <= 18; i++) {
    const uu = u - i * 0.008;
    if (uu < 0) break;
    const s = 0.16 * (1 - i / 19) * (1 - 0.35 * uu);
    _m.compose(pos(uu), _q.identity(), _s.set(s, s, s));
    estela.setMatrixAt(n++, _m);
  }
  estela.count = n;
  estela.instanceMatrix.needsUpdate = true;
}

function camara(t, d) {
  const plano = PLANOS.find((p) => t < p.hasta) || PLANOS[PLANOS.length - 1];
  const off = kf(plano.off, t);
  const mira = kf(plano.mira, t);
  const tens = tension(t);
  // cámara en mano: el camarógrafo camina para atrás
  const fase = faseEn(t);
  const vel = cadencia(t) / CAL;
  const mano = 0.6 + 1.4 * tens;
  let sacudon = 0;
  if (t >= CUE.drop && t < CUE.logo) {
    const desdeCompas = (t - CUE.drop) % CUE.COMPAS;
    sacudon = Math.exp(-desdeCompas * 9) * 0.05;
  }
  if (t >= CUE.logo) sacudon = Math.exp(-(t - CUE.logo) * 7) * 0.12;
  const G = _p.set(0, 0, -d);
  const gx = G.x;
  const gz = G.z;
  camera.position.set(
    gx + off[0] + 0.03 * mano * ruido(t, 1) + sacudon * Math.sin(t * 83),
    off[1] + 0.02 * mano * ruido(t, 2) + 0.012 * vel * Math.cos(2 * fase) + sacudon * Math.sin(t * 71 + 1),
    gz + off[2] + 0.03 * mano * ruido(t, 3),
  );
  _v.set(gx + mira[0] + 0.02 * mano * ruido(t, 4), mira[1] + 0.015 * mano * ruido(t, 5), gz + mira[2]);
  camera.lookAt(_v);
  camera.rotateZ(kf(plano.roll, t) + 0.006 * mano * ruido(t, 6));
  camera.fov = kf(plano.fov, t);
  camera.updateProjectionMatrix();
}

// tres estados: día dorado, nublado (cambia la situación) y noche de monos
const C = {
  cieloArriba: [col("#a9cfb9"), col("#7f988c"), col("#05120b")],
  cieloHorizonte: [col("#f3e6bf"), col("#c4ccb4"), col("#24402a")],
  niebla: [col("#dfe3c4"), col("#aab7a0"), col("#0f2419")],
  hemiCielo: [col("#fff6dc"), col("#d6e2d2"), col("#4c7d63")],
  hemiSuelo: [col("#3d6b3a"), col("#2c5435"), col("#0c2b1c")],
  sol: [col("#ffe6b0"), col("#e4ecf0"), col("#a8c8ff")],
};
const tres = (arr, k) => (k < 0.45 ? mixCol(arr[0], arr[1], k / 0.45) : mixCol(arr[1], arr[2], (k - 0.45) / 0.55));
function ambiente(t, d) {
  const k = tension(t);
  const u = cielo.material.uniforms;
  u.arriba.value.copy(tres(C.cieloArriba, k));
  u.horizonte.value.copy(tres(C.cieloHorizonte, k));
  u.abajo.value.copy(tres(C.niebla, k));
  scene.fog.color.copy(tres(C.niebla, k));
  scene.fog.near = lerp(30, 9, k);
  scene.fog.far = lerp(200, 78, k);
  cielo.position.copy(camera.position);
  hemi.color.copy(tres(C.hemiCielo, k));
  hemi.groundColor.copy(tres(C.hemiSuelo, k));
  hemi.intensity = lerp(1.65, 0.55, k);
  sol.color.copy(tres(C.sol, k));
  sol.intensity = lerp(2.5, 0.42, k);
  const G = J.root.position;
  sol.position.set(G.x - 9, 13, G.z - 5);
  sol.target.position.set(G.x, 0, G.z + 2);
  contra.intensity = lerp(0, 1.9, k);
  contra.position.set(G.x + 2, 6, G.z + 9);
  contra.target.position.set(G.x, 1, G.z);
  relleno.intensity = lerp(0, 2.2, k) * (t < CUE.logo ? 1 : 0.4);
  // suelo que acompaña al jugador
  const FW = anchoFairway(t);
  const zc = G.z + LARGO / 2 - 40;
  rough.position.set(0, 0, zc);
  corte.position.set(0, 0.0, zc);
  fairway.position.set(0, 0.0, zc);
  corte.scale.x = FW * 2 + 1.6;
  fairway.scale.x = FW * 2;
  texRough.offset.set(0, (-zc * texRough.repeat.y) / LARGO);
  texFranjas.offset.set(0, (-zc * texFranjas.repeat.y) / LARGO);
  // el cartel del 15
  cartel.position.set(-2.8, 0, -distEn(CUE.cartel) - 1.5);
  cartel.rotation.y = 0.4;
  cartel.visible = t < CUE.drop;
  ojos.material.color.copy(mixCol(col("#d8b13c"), col(SDGA.gold), k));
  halos.material.opacity = 0.05 + 0.13 * k;
}

function renderAt(time) {
  const t = clamp(time, 0, CUE.FIN);
  const d = distEn(t);
  camara(t, d);
  posarJugador(t);
  ambiente(t, d);
  J.root.updateMatrixWorld(true);
  const cabezaJ = J.cabeza.getWorldPosition(new THREE.Vector3());
  const aCamara = (t >= CUE.cara && t < CUE.logo) || t >= CUE.mira;
  const FW = posarArboles(t, d, cabezaJ, aCamara);
  posarMonos(t, d, FW);
  posarPelota(t, d);
  renderer.render(scene, camera);
}

// ---------- arranque ----------
async function armar() {
  try {
    await document.fonts.load('400 100px "Anton"');
  } catch (e) {
    /* sin Anton el cartel igual se dibuja */
  }
  armarCartel();
  renderAt(window.__hfThreeTime || 0);
}
let ultimo = window.__hfThreeTime || 0;
window.__trampaRender = renderAt;
window.addEventListener("hf-seek", (ev) => {
  ultimo = ev.detail.time;
  renderAt(ultimo);
});
armar().then(() => {
  renderAt(ultimo);
  if (window.__resolverEscena) window.__resolverEscena();
});
