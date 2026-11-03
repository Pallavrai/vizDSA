import * as THREE from 'three';

const COLS = 26;
const ROWS = 14;
const SIZE = 1;
const GAP = 0.09;

// A DP table filling itself in: each column's height comes from the two cells before it, like real DP.
export function startHeroScene(host: HTMLElement, reducedMotion: boolean): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(11, 22, 22);
  camera.lookAt(4, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(8, 20, 10);
  scene.add(light);

  const count = COLS * ROWS;
  const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(SIZE - GAP, 1, SIZE - GAP), material, count);
  scene.add(mesh);

  const heights = new Float32Array(count);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const up = r > 0 ? heights[(r - 1) * COLS + c] : 1;
      const left = c > 0 ? heights[r * COLS + c - 1] : 1;
      heights[r * COLS + c] = Math.min(4.2, 0.35 + (up + left) * 0.13);
    }
  }

  const base = new THREE.Color(0x171c25);
  const write = new THREE.Color(0x2dd4bf);
  const read = new THREE.Color(0xf5b83d);
  const done = new THREE.Color(0x1e4a4a);
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();

  const draw = (front: number) => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        const age = front - i;
        const grown = Math.min(1, Math.max(0, age / 8));
        const eased = 1 - (1 - grown) ** 3;
        const h = 0.08 + eased * heights[i];
        matrix.makeScale(1, h, 1);
        matrix.setPosition((c - COLS / 2) * SIZE, h / 2, (r - ROWS / 2) * SIZE);
        mesh.setMatrixAt(i, matrix);
        if (age < 0) color.copy(base);
        else if (age < 6) color.copy(write);
        else color.copy(done);
        const frontCell = Math.floor(front);
        if (i === frontCell - 1 || i === frontCell - COLS) color.copy(read);
        mesh.setColorAt(i, color);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = host;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  if (reducedMotion) {
    draw(count + 10);
    resize();
    return () => {
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }

  let raf = 0;
  const started = performance.now();
  const cycle = count + 90;
  const tick = (now: number) => {
    draw(((now - started) / 55) % cycle);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  resize();
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
