"""Web 版の変換ツールが使う data.json を作る (このハックのビルドから抽出)。"""
import json, re, struct, sys

import os
# S: 作業フォルダ (vals.json, PKHeX と PokeAPI の clone, 出力先 web/ を置く)  REPO: ハックのリポジトリ (ビルド済み)
S = os.environ.get('WORK_DIR', '.')
REPO = os.environ.get('HACK_REPO', '../PokeEm-expansion-CanuseJP')
PKX = S + '/pkhex/PKHeX.Core/Resources/text'

vals = json.load(open(S + '/vals.json'))
rom = open(REPO + '/pokeemerald.gba', 'rb').read()
SPECIES_INFO = 0x086ac064 - 0x08000000
SI_SIZE = 0x108
GEN7_MAX_SPECIES = 807
GEN7_MAX_MOVE = 728
GEN7_MAX_ITEM = 959
GEN7_MAX_ABILITY = 233
Z_MOVES = set(range(622, 659)) | set(range(695, 704)) | {719} | set(range(723, 729))


def lines(path):
    return open(path, encoding='utf-8-sig').read().split('\n')


def norm(s):
    return re.sub(r'[^A-Z0-9]', '', s.upper().replace('É', 'E'))


def build_index(names, maxid):
    d = {}
    for i, n in enumerate(names[:maxid + 1]):
        if n.strip():
            d.setdefault(norm(n), i)
    return d


inv = {}
for k, d in vals.items():
    inv[k] = {}
    for n, v in d.items():
        inv[k].setdefault(v, n)

# ---- わざ ----
move_index = build_index(lines(PKX + '/other/en/text_Moves_en.txt'), GEN7_MAX_MOVE)
ALIASES = {'VICEGRIP': 'VISEGRIP', 'HIJUMPKICK': 'HIGHJUMPKICK', 'SMELLINGSALT': 'SMELLINGSALTS',
           'FAINTATTACK': 'FEINTATTACK'}
moves = {}
unmatched_moves = []
for mid, name in inv['moves'].items():
    if mid <= 0:
        continue
    key = norm(name[5:])
    key = ALIASES.get(key, key)
    g = move_index.get(key)
    if g is not None and g not in Z_MOVES:
        moves[mid] = g
    elif mid <= 742:
        unmatched_moves.append(name)

# ---- 持ち物 ----
item_index = build_index(lines(PKX + '/items/text_Items_en.txt'), GEN7_MAX_ITEM)
items = {}
for iid, name in inv['items'].items():
    if iid <= 0 or name in ('ITEM_NONE', 'ITEM_USE_MAIL'):
        continue
    g = item_index.get(norm(name[5:]))
    if g:
        items[iid] = g

# ---- 種族 ----
EXCLUDE = ('GALAR', 'HISUI', 'PALDEA', 'GMAX', 'MEGA', 'PRIMAL', 'ULTRA', 'ETERNAMAX', 'TERASTAL', 'STELLAR')


def info(sid):
    base = SPECIES_INFO + sid * SI_SIZE
    gender = rom[base + 0x12]
    growth = rom[base + 0x15]
    abil = list(struct.unpack_from('<3H', rom, base + 0x18))
    ptr = struct.unpack_from('<I', rom, base + 0xA4)[0]
    table = []
    if 0x08000000 <= ptr < 0x0A000000:
        o = ptr - 0x08000000
        while len(table) < 64:
            v = struct.unpack_from('<H', rom, o)[0]
            if v == 0xFFFF:
                break
            table.append(v)
            o += 2
    return gender, growth, abil, table


# 第7世代のフォルム番号がフォルム表の並びと違うもの (None = 第7世代にない)
FORM_OVERRIDES = {
    'PIKACHU_COSPLAY': None, 'PIKACHU_ROCK_STAR': None, 'PIKACHU_BELLE': None, 'PIKACHU_POP_STAR': None,
    'PIKACHU_PHD': None, 'PIKACHU_LIBRE': None, 'PIKACHU_WORLD': None, 'PIKACHU_STARTER': None,
    'PIKACHU_ORIGINAL': 1, 'PIKACHU_HOENN': 2, 'PIKACHU_SINNOH': 3, 'PIKACHU_UNOVA': 4,
    'PIKACHU_KALOS': 5, 'PIKACHU_ALOLA': 6, 'PIKACHU_PARTNER': 7,
    'EEVEE_STARTER': None,
}

species = {}
for sid, name in sorted(inv['species'].items()):
    if sid <= 0 or sid >= 2048:
        continue
    short = name[8:]
    dex = struct.unpack_from('<H', rom, SPECIES_INFO + sid * SI_SIZE + 0x3C)[0]  # 全国図鑑番号
    if dex == 0 or dex > GEN7_MAX_SPECIES:
        continue
    gender, growth, abil, table = info(sid)
    form = 0
    if table and sid in table:
        # フォルム番号 = フォルム表の中の位置 (第8世代以降の姿・メガシンカなどは除く)
        ok = [s for s in table if not any(x in inv['species'].get(s, '') for x in EXCLUDE)]
        if sid not in ok:
            continue
        form = ok.index(sid)
    elif sid != dex:
        if any(x in short for x in EXCLUDE):
            continue
    if short in FORM_OVERRIDES:
        if FORM_OVERRIDES[short] is None:
            continue
        form = FORM_OVERRIDES[short]
    if form > 31:
        continue
    species[sid] = {'dex': dex, 'form': form, 'gender': gender, 'growth': growth,
                    'abil': [a if a <= GEN7_MAX_ABILITY else 0 for a in abil], 'name': short}

# ---- 名前 (日本語) ----
ja_species = lines(PKX + '/other/ja/text_Species_ja.txt')[:GEN7_MAX_SPECIES + 1]

# ---- 文字コード ----
charmap = {}
for ln in open(REPO + '/charmap.txt', encoding='utf-8'):
    mm = re.match(r"^'(.)'\s*=\s*([0-9A-Fa-f]{2})\s*$", ln.strip())
    if mm:
        ch, b = mm.group(1), int(mm.group(2), 16)
        if b not in charmap or ('぀' <= ch <= 'ヿ'):
            charmap[b] = ch

# ---- アローラ図鑑 (ウルトラサン・ウルトラムーン) の番号 ----
# PokeAPI の data/v2/csv/pokemon_dex_numbers.csv (pokedex_id 21 = updated-alola)
import csv
alola_dex = {}
for r in csv.DictReader(open(S + '/pokeapi/data/v2/csv/pokemon_dex_numbers.csv')):
    if r['pokedex_id'] == '21':
        alola_dex[int(r['species_id'])] = int(r['pokedex_number'])

data = {'moves': moves, 'items': items, 'species': species, 'jaSpecies': ja_species, 'charmap': charmap, 'alolaDex': alola_dex}
json.dump(data, open(S + '/web/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('moves', len(moves), 'items', len(items), 'species', len(species))
print('unmatched gen<=7 moves:', unmatched_moves[:40])
