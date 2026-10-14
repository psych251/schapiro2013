// Generate the 15 abstract stimuli used by experiment.js (stimuli/stim-01.svg ... stim-15.svg).
//
//   node scripts/make-stimuli.js
//
// Stand-ins for the ArtMatic Pro images of Schapiro et al. (2013), Experiment 2, which are
// not distributed with the paper. Each image is a seeded random composition of overlapping
// blobs, rings and strokes, deliberately asymmetric so that a 90-degree rotation is visible
// (the rotation-detection cover task depends on that). The seed is fixed, so rerunning the
// script reproduces the same files. To use different images, drop 15 files with the same
// names into stimuli/ (any format the browser shows; update STIMULI in experiment.js if the
// extension changes).
const fs = require("fs");
const path = require("path");

const N = 15;
const SIZE = 300;
const outDir = path.join(__dirname, "..", "stimuli");

// mulberry32: small seeded PRNG so the set is reproducible.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeImage(i) {
  const r = rng(251 * 1000 + i);
  const between = (a, b) => a + (b - a) * r();
  const hue0 = (i * 360) / N + between(-10, 10); // spread base hues across the set
  const col = (dh, s, l, a = 1) => `hsla(${(hue0 + dh + 360) % 360},${s}%,${l}%,${a})`;
  const parts = [];

  parts.push(`<defs>
    <radialGradient id="bg" cx="${between(0.15, 0.4)}" cy="${between(0.15, 0.4)}" r="1">
      <stop offset="0" stop-color="${col(0, 60, 85)}"/>
      <stop offset="1" stop-color="${col(between(30, 90), 55, 30)}"/>
    </radialGradient></defs>`);
  parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>`);

  // Smooth closed blobs.
  const nBlobs = 3 + Math.floor(r() * 3);
  for (let b = 0; b < nBlobs; b++) {
    const cx = between(50, 250), cy = between(50, 250), rad = between(25, 85);
    const k = 5 + Math.floor(r() * 4);
    const pts = [];
    for (let j = 0; j < k; j++) {
      const ang = (j / k) * Math.PI * 2;
      const rr = rad * between(0.55, 1.3);
      pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
    }
    let d = `M ${((pts[0][0] + pts[k - 1][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[k - 1][1]) / 2).toFixed(1)}`;
    for (let j = 0; j < k; j++) {
      const p = pts[j], q = pts[(j + 1) % k];
      d += ` Q ${p[0].toFixed(1)} ${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)} ${((p[1] + q[1]) / 2).toFixed(1)}`;
    }
    parts.push(`<path d="${d} Z" fill="${col(between(-120, 120), between(40, 90), between(25, 75), between(0.55, 0.9))}"/>`);
  }

  // Concentric rings, off-centre.
  const rx = between(40, 260), ry = between(40, 260);
  const nRings = 2 + Math.floor(r() * 4);
  for (let k = nRings; k > 0; k--) {
    parts.push(`<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="${(k * between(8, 16)).toFixed(1)}" fill="none" stroke="${col(between(150, 210), 70, between(20, 80), 0.85)}" stroke-width="${between(2, 6).toFixed(1)}"/>`);
  }

  // Sweeping strokes that give each image a clear "up".
  const nStrokes = 2 + Math.floor(r() * 3);
  for (let s = 0; s < nStrokes; s++) {
    const x0 = between(0, 120), y0 = between(150, 300), x1 = between(180, 300), y1 = between(0, 150);
    parts.push(`<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} C ${between(0, 300).toFixed(1)} ${between(0, 300).toFixed(1)}, ${between(0, 300).toFixed(1)} ${between(0, 300).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${col(between(-60, 60), 80, between(15, 90), 0.9)}" stroke-width="${between(4, 14).toFixed(1)}" stroke-linecap="round"/>`);
  }

  // A small bright accent in one corner region.
  parts.push(`<ellipse cx="${between(20, 110).toFixed(1)}" cy="${between(20, 110).toFixed(1)}" rx="${between(10, 28).toFixed(1)}" ry="${between(6, 16).toFixed(1)}" fill="${col(180, 90, 92, 0.95)}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">\n${parts.join("\n")}\n</svg>\n`;
}

fs.mkdirSync(outDir, { recursive: true });
for (let i = 1; i <= N; i++) {
  const name = `stim-${String(i).padStart(2, "0")}.svg`;
  fs.writeFileSync(path.join(outDir, name), makeImage(i));
}
console.log(`Wrote ${N} stimuli to ${outDir}`);
