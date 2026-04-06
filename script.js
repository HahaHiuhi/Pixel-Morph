const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const SIZE = 256;

img1.addEventListener('change', async () => {
  const img = await loadImage(img1.files[0]);
  if (img1.files[0]) {
    const img = await loadImage(img1.files[0]);
    name1.textContent = img1.files[0].name.slice(0, 18);
    label1.classList.add('chosen');
    ctx.drawImage(img, 0, 0, SIZE, SIZE)
    }
});

img2.addEventListener('change', () => {
    if (img2.files[0]) {
      name2.textContent = img2.files[0].name.slice(0, 18);
      label2.classList.add('chosen');
    }
  });
// ===== LOAD IMAGE =====
function loadImage(file, source) {
  return new Promise(res => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {

      res(img);
    };
  });
}

// ===== GET IMAGE DATA =====
function getImageData(img) {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const cctx = c.getContext("2d");

  cctx.drawImage(img, 0, 0, SIZE, SIZE);
  return cctx.getImageData(0, 0, SIZE, SIZE).data;
}

// ===== SMOOTHSTEP =====
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// ===== MAIN =====
document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  canvas.scrollIntoView({ behavior: "smooth", block: "center" });
  const f1 = img1.files[0];
  const f2 = img2.files[0];

  const im1 = await loadImage(f1, true);
  const im2 = await loadImage(f2, false);

  const data1 = getImageData(im1);
  const data2 = getImageData(im2);

  const N = SIZE * SIZE;

  // ===== COORDS =====
  const coords = new Array(N);
  for (let i = 0; i < N; i++) {
    const y = Math.floor(i / SIZE);
    const x = i % SIZE;
    coords[i] = [y, x];
  }

  // ===== Source PIXELS =====
const SourcePixels = new Array(N);
for (let i = 0; i < N; i++) {
  const idx = i * 4;
  SourcePixels[i] = [data1[idx], data1[idx+1], data1[idx+2]];
}

// ===== Target WEIGHT =====
const TargetWeight = new Array(N);
for (let i = 0; i < N; i++) {
  const idx = i * 4;
  TargetWeight[i] = (data2[idx] + data2[idx+1] + data2[idx+2]) / 3;
}

// ===== SORT =====
const srcOrder = [...Array(N).keys()].sort(
  (a,b) => (
    (SourcePixels[a][0]+SourcePixels[a][1]+SourcePixels[a][2]) -
    (SourcePixels[b][0]+SourcePixels[b][1]+SourcePixels[b][2])
  )
);

const tgtOrder = [...Array(N).keys()].sort(
  (a,b) => TargetWeight[b] - TargetWeight[a]
);

const startPos = srcOrder.map(i => coords[i]);
const endPos = tgtOrder.map(i => coords[i]);
const colors = srcOrder.map(i => SourcePixels[i]);

// ===== Target MASK =====
const TargetMask = tgtOrder.map(i => TargetWeight[i] > 127.5);

const TargetIdx = [];
const bgIdx = [];

TargetMask.forEach((v,i) => {
  if(v) TargetIdx.push(i);
  else bgIdx.push(i);
});

  
  // ===== ANIMATION =====
  const TOTAL = 1000;


function easeInOutQuart(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2, 4)/2;
}

function easeInOutCubic(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
}

function draw(frame) {
  const imgData = ctx.createImageData(SIZE, SIZE);
  const out = imgData.data;

  for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
    out[i] = 8; out[i+1] = 8; out[i+2] = 22; out[i+3] = 255;
  }

  for (let i = 0; i < N; i++) {
    const brightness = (colors[i][0] + colors[i][1] + colors[i][2]) / 765;
    const delay = brightness * 0.3;
    const localT = Math.min(1, Math.max(0, (frame / TOTAL - delay) / (1 - delay)));
    const t = easeInOutCubic(localT);

    const [y0, x0] = startPos[i];
    const [y1, x1] = endPos[i];
    const y = y0 * (1-t) + y1 * t;
    const x = x0 * (1-t) + x1 * t;
    const xi = Math.floor(x);
    const yi = Math.floor(y);

    if (xi < 0 || xi >= SIZE || yi < 0 || yi >= SIZE) continue;

    const idx = (yi * SIZE + xi) * 4;
    if (colors[i][0] + colors[i][1] + colors[i][2] > out[idx] + out[idx+1] + out[idx+2]) {
      out[idx]   = colors[i][0];
      out[idx+1] = colors[i][1];
      out[idx+2] = colors[i][2];
      out[idx+3] = 255;
    }
  }

  // build the correct final frame: each color placed at its endPos
  const blend = easeInOutCubic(Math.max(0, (frame / TOTAL - 0.75) / 0.25));
  if (blend > 0) {
    const final = new Uint8ClampedArray(SIZE * SIZE * 4).fill(0);
    for (let i = 0; i < N; i++) {
      const [y1, x1] = endPos[i];
      const idx = (Math.floor(y1) * SIZE + Math.floor(x1)) * 4;
      final[idx]   = colors[i][0];
      final[idx+1] = colors[i][1];
      final[idx+2] = colors[i][2];
      final[idx+3] = 255;
    }
    for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
      out[i]   = Math.round(out[i]   * (1 - blend) + final[i]   * blend);
      out[i+1] = Math.round(out[i+1] * (1 - blend) + final[i+1] * blend);
      out[i+2] = Math.round(out[i+2] * (1 - blend) + final[i+2] * blend);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}
let frame = 0;
function animate() {
  draw(frame);
  frame++;
  if (frame <= TOTAL) requestAnimationFrame(animate);
}

animate();
});