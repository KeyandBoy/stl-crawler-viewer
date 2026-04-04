/**
 * generate-stl.mjs
 * 生成真实有效的二进制 STL 文件（建筑类）
 *
 * 用法：
 *   node scripts/generate-stl.mjs              # 生成全套
 *   node scripts/generate-stl.mjs --category 亭子  # 只生成亭子类
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../public/stl-models');
const CATEGORY = process.argv.find((a, i) => process.argv[i - 1] === '--category') || null;

// ─── 二进制 STL 写入 ────────────────────────────────────
function writeBinarySTL(filepath, triangles) {
  const numTriangles = triangles.length;
  const buf = Buffer.alloc(80 + 4 + numTriangles * 50);
  buf.fill(0);
  buf.writeUInt32LE(numTriangles, 80);
  let offset = 84;
  for (const tri of triangles) {
    buf.writeFloatLE(tri.n[0], offset); offset += 4;
    buf.writeFloatLE(tri.n[1], offset); offset += 4;
    buf.writeFloatLE(tri.n[2], offset); offset += 4;
    for (const v of [tri.v1, tri.v2, tri.v3]) {
      buf.writeFloatLE(v[0], offset); offset += 4;
      buf.writeFloatLE(v[1], offset); offset += 4;
      buf.writeFloatLE(v[2], offset); offset += 4;
    }
    buf.writeUInt16LE(0, offset); offset += 2;
  }
  fs.writeFileSync(filepath, buf);
  return fs.statSync(filepath).size;
}

function calcNormal(v1, v2, v3) {
  const ax = v2[0]-v1[0], ay = v2[1]-v1[1], az = v2[2]-v1[2];
  const bx = v3[0]-v1[0], by = v3[1]-v1[1], bz = v3[2]-v1[2];
  let nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx;
  const l = Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
  return [nx/l, ny/l, nz/l];
}

function quad(v1, v2, v3, v4) {
  const n = calcNormal(v1, v2, v3);
  return [{n, v1, v2, v3}, {n, v1: v3, v2: v4, v3: v1}];
}

function box(x1,y1,z1,x2,y2,z2) {
  return [
    ...quad([x1,y1,z1],[x2,y1,z1],[x2,y2,z1],[x1,y2,z1]), // 前
    ...quad([x2,y1,z2],[x1,y1,z2],[x1,y2,z2],[x2,y2,z2]), // 后
    ...quad([x1,y1,z2],[x1,y1,z1],[x1,y2,z1],[x1,y2,z2]), // 左
    ...quad([x2,y1,z1],[x2,y1,z2],[x2,y2,z2],[x2,y2,z1]), // 右
    ...quad([x1,y2,z1],[x2,y2,z1],[x2,y2,z2],[x1,y2,z2]), // 上
    ...quad([x1,y1,z2],[x2,y1,z2],[x2,y1,z1],[x1,y1,z1]), // 下
  ];
}

// ─── 模型生成器 ─────────────────────────────────────────

function hexPavilion() {
  const t = [];
  const hex=6, r=18, rr=28, h=10, rh=24;
  for(let i=0;i<hex;i++){
    const a1=(i/hex)*Math.PI*2, a2=((i+1)/hex)*Math.PI*2;
    t.push(...quad([r*Math.cos(a1),1,r*Math.sin(a1)],[r*Math.cos(a2),1,r*Math.sin(a2)],[r*Math.cos(a2),h,r*Math.sin(a2)],[r*Math.cos(a1),h,r*Math.sin(a1)]));
  }
  for(let i=0;i<hex;i++){
    const a1=(i/hex)*Math.PI*2, a2=((i+1)/hex)*Math.PI*2;
    t.push(...quad([rr*Math.cos(a1),h,rr*Math.sin(a1)],[rr*Math.cos(a2),h,rr*Math.sin(a2)],[0,rh,0],[0,rh,0]));
  }
  t.push(...quad([-rr-2,0,-rr-2],[rr+2,0,-rr-2],[rr+2,0,rr+2],[-rr-2,0,rr+2]));
  t.push(...box(-r*1.3-1,0,r*1.3-1,-r*1.3+1,1,r*1.3+1));
  t.push(...box(r*1.3-1,0,-r*1.3-1,r*1.3+1,1,-r*1.3+1));
  t.push(...box(-r*1.3-1,0,-r*1.3-1,-r*1.3+1,1,-r*1.3+1));
  t.push(...box(r*1.3-1,0,r*1.3-1,r*1.3+1,1,r*1.3+1));
  return t;
}

function octPavilion() {
  const t = [];
  const oct=8, r=16, rr=26, h=9, rh=22;
  for(let i=0;i<oct;i++){
    const a1=(i/oct)*Math.PI*2, a2=((i+1)/oct)*Math.PI*2;
    t.push(...quad([r*Math.cos(a1),0.5,r*Math.sin(a1)],[r*Math.cos(a2),0.5,r*Math.sin(a2)],[r*Math.cos(a2),h,r*Math.sin(a2)],[r*Math.cos(a1),h,r*Math.sin(a1)]));
    t.push(...quad([rr*Math.cos(a1),h,rr*Math.sin(a1)],[rr*Math.cos(a2),h,rr*Math.sin(a2)],[0,rh,0],[0,rh,0]));
  }
  t.push(...quad([-rr-1,0,-rr-1],[rr+1,0,-rr-1],[rr+1,0,rr+1],[-rr-1,0,rr+1]));
  return t;
}

function squarePavilion() {
  const t = [];
  const s=20, h=10, rh=26;
  for(const [x1,z1,x2,z2] of [[-s,-s,s,-s],[s,-s,s,s],[s,s,-s,s],[-s,s,-s,-s]]){
    t.push(...quad([x1,0.5,z1],[x2,0.5,z2],[x2,h,z2],[x1,h,z1]));
  }
  const corners=[[-s*1.3,h,-s*1.3],[s*1.3,h,-s*1.3],[s*1.3,h,s*1.3],[-s*1.3,h,s*1.3]];
  for(let i=0;i<4;i++) t.push(...quad(corners[i],corners[(i+1)%4],[0,rh,0],[0,rh,0]));
  t.push(...quad([-s*1.5,0,-s*1.5],[s*1.5,0,-s*1.5],[s*1.5,0,s*1.5],[-s*1.5,0,s*1.5]));
  return t;
}

function roundPavilion() {
  const t = [];
  const segs=16, r=18, rr=28, h=10, rh=24;
  for(let i=0;i<segs;i++){
    const a1=(i/segs)*Math.PI*2, a2=((i+1)/segs)*Math.PI*2;
    t.push(...quad([r*Math.cos(a1),0.5,r*Math.sin(a1)],[r*Math.cos(a2),0.5,r*Math.sin(a2)],[r*Math.cos(a2),h,r*Math.sin(a2)],[r*Math.cos(a1),h,r*Math.sin(a1)]));
    t.push(...quad([rr*Math.cos(a1),h,rr*Math.sin(a1)],[rr*Math.cos(a2),h,rr*Math.sin(a2)],[0,rh,0],[0,rh,0]));
  }
  t.push(...quad([-rr-1,0,-rr-1],[rr+1,0,-rr-1],[rr+1,0,rr+1],[-rr-1,0,rr+1]));
  return t;
}

function corridor() {
  const t = [];
  const L=60, W=8, H=4;
  for(let i=0;i<8;i++){
    const x1=-L/2+i*10, x2=x1+2;
    t.push(...quad([x1,0,-W/2],[x2,0,-W/2],[x2,H,-W/2],[x1,H,-W/2]));
    t.push(...quad([x1,0,W/2],[x2,0,W/2],[x2,H,W/2],[x1,H,W/2]));
    t.push(...quad([x1,H,-W/2],[x2,H,-W/2],[x2,H+1,W/2],[x1,H+1,W/2]));
  }
  t.push(...quad([-L/2-1,0,-W/2-1],[L/2+1,0,-W/2-1],[L/2+1,0,W/2+1],[-L/2-1,0,W/2+1]));
  t.push(...quad([-L/2-1,H,-W/2-1],[L/2+1,H,-W/2-1],[L/2+1,H+1,W/2+1],[-L/2-1,H+1,W/2+1]));
  return t;
}

function pagoda(floors=5) {
  const t = [];
  const br0=22, baseY=0;
  for(let f=0;f<floors;f++){
    const br=br0-f*3, tr=br+5, fy=f*10, ry=f*10+8;
    const segs=8+f;
    for(let i=0;i<segs;i++){
      const a1=(i/segs)*Math.PI*2, a2=((i+1)/segs)*Math.PI*2;
      t.push(...quad([br*Math.cos(a1),fy,br*Math.sin(a1)],[br*Math.cos(a2),fy,br*Math.sin(a2)],[br*Math.cos(a2),ry,br*Math.sin(a2)],[br*Math.cos(a1),ry,br*Math.sin(a1)]));
      t.push(...quad([br*Math.cos(a1),ry,br*Math.sin(a1)],[br*Math.cos(a2),ry,br*Math.sin(a2)],[tr*Math.cos(a2),ry,tr*Math.sin(a2)],[tr*Math.cos(a1),ry,tr*Math.sin(a1)]));
    }
  }
  const br = br0;
  t.push(...box(-br-3,0,-br-3,br+3,1,br+3));
  return t;
}

function stoneBridge() {
  const t = [];
  const W=10, span=50, h=12, segs=14;
  for(let side=-1;side<=1;side+=2){
    for(let i=0;i<segs;i++){
      const a1=(i/segs)*Math.PI, a2=((i+1)/segs)*Math.PI;
      const x1=span/2*Math.cos(a1), y1=h*Math.sin(a1), x2=span/2*Math.cos(a2), y2=h*Math.sin(a2);
      t.push(...quad([x1,y1,side*W/2],[x2,y2,side*W/2],[x2,y2,side*W/2-1.5],[x1,y1,side*W/2-1.5]));
      t.push(...quad([x1,y1,-side*W/2],[x2,y2,-side*W/2],[x2,y2,-side*W/2+1.5],[x1,y1,-side*W/2+1.5]));
    }
  }
  for(let i=0;i<6;i++){
    const x=-span/2+i*span/5;
    t.push(...quad([x,h,-W/2-1],[x+span/8,h,-W/2-1],[x+span/8,h,W/2+1],[x,h,W/2+1]));
    t.push(...quad([x,h+1,-W/2-1],[x+span/8,h+1,-W/2-1],[x+span/8,h+1,-W/2-1],[x,h+1,-W/2-1]));
  }
  t.push(...quad([-span/2,0,-W/2-2],[span/2,0,-W/2-2],[span/2,h,-W/2-2],[-span/2,h,-W/2-2]));
  t.push(...quad([-span/2,0,W/2+2],[span/2,0,W/2+2],[span/2,h,W/2+2],[-span/2,h,W/2+2]));
  return t;
}

function archway() {
  const t = [];
  const W=40, H=28, D=5, pw=3;
  for(const x of [-W/2,-W/4,W/4,W/2]){
    t.push(...box(x-pw/2,0,-D/2-pw/2,x+pw/2,H,-D/2+pw/2));
    t.push(...box(x-pw/2,0,D/2-pw/2,x+pw/2,H,D/2+pw/2));
  }
  t.push(...box(-W/2-1,H*0.6,-D/2-1,W/2+1,H*0.68,D/2+1));
  t.push(...box(-W/2-1,H*0.38,-D/2-1,W/2+1,H*0.46,D/2+1));
  for(const [x1,x2] of [[-W/2-1,-W/4+pw/2],[W/4-pw/2,W/2+1]]){
    t.push(...box(x1,H*0.6,-D/2-1,x2,H*0.68,D/2+1));
    t.push(...box(x1,H*0.38,-D/2-1,x2,H*0.46,D/2+1));
  }
  t.push(...box(-W/2-3,H,-D/2-3,W/2+3,H+4,D/2+3));
  return t;
}

function siheyuan() {
  const t = [];
  const W=60,D=50,H=10,wh=5;
  t.push(...box(-W/4,H-1,-D/2-1,W/4,H,D/2+1));
  t.push(...box(-W/2-1,H-1,-D/6,W/2+1,H,D/6));
  t.push(...box(-W/2-1,H-1,D/6,W/2+1,H,D/2+1));
  t.push(...box(-W/2-1,0,-D/2-1,-W/2,H,D/2+1));
  t.push(...box(W/2,0,-D/2-1,W/2+1,H,D/2+1));
  t.push(...box(-W/2,-wh,-D/2-1,W/2,-wh,D/2+1));
  t.push(...box(-1,H,D/2,W/2,H,D/2+3));
  return t;
}

function dougong() {
  const t = [];
  const layers=4, bw=8, lw=2, ll=14, lh=layers*5;
  for(let l=0;l<layers;l++){
    const ly=l*5;
    t.push(...box(-bw/2,ly,-bw/2,bw/2,ly+3,bw/2));
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      t.push(...box(0,ly+2,0,dx*ll,ly+3,dz*ll));
      t.push(...box(-lw/2*Math.abs(dz),ly+2,lw/2*Math.abs(dx),lw/2*Math.abs(dz),ly+4,-lw/2*Math.abs(dx)));
    }
  }
  const wx=50;
  for(let i=0;i<3;i++){
    const x=-wx/2+i*wx/2;
    t.push(...box(x,lh,x+wx/3,lh+3,ll));
  }
  return t;
}

function dragon() {
  const t = [];
  const segs=24;
  for(let i=0;i<segs;i++){
    const tt=i/segs, angle=tt*Math.PI*5;
    const r=12*(1-tt*0.5);
    const x=tt*50-25, y=8+Math.sin(tt*Math.PI*3)*5, z=Math.cos(angle)*r;
    const nx=(i+1<segs?(i+1)/segs*50-25:x), ny=(i+1<segs?8+Math.sin((i+1)/segs*Math.PI*3)*5:y), nz=(i+1<segs?Math.cos((i+1)/segs*Math.PI*5)*12*(1-(i+1)/segs*0.5):z);
    const n2x=(i+2<segs?(i+2)/segs*50-25:nx), n2y=(i+2<segs?8+Math.sin((i+2)/segs*Math.PI*3)*5:ny), n2z=(i+2<segs?Math.cos((i+2)/segs*Math.PI*5)*12*(1-(i+2)/segs*0.5):nz);
    t.push(...quad([x-2,y,z-2],[nx-2,ny,nz-2],[n2x-2,n2y,n2z-2],[x-2,y,z-2]));
  }
  return t;
}

function temple() {
  const t = [];
  const W=40,D=35,H=12,wh=5;
  t.push(...box(-W/2,0,-D/2,W/2,H,-D/2+1));
  t.push(...box(-W/2,0,D/2-1,W/2,H,D/2));
  t.push(...box(-W/2,0,-D/2,-W/2+1,H,D/2));
  t.push(...box(W/2-1,0,-D/2,W/2+1,H,D/2));
  t.push(...box(-W/2-1,H-1,-D/2-1,W/2+1,H,D/2+1));
  t.push(...box(-W/2+1,wh,-D/2+1,W/2-1,H-1,D/2-1));
  return t;
}

function pavilionStage() {
  const t = [];
  const W=40,D=25,H=8,rh=14;
  for(const [x1,z1,x2,z2] of [[-W/2,-D/2,W/2,-D/2],[-W/2,D/2,W/2,D/2],[-W/2,-D/2,-W/2,D/2],[W/2,-D/2,W/2,D/2]]){
    t.push(...quad([x1,0,z1],[x2,0,z2],[x2,H,z2],[x1,H,z1]));
  }
  const corners=[[-W/2-2,H,-D/2-1],[W/2+2,H,-D/2-1],[W/2+2,H+4,D/2+2],[-W/2-2,H+4,D/2+2]];
  for(let i=0;i<4;i++) t.push(...quad(corners[i],corners[(i+1)%4],[0,rh,0],[0,rh,0]));
  t.push(...quad([-W/2-1,0,-D/2-1],[W/2+1,0,-D/2-1],[W/2+1,0,D/2+1],[-W/2-1,0,D/2+1]));
  return t;
}

function dragonStatue() {
  const t = [];
  const segs=18;
  for(let i=0;i<segs;i++){
    const tt=i/segs;
    const angle=tt*Math.PI*4;
    const r=10*(1-tt*0.4);
    const x=tt*40-20, y=5+Math.sin(tt*Math.PI*2)*4, z=Math.cos(angle)*r;
    const nx=(i+1<segs?(i+1)/segs*40-20:x), ny=(i+1<segs?5+Math.sin((i+1)/segs*Math.PI*2)*4:y), nz=(i+1<segs?Math.cos((i+1)/segs*Math.PI*4)*10*(1-(i+1)/segs*0.4):z);
    const n2x=(i+2<segs?(i+2)/segs*40-20:nx), n2y=(i+2<segs?5+Math.sin((i+2)/segs*Math.PI*2)*4:ny), n2z=(i+2<segs?Math.cos((i+2)/segs*Math.PI*4)*10*(1-(i+2)/segs*0.4):nz);
    const n=calcNormal([x,y,z],[nx,ny,nz],[n2x,n2y,n2z]);
    t.push({n,v1:[x-3,y,z-3],v2:[nx-3,ny,nz-3],v3:[n2x-3,n2y,n2z-3]});
    t.push({n,v1:[x+3,y,z+3],v2:[nx+3,ny,nz+3],v3:[n2x+3,n2y,n2z+3]});
  }
  return t;
}

// ─── 模型配置 ───────────────────────────────────────────
const MODELS = [
  { name: '亭子_六角亭_HexagonalPavilion.stl', fn: hexPavilion },
  { name: '亭子_八角亭_OctagonalPavilion.stl', fn: octPavilion },
  { name: '亭子_四角亭_SquarePavilion.stl',     fn: squarePavilion },
  { name: '亭子_圆亭_RoundPavilion.stl',        fn: roundPavilion },
  { name: '廊_游廊_Corridor.stl',              fn: corridor },
  { name: '塔_宝塔_Pagoda5Floor.stl',           fn: () => pagoda(5) },
  { name: '塔_木塔_Pagoda3Floor.stl', fn: () => pagoda(3) },
  { name: '塔_七层塔_Pagoda7Floor.stl', fn: () => pagoda(7) },
  { name: '塔_九层塔_Pagoda9Floor.stl', fn: () => pagoda(9) },
  { name: '桥_石拱桥_StoneArchBridge.stl', fn: stoneBridge },
  { name: '桥_平桥_SimpleFlatBridge.stl', fn: () => { const t=[]; t.push(...quad([-25,0,-8],[25,0,-8],[25,1,8],[-25,1,8])); for(let i=0;i<5;i++){t.push(...box(-25+i*10-1,0,-10,-25+i*10+1,3,-8));t.push(...box(-25+i*10-1,0,8,-25+i*10+1,3,10));} return t; } },
  { name: '牌坊_三门牌坊_ThreeDoorArchway.stl', fn: archway },
  { name: '牌坊_单门牌坊_SingleDoorArch.stl', fn: () => { const t=[]; t.push(...box(-1.5,0,-3,1.5,24,3));t.push(...box(-5,16,-3,5,17,3));t.push(...box(-5,10,-3,5,11,3));t.push(...box(-6,24,-4,6,25,4));return t; } },
  { name: '门楼_四柱门_FourPillarGate.stl', fn: () => { const t=[]; for(const x of [-12,12]){t.push(...box(x-1.5,0,-3,x+1.5,18,3));t.push(...box(x-1.5,0,3,x+1.5,18,-3));} t.push(...box(-14,14,-4,14,15,4));t.push(...box(-14,8,-4,14,9,4));t.push(...box(-14,18,-4,14,19,4));return t; } },
  { name: '民居_四合院_Siheyuan.stl', fn: siheyuan },
  { name: '民居_吊脚楼_StiltedHouse.stl', fn: () => { const t=[]; t.push(...box(-15,-5,-10,15,0,10));for(const [x1,z1,x2,z2] of [[-15,-10,15,-10],[15,-10,15,8],[15,8,-15,8],[-15,8,-15,-10]]){t.push(...quad([x1,-5,z1],[x2,-5,z2],[x2,8,z2],[x1,8,z1]));} t.push(...quad([-16,8,-11],[16,8,-11],[16,8,11],[-16,8,11]));return t; } },
  { name: '庙宇_寺庙_Temple.stl', fn: temple },
  { name: '大殿_主殿_MainHall.stl', fn: () => { const t=[]; t.push(...box(-20,0,-15,20,12,15));t.push(...box(-22,12,-17,22,14,17));return t; } },
  { name: '祠堂_宗祠_AncestralHall.stl', fn: () => { const t=[]; t.push(...box(-15,0,-10,15,10,10));t.push(...box(-17,10,-12,17,12,12));return t; } },
  { name: '园林_假山_Rockery.stl', fn: () => { const t=[]; for(let i=0;i<8;i++){const x=Math.cos(i/8*Math.PI*2)*12,y=Math.abs(Math.sin(i/4*Math.PI))*8,z=Math.sin(i/8*Math.PI*2)*12; t.push(...box(x-3,y,z+3,x+3,y+8,z-3));}return t; } },
  { name: '戏台_古戏台_PavilionStage.stl', fn: pavilionStage },
  { name: '龙_中国龙_ChineseDragon.stl', fn: dragonStatue },
  { name: '石狮_蹲狮_GuardianLion.stl', fn: () => { const t=[]; t.push(...box(-6,0,-5,6,12,5));t.push(...box(-8,12,-6,8,14,6));t.push(...box(-4,14,-3,4,18,3));return t; } },
  { name: '斗拱_dougong_BracketSet.stl', fn: dougong },
  { name: '栏杆_Railing.stl', fn: () => { const t=[]; for(let i=0;i<6;i++){t.push(...box(-30+i*12-0.5,0,-2,-30+i*12+0.5,8,2));} t.push(...box(-32,7,-3,42,8,3));t.push(...box(-32,7,3,42,8,-3));return t; } },
  { name: '飞檐_CurvedEave.stl', fn: () => { const t=[]; for(let i=0;i<12;i++){const a1=i/12*Math.PI*0.6,a2=(i+1)/12*Math.PI*0.6; t.push(...quad([30*Math.cos(a1),10,0],[30*Math.cos(a2),10,0],[35*Math.cos(a2),12,0],[35*Math.cos(a1),12,0]));}return t; } },
  { name: '柱_圆柱_Column.stl', fn: () => { const t=[]; for(let i=0;i<12;i++){const a1=i/12*Math.PI*2,a2=(i+1)/12*Math.PI*2; t.push(...quad([4*Math.cos(a1),0,4*Math.sin(a1)],[4*Math.cos(a2),0,4*Math.sin(a2)],[4*Math.cos(a2),25,4*Math.sin(a2)],[4*Math.cos(a1),25,4*Math.sin(a1)]));} t.push(...box(-5,0,-5,5,1,5));t.push(...box(-5,25,-5,5,26,5));return t; } },
];

// ─── 主函数 ─────────────────────────────────────────────
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let generated = 0, skipped = 0;
for (const model of MODELS) {
  if (CATEGORY && !model.name.includes(CATEGORY)) continue;
  const dest = path.join(OUTPUT_DIR, model.name);
  if (fs.existsSync(dest)) {
    console.log(`⏭️  跳过（已存在）: ${model.name}`);
    skipped++;
    continue;
  }
  try {
    const tris = model.fn();
    const size = writeBinarySTL(dest, tris);
    console.log(`✅ 生成: ${model.name} (${Math.round(size/1024)} KB, ${tris.length} 面)`);
    generated++;
  } catch(e) {
    console.log(`❌ 失败: ${model.name} - ${e.message}`);
  }
}

const total = fs.readdirSync(OUTPUT_DIR).filter(f=>f.toLowerCase().endsWith('.stl')).length;
console.log(`\n完成！新增 ${generated} 个，跳过 ${skipped} 个，模型库总计 ${total} 个 STL 文件`);
