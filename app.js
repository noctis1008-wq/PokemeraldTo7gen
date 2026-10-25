// PokeEm-expansion-CanuseJP のセーブデータ (.sav) から、第7世代 (SM/USUM) 用の .pk7 を作る。
// すべてブラウザの中で処理し、ファイルはどこにも送らない。
'use strict';

const SECTOR_SIZE = 4096;
const SECTOR_DATA_SIZE = 3968;
const SECTORS_PER_SLOT = 14;
const SIGNATURE = 0x08012025;
const SB1_PARTY_COUNT = 0x234;
const SB1_PARTY = 0x238;
const POKEMON_SIZE = 100;
const BOXMON_SIZE = 80;
const TOTAL_BOXES = 14;
const IN_BOX = 30;

const GEN7_MAX_ABILITY = 233;
const MET_LOCATION_ROUTE1 = 6; // 1ばんどうろ

const SUBSTRUCT_OFFSETS = [
  [0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3],
  [1, 1, 2, 3, 2, 3, 0, 0, 0, 0, 0, 0, 2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2],
  [2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2, 0, 0, 0, 0, 0, 0, 3, 2, 3, 2, 1, 1],
  [3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0],
];

// このハックのボール番号 → 名前
const BALL_NAMES = ['ストレンジ', 'モンスター', 'スーパー', 'ハイパー', 'マスター', 'プレミア', 'ヒール', 'ネット', 'ネスト',
  'ダイブ', 'ダーク', 'タイマー', 'クイック', 'リピート', 'ゴージャス', 'レベル', 'ルアー', 'ムーン', 'フレンド', 'ラブラブ',
  'スピード', 'ヘビー', 'ドリーム', 'サファリ', 'コンペ', 'パーク', 'ウルトラ', 'プレシャス'];
// このハックのボール番号 → 第7世代のボール番号 (0 = 第7世代にない)
const GEN7_BALL = [0, 4, 3, 2, 1, 12, 14, 6, 8, 7, 13, 10, 15, 9, 11, 18, 19, 23, 22, 21, 17, 20, 25, 5, 24, 0, 26, 16];

let DATA = null;
let results = [];

// ---------- 読み込み ----------

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

function loadSlot(bytes) {
  const slots = [];
  for (let slot = 0; slot < 2; slot++) {
    const sectors = {};
    let counter = 0;
    let ok = true;
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const base = (slot * SECTORS_PER_SLOT + i) * SECTOR_SIZE;
      if (base + SECTOR_SIZE > bytes.length) { ok = false; break; }
      const id = u16(bytes, base + 0xFF4);
      const sig = u32(bytes, base + 0xFF8);
      if (sig !== SIGNATURE) { ok = false; break; }
      sectors[id] = bytes.subarray(base, base + SECTOR_SIZE);
      counter = u32(bytes, base + 0xFFC);
    }
    if (ok && Object.keys(sectors).length === SECTORS_PER_SLOT) slots.push({ counter, sectors });
  }
  if (!slots.length) throw new Error('セーブデータとして読めませんでした（このハックの .sav か確かめてください）');
  slots.sort((a, b) => b.counter - a.counter);
  return slots[0];
}

function assemble(sectors, first, last) {
  const out = new Uint8Array((last - first + 1) * SECTOR_DATA_SIZE);
  for (let i = first; i <= last; i++) out.set(sectors[i].subarray(0, SECTOR_DATA_SIZE), (i - first) * SECTOR_DATA_SIZE);
  return out;
}

class Bits {
  constructor(b) { this.b = b; this.pos = 0; }
  take(n) {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pos + i;
      v |= ((this.b[p >> 3] >> (p & 7)) & 1) << i;
    }
    this.pos += n;
    return v >>> 0;
  }
}

