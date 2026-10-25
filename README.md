# ポケモン第7世代変換

PokeEm-expansion-CanuseJP（日本語版 pokeemerald-expansion ハック）のセーブデータ（.sav）から、
PKHeX で読み込める第7世代（サン・ムーン／ウルトラサン・ウルトラムーン）用の `.pk7` ファイルを作る Web ツールです。

**使い方**: https://noctis1008-wq.github.io/PokemeraldTo7gen/ を開いて、セーブデータを選ぶだけです。
ファイルはブラウザの中だけで処理され、どこにも送信されません。

## 変換のきまり

- 第7世代にいないポケモン・すがた（第8世代以降、ガラル・ヒスイ・パルデアのすがたなど）とタマゴは対象外
- 第7世代出身（選んだバージョン・1ばんどうろ・今日）として作る。出会ったレベルはセーブデータのまま（タマゴからかえったポケモンは、あずかりやさんで もらったタマゴを かえした扱い）
- 第7世代にないわざ・持ち物・特性・ボールは外すか置きかえる
- 性格はミント適用後、色違いかどうかはハックでの見た目のまま
- PKHeX の正当性チェックで「不正」と出ることがある

## ファイル

- `index.html`, `app.js` … ツール本体
- `data.json` … 種族・わざ・持ち物の対応表（このハックのビルドから `tools/make_data.py` で作成）

## 出典

- 種族・わざ・持ち物の名前と番号の対応: [PKHeX](https://github.com/kwsch/PKHeX) のテキストリソース
- セーブデータの構造・種族データ: [pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion)
