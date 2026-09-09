# 開発手順

対象リポジトリ：`mashsoft-jp/nenshu-no-kabe`。初期移行ブランチは `chore/import-v0.7-project`。mainへのPR確認後にmainを開発基準とする。ユーザーが毎回HTMLやZIPをPCにダウンロードする運用にはしない。

## 必要な実行環境

ビルドはPython 3の標準ライブラリのみ。計算テストはNode.js。UIテストはPython版PlaywrightとChromiumが必要。リポジトリ自体の保存と、コードを実行する環境は別なので、GitHub上に登録するだけでWebサイトが起動するわけではない。

クラウド作業環境の用意後、そのリポジトリルートで次を実行する。ローカルでも同じ手順で再現できるが、必須ではない。

```sh
python3 build.py
node test-monthly.cjs
node test-policy.cjs
node test-unified.cjs
python3 test-unified-ui.py
```

UIテストの依存導入は実行環境内で行う。既存依存の未承認アップグレードや費用の発生を避ける。Chromiumを指定する場合は `CHROMIUM_PATH`。導入していない場合はUIテスト未実行と報告する。

## 画面確認

```sh
python3 build.py
mkdir -p preview
cp index.html preview/index.html
python3 -m http.server 8000 --bind 127.0.0.1 --directory preview
```

ブラウザから作業環境のポート8000へアクセスする。クラウドでは利用サービスの非公開ポート転送を使い、リポジトリルートを公開しない。Pythonの簡易サーバーは開発確認専用。停止はCtrl+C。変更の都度ビルドとコピーを実行して再読み込みする。

## 変更手順

1. 最新ブランチと関連仕様を読み、要望の完了条件を決める。
2. 分離ソースを変更する。生成物 `index.html` を編集しない。
3. ビルド・計算テストを実行する。UI変更は画面・操作も確認する。
4. 仕様・決定事項・検証結果を更新し、作業ブランチからPRを作る。
5. mainへのマージと公開は承認後に行う。

現行v0.7の `SOURCE-MANIFEST.json` は初期移行のバイト一致検証用。今後の承認済み機能変更を禁止するものではない。制度の根拠を更新する場合は出典・確認日・適用期間も記録する。

## 今回まだ行っていないこと

GitHub Actionsの設定・実行、CodespacesやCodexクラウド環境の新規作成、GitHub Issues化、一般公開、自動デプロイ、ライセンス決定。アプリのフレームワーク移行も行っていない。
