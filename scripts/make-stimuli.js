// Generate the 15 abstract stimuli used by experiment.js (stimuli/stim-01.svg ... stim-15.svg).
//
//   node scripts/make-stimuli.js
//
// Stand-ins for the ArtMatic Pro images of Schapiro et al. (2013), Experiment 2, which are
// not distributed with the paper. Like the originals (Fig. 1c) they are grayscale, circular
// and radially symmetric: a seeded random motif of petals, swirling strokes and dots is
// repeated n times around the centre (and, for some images, mirrored too), then clipped to a
// circle. Outside the circle is transparent, so a rotated image keeps the same outline.
//
// The rotation-detection cover task rotates images by 90 degrees, which leaves any pattern
// with 4- or 8-fold symmetry unchanged. For other orders a 90-degree turn looks like a turn of
// (90 mod 360/n) degrees: 90 for 2-fold, 30 for 3-fold and 6-fold, but only 18 for 5-fold and
// 13 for 7-fold, too subtle to spot in 1.5 s. The orders are therefore 2, 3 and 6 (five images
// each). Keep that in mind if you edit ORDERS. The seed is fixed, so rerunning the script reproduces the same files. To
// use different images, drop 15 files with the same names into stimuli/ (any format the
// browser shows; update STIMULI in experiment.js if the extension changes).
const fs = require("fs");
const path = require("path");

const N = 15;
const SIZE = 300;
const R = 148; // circle radius; the image is drawn in coordinates centred on (0, 0)
const ORDERS = [2, 3, 6];
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

const gray = (l, a = 1) => `hsla(0,0%,${l.toFixed(1)}%,${a.toFixed(2)})`;
const f = (x) => x.toFixed(1);
const polar = (rho, deg) => [rho * Math.cos((deg * Math.PI) / 180), rho * Math.sin((deg * Math.PI) / 180)];

function makeImage(i) {
  const r = rng(251 * 1000 + i);
  const between = (a, b) => a + (b - a) * r();
  const n = ORDERS[(i - 1) % ORDERS.length];
  const wedge = 360 / n;
  const mirrored = r() < 0.6; // dihedral (kaleidoscope) vs. purely rotational (pinwheel)
  const darkCentre = r() < 0.5;
  const motif = [];

  // Petals: ellipses pointing outward from the centre.
  const nPetals = 2 + Math.floor(r() * 3);
  for (let p = 0; p < nPetals; p++) {
    const rho = between(20, 120), ang = between(0, wedge), len = between(15, 55);
    const [x, y] = polar(rho, ang);
    motif.push(`<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(len)}" ry="${f(len * between(0.2, 0.55))}" transform="rotate(${f(ang + between(-35, 35))} ${f(x)} ${f(y)})" fill="${gray(between(0, 100), between(0.55, 0.9))}"/>`);
  }

  // Swirling strokes from near the centre out towards the rim.
  const nStrokes = 2 + Math.floor(r() * 3);
  for (let s = 0; s < nStrokes; s++) {
    const a0 = between(0, wedge), twist = between(-1.5, 1.5) * wedge;
    const p0 = polar(between(0, 40), a0), p1 = polar(between(40, 100), a0 + twist * 0.3);
    const p2 = polar(between(80, 140), a0 + twist * 0.7), p3 = polar(between(110, R + 10), a0 + twist);
    const dark = r() < 0.5;
    motif.push(`<path d="M ${f(p0[0])} ${f(p0[1])} C ${f(p1[0])} ${f(p1[1])}, ${f(p2[0])} ${f(p2[1])}, ${f(p3[0])} ${f(p3[1])}" fill="none" stroke="${gray(dark ? between(0, 20) : between(80, 100), 0.9)}" stroke-width="${f(between(2, 12))}" stroke-linecap="round"/>`);
  }

  // Dots.
  const nDots = 1 + Math.floor(r() * 3);
  for (let d = 0; d < nDots; d++) {
    const [x, y] = polar(between(30, 135), between(0, wedge));
    motif.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(between(3, 12))}" fill="${gray(r() < 0.5 ? between(0, 15) : between(85, 100), 0.95)}"/>`);
  }

  // Repeat the motif n times around the centre, plus mirror images if dihedral.
  const copies = [];
  for (let k = 0; k < n; k++) {
    copies.push(`<use href="#m${i}" transform="rotate(${f(k * wedge)})"/>`);
    if (mirrored) copies.push(`<use href="#m${i}" transform="rotate(${f(k * wedge)}) scale(1,-1)"/>`);
  }

  // Concentric rings, which are symmetric under any rotation.
  const rings = [];
  const nRings = Math.floor(r() * 3);
  for (let k = 0; k < nRings; k++) {
    rings.push(`<circle r="${f(between(10, R - 10))}" fill="none" stroke="${gray(r() < 0.5 ? between(0, 20) : between(80, 100), 0.8)}" stroke-width="${f(between(1.5, 5))}"/>`);
  }

  const c0 = darkCentre ? between(5, 25) : between(85, 100), c1 = darkCentre ? between(70, 90) : between(10, 35);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}">
<defs>
  <radialGradient id="bg${i}" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${gray(c0)}"/>
    <stop offset="1" stop-color="${gray(c1)}"/>
  </radialGradient>
  <clipPath id="disc${i}"><circle r="${R}"/></clipPath>
  <g id="m${i}">
${motif.join("\n")}
  </g>
</defs>
<g clip-path="url(#disc${i})">
<circle r="${R}" fill="url(#bg${i})"/>
${copies.join("\n")}
${rings.join("\n")}
</g>
<circle r="${R}" fill="none" stroke="${gray(30)}" stroke-width="1.5"/>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });
for (let i = 1; i <= N; i++) {
  const name = `stim-${String(i).padStart(2, "0")}.svg`;
  fs.writeFileSync(path.join(outDir, name), makeImage(i));
}
console.log(`Wrote ${N} stimuli to ${outDir}`);