function parseBoxMon(b) {
  const personality = u32(b, 0);
  const otId = u32(b, 4);
  const m = {
    personality, otId,
    hiddenNatureMod: b[18] >> 3,
    isBadEgg: b[19] & 1,
    hasSpecies: (b[19] >> 1) & 1,
    nicknameRaw: Array.from(b.subarray(8, 18)),
    otNameRaw: Array.from(b.subarray(20, 27)),
    shinyModifier: (u16(b, 30) >> 14) & 1,
  };
  const secure = new Uint8Array(48);
  const key = (personality ^ otId) >>> 0;
  for (let i = 0; i < 48; i += 4) {
    const w = (u32(b, 32 + i) ^ key) >>> 0;
    secure[i] = w & 0xFF; secure[i + 1] = (w >>> 8) & 0xFF; secure[i + 2] = (w >>> 16) & 0xFF; secure[i + 3] = (w >>> 24) & 0xFF;
  }
  let sum = 0;
  for (let i = 0; i < 48; i += 2) sum = (sum + u16(secure, i)) & 0xFFFF;
  m.checksumOk = sum === u16(b, 28);
  const order = personality % 24;
  const sub = [0, 1, 2, 3].map(t => secure.subarray(SUBSTRUCT_OFFSETS[t][order] * 12, SUBSTRUCT_OFFSETS[t][order] * 12 + 12));

  const s0 = new Bits(sub[0]);
  m.species = s0.take(11); s0.take(5); m.heldItem = s0.take(10); s0.take(6);
  m.experience = s0.take(21); const nick11 = s0.take(8); s0.take(3);
  m.ppBonuses = s0.take(8); m.friendship = s0.take(8);
  m.pokeball = s0.take(6); const nick12 = s0.take(8);
  m.nicknameRaw.push(nick11, nick12);

  const s1 = new Bits(sub[1]);
  m.moves = [];
  m.moves.push(s1.take(11)); s1.take(5);
  m.moves.push(s1.take(11)); s1.take(5);
  m.moves.push(s1.take(11)); s1.take(5);
  m.moves.push(s1.take(11)); s1.take(3);
  const ht = { hp: s1.take(1), atk: s1.take(1) };
  m.pp = [];
  m.pp.push(s1.take(7)); ht.def = s1.take(1);
  m.pp.push(s1.take(7)); ht.spe = s1.take(1);
  m.pp.push(s1.take(7)); ht.spa = s1.take(1);
  m.pp.push(s1.take(7)); ht.spd = s1.take(1);
  m.hyperTrained = ht;

  m.evs = Array.from(sub[2].subarray(0, 6));
  m.contest = Array.from(sub[2].subarray(6, 12));

  const s3 = new Bits(sub[3]);
  m.pokerus = s3.take(8); s3.take(8);
  m.metLevel = s3.take(7); s3.take(4); s3.take(4); m.otGender = s3.take(1);
  m.ivs = [0, 1, 2, 3, 4, 5].map(() => s3.take(5));
  m.isEgg = s3.take(1); s3.take(1);
  s3.take(27); s3.take(1); s3.take(1);
  m.abilityNum = s3.take(2); m.fateful = s3.take(1);
  return m;
}

function readSave(bytes) {
  const { sectors } = loadSlot(bytes.subarray(0, 0x20000));
  const sb1 = assemble(sectors, 1, 4);
  const storage = assemble(sectors, 5, 13);
  const mons = [];
  const count = Math.min(sb1[SB1_PARTY_COUNT], 6);
  for (let i = 0; i < count; i++) {
    const b = sb1.subarray(SB1_PARTY + i * POKEMON_SIZE, SB1_PARTY + (i + 1) * POKEMON_SIZE);
    const m = parseBoxMon(b.subarray(0, BOXMON_SIZE));
    m.where = `てもち ${i + 1}`;
    m.tag = `P${i + 1}`;
    m.level = b[84];
    mons.push(m);
  }
  for (let box = 0; box < TOTAL_BOXES; box++) {
    for (let pos = 0; pos < IN_BOX; pos++) {
      const off = 4 + (box * IN_BOX + pos) * BOXMON_SIZE;
      const b = storage.subarray(off, off + BOXMON_SIZE);
      if (b.every(x => x === 0)) continue;
      const m = parseBoxMon(b);
      if (!m.hasSpecies && m.species === 0) continue;
      m.where = `ボックス${box + 1} の ${pos + 1}`;
      m.tag = `B${box + 1}-${pos + 1}`;
      mons.push(m);
    }
  }
  return mons;
}

// ---------- 文字・経験値 ----------

function decodeName(raw) {
  let s = '';
  for (const b of raw) {
    if (b === 0xFF) break;
    s += DATA.charmap[b] ?? '?';
  }
  return s;
}

function expForLevel(g, n) {
  if (n <= 1) return 0;
  const c = n * n * n;
  switch (g) {
    case 0: return c;
    case 1:
      if (n <= 50) return Math.floor(c * (100 - n) / 50);
      if (n <= 68) return Math.floor(c * (150 - n) / 100);
      if (n <= 98) return Math.floor(c * Math.floor((1911 - 10 * n) / 3) / 500);
      return Math.floor(c * (160 - n) / 100);
    case 2:
      if (n <= 15) return Math.floor(c * (Math.floor((n + 1) / 3) + 24) / 50);
      if (n <= 36) return Math.floor(c * (n + 14) / 50);
      return Math.floor(c * (Math.floor(n / 2) + 32) / 50);
    case 3: return Math.floor(6 * c / 5) - 15 * n * n + 100 * n - 140;
    case 4: return Math.floor(4 * c / 5);
    default: return Math.floor(5 * c / 4);
  }
}

