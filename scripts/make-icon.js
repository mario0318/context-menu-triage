// Production app icon for Context Menu Triage — dependency-free PNG renderer.
// Concept: a blue app tile showing "keep" (check) and "block" (X) with a cursor,
// i.e. triaging context-menu entries by clicking. Transparent background, crisp
// geometry, 3x3 supersampled anti-aliasing.
const zlib = require('zlib');
const fs = require('fs');

const S = 1024;
const out = Buffer.alloc(S * S * 4);

// ---- geometry helpers (all operate in 1024-space) ----
function rr(x, y, x0, y0, x1, y1, rad) {
  let cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  let cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if ((x < x0 + rad || x > x1 - rad) && (y < y0 + rad || y > y1 - rad)) {
    return Math.hypot(x - cx, y - cy) <= rad;
  }
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}
function seg(x, y, ax, ay, bx, by, hw) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx, py = ay + t * dy;
  return Math.hypot(x - px, y - py) <= hw;
}
function poly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function polyline(x, y, pts, hw) {
  for (let i = 0; i < pts.length - 1; i++) if (seg(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], hw)) return true;
  return false;
}

// cursor arrow polygon (tip near origin, pointing up-left), then transformed
const CURSOR_LOCAL = [[0,0],[0,300],[86,232],[150,368],[210,342],[146,212],[236,150]];
function xform(pts, s, tx, ty) { return pts.map(p => [p[0]*s+tx, p[1]*s+ty]); }
const cursor = xform(CURSOR_LOCAL, 1.02, 232, 250);
const cursorEdge = xform(CURSOR_LOCAL, 1.16, 232 - 18, 250 - 20);

// marks
const CHECK = [[452,430],[532,512],[690,336]];
const X1a=[492,600],X1b=[648,756],X2a=[648,600],X2b=[492,756];

function over(dst, r, g, b, a) {
  const na = a, ba = dst[3];
  const oa = na + ba * (1 - na);
  if (oa <= 0) { dst[0]=dst[1]=dst[2]=dst[3]=0; return; }
  dst[0] = (r*na + dst[0]*ba*(1-na)) / oa;
  dst[1] = (g*na + dst[1]*ba*(1-na)) / oa;
  dst[2] = (b*na + dst[2]*ba*(1-na)) / oa;
  dst[3] = oa;
}
function sample(x, y, dst) {
  dst[0]=dst[1]=dst[2]=dst[3]=0;
  // 1) tile with vertical gradient
  if (rr(x, y, 92, 92, 932, 932, 210)) {
    const t = (y - 92) / 840;
    over(dst, 47 + (27-47)*t, 107 + (79-107)*t, 237 + (208-237)*t, 1);
  }
  // 2) check (white) — only meaningful atop tile
  if (polyline(x, y, CHECK, 40)) over(dst, 255, 255, 255, 1);
  // 3) X (soft white, slightly translucent to read as the "block" pair)
  if (seg(x,y,X1a[0],X1a[1],X1b[0],X1b[1],34) || seg(x,y,X2a[0],X2a[1],X2b[0],X2b[1],34))
    over(dst, 255, 255, 255, 0.92);
  // 4) cursor edge (dark halo) then white body
  if (poly(x, y, cursorEdge)) over(dst, 12, 34, 78, 0.9);
  if (poly(x, y, cursor)) over(dst, 255, 255, 255, 1);
}

const acc = [0,0,0,0], tmp = [0,0,0,0];
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    acc[0]=acc[1]=acc[2]=acc[3]=0;
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
      sample(x + (sx+0.5)/3, y + (sy+0.5)/3, tmp);
      acc[0]+=tmp[0]*tmp[3]; acc[1]+=tmp[1]*tmp[3]; acc[2]+=tmp[2]*tmp[3]; acc[3]+=tmp[3];
    }
    const i = (y*S+x)*4;
    const a = acc[3] / 9;
    out[i]   = a>0 ? Math.round(acc[0]/acc[3]) : 0;
    out[i+1] = a>0 ? Math.round(acc[1]/acc[3]) : 0;
    out[i+2] = a>0 ? Math.round(acc[2]/acc[3]) : 0;
    out[i+3] = Math.round(a*255);
  }
}

// ---- PNG encode ----
const T=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
const crc=b=>{let c=~0;for(let i=0;i<b.length;i++)c=T[(c^b[i])&0xff]^(c>>>8);return ~c>>>0;};
const chunk=(ty,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const b=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(b),0);return Buffer.concat([l,b,c]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(S,0);ih.writeUInt32BE(S,4);ih[8]=8;ih[9]=6;
const raw=Buffer.alloc(S*(S*4+1));
for(let y=0;y<S;y++){raw[y*(S*4+1)]=0;out.copy(raw,y*(S*4+1)+1,y*S*4,y*S*4+S*4);}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
fs.writeFileSync(process.argv[2], png);
console.log('wrote', process.argv[2], png.length, 'bytes');
