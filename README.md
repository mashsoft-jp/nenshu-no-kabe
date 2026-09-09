# 年収の壁

月給・賞与から通常月と年間の手取りを計算するWebアプリ。月給と年間を一つのページで表示し、内訳の各項目から計算式を確認できます。所得税の区分・税率・段階数の変更は、結果の下にあるオプションです。

## このリポジトリ

`mashsoft-jp/nenshu-no-kabe` に、会話で作成したv0.7の分離ソース・テスト・仕様書を初期登録します。アプリの画面・計算はv0.7から変更していません。ソース・承認済み仕様・変更履歴はこのリポジトリで管理します。

初期登録ブランチ：`chore/import-v0.7-project`。確認用PRがmainにマージされるまでは、このブランチを開発対象として参照してください。初期登録だけでは一般公開サイトやクラウド実行環境は作成されません。

## ビルド

作業環境のリポジトリルートで実行します。クラウドの作業環境でも同じコマンドです。ユーザーのPCへのダウンロードは必須ではありません。

```sh
python3 build.py
```

生成される `index.html` が実行ファイルです。生成物はGit管理から除外し、JS/CSS/HTMLの分離ソースを編集します。初期登録時のビルドは元の `nenshu-no-kabe-2026-v07.html` とバイト単位で一致することを確認します。

## テスト

```sh
node test-monthly.cjs
node test-policy.cjs
node test-unified.cjs
```

UIテストにはPython版PlaywrightとChromiumが必要です。実行環境を用意した後、次を実行します。

```sh
python3 build.py
python3 test-unified-ui.py
```

Chromiumの場所を指定する場合は環境変数 `CHROMIUM_PATH` を使用します。今回の初期登録にはGitHub Actionsワークフローは含めていません。検証記録は `docs/VERIFICATION.md` を参照してください。

## 画面確認

Node.js・Pythonが使える作業環境内で、ビルドしたHTMLだけを専用ディレクトリにコピーして配信できます。

```sh
python3 build.py
mkdir -p preview
cp index.html preview/index.html
python3 -m http.server 8000 --bind 127.0.0.1 --directory preview
```

これは開発用の確認方法です。クラウド環境ではポート8000の非公開プレビューを使用し、リポジトリ本体・認証情報・利用者設定を公開しないでください。一般公開、Codespaces等の有料環境作成、自動デプロイは別途確認して進めます。

## 主なファイル

| ファイル | 内容 |
| --- | --- |
| `unified-view.html` / `unified-ui.js` | 統合画面・UI処理 |
| `base.css` / `policy.css` / `unified.css` | スタイル |
| `monthly-engine.js` | 月次計算部 |
| `policy-engine.js` | 年間税額・仮想制度の計算部 |
| `unified-engine.js` | 月給・賞与を統合する計算部 |
| `build.py` | 単体HTML生成 |
| `test-*.cjs` / `test-unified-ui.py` | 計算・画面の回帰テスト |
| `PROJECT.md` / `docs/SPEC.md` | プロジェクト概要・仕様 |
| `docs/DECISIONS.md` / `docs/BACKLOG.md` | 確定事項・開発課題 |
| `AGENTS.md` / `CLAUDE.md` / `docs/HANDOFF.md` | AI開発ルール・引き継ぎ |
| `SOURCES.md` / `SOURCE-MANIFEST.json` | 既存の資料一覧・v0.7検証用ハッシュ |

## 計算範囲と注意

現在は20〜64歳、配偶者・扶養なし、協会けんぽ・厚生年金に加入済みの給与所得モデルです。通常月と年間は対象期間・計算方式が異なり、年間表示は実際の1〜12月の振込総額ではありません。社会保険加入・被扶養者認定の「壁」は未実装です。

画面の制度確認日や `SOURCES.md` はv0.7から引き継いだ情報です。今回の登録・テスト通過によって最新法令への完全準拠を保証するものではありません。公開前の独立検算は `docs/BACKLOG.md` のCALC-001 / QA-001として残しています。

入力値の外部送信・自動保存・アクセス解析はありません。設定は利用者の明示操作でJSON保存します。公式資料のリンクを開くと外部へ通信します。

ライセンス・一般公開・ホスティング・独自ドメイン・フレームワーク移行は未決定です。