function levelFromExp(g, exp) {
  let lv = 1;
  while (lv < 100 && expForLevel(g, lv + 1) <= exp) lv++;
  return lv;
}

// ---------- 変換 ----------

function shinyValue(tid, sid, pid) { return (tid ^ sid ^ (pid >>> 16) ^ (pid & 0xFFFF)) >>> 0; }

function convert(m, version, today) {
  const sp = DATA.species[m.species];
  if (m.isEgg || m.isBadEgg) return { error: 'タマゴ' };
  if (!sp) return { error: '第7世代にいないポケモン・すがた' };
  const notes = [];
  const tid = m.otId & 0xFFFF;
  const sid = m.otId >>> 16;
  let pid = m.personality;
  const ec = m.personality;
  const shiny = ((shinyValue(tid, sid, pid) < 8) ? 1 : 0) ^ m.shinyModifier;
  if (shiny && shinyValue(tid, sid, pid) >= 16) {
    const hi = (tid ^ sid ^ (pid & 0xFFFF)) & 0xFFFF;
    pid = ((hi << 16) | (pid & 0xFFFF)) >>> 0;
    notes.push('色違いを保つため PID を調整');
  } else if (!shiny && shinyValue(tid, sid, pid) < 16) {
    pid = (pid ^ 0x10000000) >>> 0;
    notes.push('色違いにならないよう PID を調整');
  }

  let nature = (m.personality % 25) ^ m.hiddenNatureMod;
  if (nature >= 25) nature = m.personality % 25;

  let gender;
  if (sp.gender === 255) gender = 2;
  else if (sp.gender === 254) gender = 1;
  else if (sp.gender === 0) gender = 0;
  else gender = (m.personality & 0xFF) < sp.gender ? 1 : 0;

  let slot = m.abilityNum < 3 ? m.abilityNum : 0;
  let ability = sp.abil[slot];
  if (!ability) {
    notes.push('特性が第7世代にないので1番目の特性に');
    slot = 0;
    ability = sp.abil[0];
  }

  let item = 0;
  if (m.heldItem) {
    item = DATA.items[m.heldItem] ?? 0;
    if (!item) notes.push('持ち物が第7世代にないので外した');
  }

  const moves = [], pps = [], ppups = [];
  m.moves.forEach((mv, i) => {
    if (!mv) return;
    const g = DATA.moves[mv];
    if (!g) { notes.push('第7世代にないわざを外した'); return; }
    moves.push(g); pps.push(m.pp[i]); ppups.push((m.ppBonuses >> (2 * i)) & 3);
  });
  while (moves.length < 4) { moves.push(0); pps.push(0); ppups.push(0); }

  const level = m.level || levelFromExp(sp.growth, m.experience);
  // 出会ったレベルはセーブデータのものを使う (0 = タマゴからかえった → 1)
  let metLevel = m.metLevel;
  if (metLevel === 0) { metLevel = 1; notes.push('タマゴからかえったポケモンなので出会ったレベルは1に'); }
  if (metLevel > level) metLevel = level;
  let nick = decodeName(m.nicknameRaw);
  const speciesName = DATA.jaSpecies[sp.dex] || '';
  const nicknamed = nick !== '' && nick !== speciesName;
  if (!nicknamed) nick = speciesName;
  const ot = decodeName(m.otNameRaw);

  let ball = GEN7_BALL[m.pokeball] ?? 4;
  if (!ball) { notes.push(`${BALL_NAMES[m.pokeball]}ボールは第7世代にないのでモンスターボールに`); ball = 4; }

  const b = new Uint8Array(232);
  const dv = new DataView(b.buffer);
  dv.setUint32(0x00, ec, true);
  dv.setUint16(0x08, sp.dex, true);
  dv.setUint16(0x0A, item, true);
  dv.setUint16(0x0C, tid, true);
  dv.setUint16(0x0E, sid, true);
  dv.setUint32(0x10, m.experience, true);
  b[0x14] = ability;
  b[0x15] = [1, 2, 4][slot];
  dv.setUint32(0x18, pid, true);
  b[0x1C] = nature;
  b[0x1D] = (m.fateful & 1) | (gender << 1) | (sp.form << 3);
  b.set(m.evs, 0x1E);
  b.set(m.contest, 0x24);
  b[0x2B] = m.pokerus;
  writeName(b, 0x40, nick);
  moves.forEach((mv, i) => dv.setUint16(0x5A + i * 2, mv, true));
  b.set(pps, 0x62);
  b.set(ppups, 0x66);
  const iv = m.ivs;
  let iv32 = iv[0] | (iv[1] << 5) | (iv[2] << 10) | (iv[3] << 15) | (iv[4] << 20) | (iv[5] << 25);
  if (nicknamed) iv32 |= 0x80000000;
  dv.setUint32(0x74, iv32 >>> 0, true);
  b[0x93] = 0;                       // いまのおや = おや
  writeName(b, 0xB0, ot);
  b[0xCA] = m.friendship;
  b[0xD4] = today.getFullYear() - 2000;
  b[0xD5] = today.getMonth() + 1;
  b[0xD6] = today.getDate();
  dv.setUint16(0xDA, MET_LOCATION_ROUTE1, true);
  b[0xDC] = ball;
  b[0xDD] = (Math.min(metLevel, 100) & 0x7F) | ((m.otGender & 1) << 7);
  const ht = m.hyperTrained;
  b[0xDE] = ht.hp | (ht.atk << 1) | (ht.def << 2) | (ht.spa << 3) | (ht.spd << 4) | (ht.spe << 5);
  b[0xDF] = version;
  b[0xE3] = 1;                       // 日本語
  let chk = 0;
  for (let i = 8; i < 0xE8; i += 2) chk = (chk + dv.getUint16(i, true)) & 0xFFFF;
  dv.setUint16(0x06, chk, true);

  return { bytes: b, dex: sp.dex, speciesName, nick, level, notes };
}

