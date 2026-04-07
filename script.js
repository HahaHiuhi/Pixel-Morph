"use strict";
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const SIZE = 512; // up from 256
const TOTAL = 1000;
// ===== UI =====
document.getElementById("img1").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file)
        return;
    const img = await loadImage(file);
    document.getElementById("name1").textContent = file.name.slice(0, 18);
    document.getElementById("label1").classList.add("chosen");
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
});
document.getElementById("img2").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file)
        return;
    document.getElementById("name2").textContent = file.name.slice(0, 18);
    document.getElementById("label2").classList.add("chosen");
});
// ===== LOAD IMAGE =====
function loadImage(file) {
    return new Promise((res) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
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
// ===== EASING =====
function easeInOutCubic(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function buildMorphData(data1, data2) {
    const N = SIZE * SIZE;
    const srcBrightness = new Float32Array(N);
    const tgtBrightness = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        const i4 = i * 4;
        srcBrightness[i] = data1[i4] + data1[i4 + 1] + data1[i4 + 2];
        tgtBrightness[i] = data2[i4] + data2[i4 + 1] + data2[i4 + 2];
    }
    const srcOrder = [...Array(N).keys()].sort((a, b) => srcBrightness[a] - srcBrightness[b]);
    const tgtOrder = [...Array(N).keys()].sort((a, b) => tgtBrightness[b] - tgtBrightness[a]);
    const startPos = new Float32Array(N * 2);
    const endPos = new Float32Array(N * 2);
    const colors = new Uint8ClampedArray(N * 3);
    for (let k = 0; k < N; k++) {
        const si = srcOrder[k];
        startPos[k * 2] = Math.floor(si / SIZE);
        startPos[k * 2 + 1] = si % SIZE;
        colors[k * 3] = data1[si * 4];
        colors[k * 3 + 1] = data1[si * 4 + 1];
        colors[k * 3 + 2] = data1[si * 4 + 2];
        const ti = tgtOrder[k];
        endPos[k * 2] = Math.floor(ti / SIZE);
        endPos[k * 2 + 1] = ti % SIZE;
    }
    // pre-build final buffer
    const finalBuffer = new Uint8ClampedArray(N * 4).fill(0);
    for (let k = 0; k < N; k++) {
        const idx = (endPos[k * 2] * SIZE + endPos[k * 2 + 1]) * 4;
        finalBuffer[idx] = colors[k * 3];
        finalBuffer[idx + 1] = colors[k * 3 + 1];
        finalBuffer[idx + 2] = colors[k * 3 + 2];
        finalBuffer[idx + 3] = 255;
    }
    return { startPos, endPos, colors, finalBuffer };
}
// ===== DRAW =====
function draw(frame, { startPos, endPos, colors, finalBuffer }) {
    const N = SIZE * SIZE;
    const imgData = ctx.createImageData(SIZE, SIZE);
    const out = imgData.data;
    for (let i = 0; i < N * 4; i += 4) {
        out[i] = 8;
        out[i + 1] = 8;
        out[i + 2] = 22;
        out[i + 3] = 255;
    }
    for (let i = 0; i < N; i++) {
        const r = colors[i * 3];
        const g = colors[i * 3 + 1];
        const b = colors[i * 3 + 2];
        const brightness = (r + g + b) / 765;
        const delay = brightness * 0.3;
        const localT = Math.min(1, Math.max(0, (frame / TOTAL - delay) / (1 - delay)));
        const t = easeInOutCubic(localT);
        const y0 = startPos[i * 2], x0 = startPos[i * 2 + 1];
        const y1 = endPos[i * 2], x1 = endPos[i * 2 + 1];
        const xi = Math.floor(x0 * (1 - t) + x1 * t);
        const yi = Math.floor(y0 * (1 - t) + y1 * t);
        if (xi < 0 || xi >= SIZE || yi < 0 || yi >= SIZE)
            continue;
        const idx = (yi * SIZE + xi) * 4;
        if (r + g + b > out[idx] + out[idx + 1] + out[idx + 2]) {
            out[idx] = r;
            out[idx + 1] = g;
            out[idx + 2] = b;
            out[idx + 3] = 255;
        }
    }
    const blend = easeInOutCubic(Math.max(0, (frame / TOTAL - 0.75) / 0.25));
    if (blend > 0) {
        for (let i = 0; i < N * 4; i += 4) {
            out[i] = Math.round(out[i] * (1 - blend) + finalBuffer[i] * blend);
            out[i + 1] = Math.round(out[i + 1] * (1 - blend) + finalBuffer[i + 1] * blend);
            out[i + 2] = Math.round(out[i + 2] * (1 - blend) + finalBuffer[i + 2] * blend);
        }
    }
    ctx.putImageData(imgData, 0, 0);
}
// ===== RECORD & DOWNLOAD =====
let recordedBlob = null;
function recordAnimation(morphData) {
    const chunks = [];
    const stream = canvas.captureStream(60);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
            ? "video/webm"
            : "video/mp4";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 40000000 });
    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0)
            chunks.push(e.data);
    };
    recorder.onstop = () => {
        recordedBlob = new Blob(chunks, { type: mimeType });
    };
    return recorder;
}
function downloadRecording() {
    if (!recordedBlob)
        return;
    const ext = recordedBlob.type.startsWith("video/mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-morph.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// ===== ANIMATE =====
function animate(frame, morphData, recorder) {
    return new Promise((resolve) => {
        function step(frame) {
            draw(frame, morphData);
            if (frame < TOTAL) {
                requestAnimationFrame(() => step(frame + 1));
            }
            else {
                recorder?.stop();
                resolve();
            }
        }
        step(frame);
    });
}
// ===== MAIN =====
document.getElementById("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    const f1 = document.getElementById("img1").files[0];
    const f2 = document.getElementById("img2").files[0];
    const [im1, im2] = await Promise.all([loadImage(f1), loadImage(f2)]);
    const morphData = buildMorphData(getImageData(im1), getImageData(im2));
    const recorder = recordAnimation(morphData);
    recorder.start();
    await animate(0, morphData, recorder);
    console.log("Animation complete");
    const downloadBtn = document.getElementById("downloadBtn");
    downloadBtn.style.display = "inline-block";
    downloadBtn.onclick = () => {
        downloadRecording();
    };
});