function writeName(b, off, s) {
  const chars = Array.from(s).slice(0, 12);
  chars.forEach((c, i) => {
    const code = c.charCodeAt(0);
    b[off + i * 2] = code & 0xFF;
    b[off + i * 2 + 1] = code >> 8;
  });
}

// ---------- 画面 ----------

const $ = sel => document.querySelector(sel);

function fileName(r) {
  return `${r.m.tag}_${String(r.conv.dex).padStart(3, '0')}_${r.conv.speciesName}.pk7`;
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function render() {
  const tbody = $('#list tbody');
  tbody.textContent = '';
  let ok = 0;
  results.forEach((r, i) => {
    const tr = document.createElement('tr');
    const can = !r.conv.error;
    if (!can) tr.className = 'skip';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = can;
    cb.disabled = !can;
    cb.dataset.index = i;
    cb.setAttribute('aria-label', `${r.m.where} を選ぶ`);
    const td0 = document.createElement('td'); td0.appendChild(cb); tr.appendChild(td0);
    const cells = [r.m.where,
      can ? `${r.conv.speciesName}` : '—',
      can ? r.conv.nick : '—',
      can ? `Lv${r.conv.level}` : '',
      can ? (r.conv.notes.join('、') || '') : r.conv.error];
    cells.forEach(t => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
    const td = document.createElement('td');
    if (can) {
      ok++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = '.pk7';
      btn.addEventListener('click', () => download(fileName(r), new Blob([r.conv.bytes])));
      td.appendChild(btn);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
  $('#summary').textContent = `${results.length}匹中 ${ok}匹を変換できます（${results.length - ok}匹は第7世代にいないため対象外）`;
  $('#result').hidden = false;
}

async function onFile(file) {
  $('#error').hidden = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mons = readSave(bytes);
    const version = Number($('#version').value);
    const today = new Date();
    results = mons.map(m => ({ m, conv: convert(m, version, today) }));
    render();
  } catch (e) {
    $('#error').textContent = e.message;
    $('#error').hidden = false;
    $('#result').hidden = true;
  }
}

async function downloadZip() {
  const zip = new JSZip();
  let n = 0;
  document.querySelectorAll('#list tbody input[type=checkbox]').forEach(cb => {
    if (!cb.checked || cb.disabled) return;
    const r = results[Number(cb.dataset.index)];
    zip.file(fileName(r), r.conv.bytes);
    n++;
  });
  if (!n) return;
  const blob = await zip.generateAsync({ type: 'blob' });
  download('pokemon_gen7.zip', blob);
}

async function init() {
  DATA = await (await fetch('data.json')).json();
  $('#file').addEventListener('change', e => { if (e.target.files[0]) onFile(e.target.files[0]); });
  $('#version').addEventListener('change', () => { const f = $('#file').files[0]; if (f) onFile(f); });
  $('#zip').addEventListener('click', downloadZip);
  $('#all').addEventListener('change', e => {
    document.querySelectorAll('#list tbody input[type=checkbox]').forEach(cb => { if (!cb.disabled) cb.checked = e.target.checked; });
  });
  $('#file').disabled = false;
}

init();
