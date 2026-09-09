# GitHub Pages

2026-09-09のユーザー依頼「GitHub Pagesにしてほしい」に基づく公開構成。アプリの画面・計算ロジックはv0.7のまま変更しない。

## 公開対象

リポジトリはprivateを維持する。GitHub Pagesで配信するのは `build.py` から生成する `index.html` だけ。HTML内にアプリのJavaScript・CSSが含まれるため、配信したクライアントコードは閲覧者から読める。仕様書・開発資料・テスト・Git履歴・利用者のJSON設定を公開用成果物へ含めない。

標準の公開予定URL：

```text
https://mashsoft-jp.github.io/nenshu-no-kabe/
```

このURLの記載やワークフローの追加だけでは公開完了を意味しない。独自ドメインは設定しない。Pages設定・ワークフローのmainへのマージ・デプロイ成功・実URLでの確認が必要。

通常のPagesサイトは、元のリポジトリがprivateでもWebサイトとして公開される。非公開プレビューとは異なる。privateな組織リポジトリからのPagesはGitHub Team / Enterprise等の対応プランが必要であり、契約状況はこの変更では確認・変更しない。アップグレードを求められた場合は、勝手に契約やリポジトリの可視性を変更せずユーザーへ確認する。

## 初回設定

リポジトリ管理者がGitHub上で行う。

1. `https://github.com/mashsoft-jp/nenshu-no-kabe/settings/pages` を開く。
2. **Build and deployment → Source** を **GitHub Actions** にする。
3. この設定PRのCIとCursor Bugbotの結果を確認してからmainにマージする。
4. **Actions → GitHub Pages** のmain向け実行が成功したことを確認し、`github-pages`環境に表示されたURLを開く。

自動生成のワークフローを追加する必要はない。既存の `.github/workflows/pages.yml` を使う。Pagesを有効にする前にデプロイが失敗した場合は、有効化後に失敗したmain向け実行を **Re-run all jobs** するか、ワークフローの **Run workflow** でmainを選ぶ。

可能な場合は **Settings → Environments → github-pages** のデプロイ対象をmainに限定する。このワークフロー自体もmain以外からは公開しない。既存の保護ルールを無効化しない。

## ワークフロー

`.github/workflows/pages.yml` を使用。

- main向けPR：月額・年額・統合の計算テスト、単体HTMLのビルド、公開ファイル検査のみ。Pages用アップロードとデプロイは実行しない。
- mainへのpush：同じ検証に成功した後、Pages用成果物をアップロードしてデプロイする。
- 手動実行：main選択時のみ公開。その他のブランチでは検証のみ。

生成HTMLはrunnerの一時ディレクトリ `nenshu-no-kabe-site` に1ファイルだけコピーする。公開前に、ファイルが `index.html` だけであること、シンボリックリンクではないこと、元のビルド出力とバイト単位で一致することを検査する。アップロード対象を `.` やリポジトリルートに変更しない。

buildは `contents: read` のみ。deployだけに `pages: write` と `id-token: write` を付ける。チェックアウトした認証情報は永続化しない。PAT・追加シークレットやリポジトリ書き込み権限は不要。Pages初回有効化のためにトークンを埋め込まない。

GitHub公式ActionsをコミットSHAで固定し、Python 3.12 / Node.js 24 / ubuntu-24.04を指定する。同一refの実行は直列化し、実行中のデプロイを途中キャンセルしない。各ジョブのタイムアウトは10分、Pages成果物の保持は1日。Actionsの利用枠・課金はGitHub契約に従い、この設定では予算や課金設定を変更しない。

## 検証範囲

ワークフローでは以下を毎回実行する。

```sh
node test-monthly.cjs
node test-policy.cjs
node test-unified.cjs
python3 build.py
```

既存のPlaywright UIテストは今回のワークフローには含めない。HTTP配信後の動作確認では、`/nenshu-no-kabe/` 配下で給与・賞与の入力、項目詳細、税制オプション、JSON保存・読込、CSV、コピーを確認する。実URLでのデプロイ確認と作業環境のテスト結果は区別する。

この変更はホスティング対応であり、税制の独立検証ではない。CALC-001 / QA-001等は未完了のまま残す。公開しても給与計算・税務申告の確定値として案内しない。

## 更新・復旧

以後は変更ブランチからPRを作り、CI・Bugbot・必要な確認を経てmainへマージすると更新される。PRを作っただけでは公開サイトは変わらない。

計算テストやビルドが失敗するとdeployは開始しない。問題がある公開内容を戻す場合はmainの該当変更をrevertするPRを作り、確認後に再デプロイする。直ちに公開停止する必要がある場合は管理者がPages設定からUnpublish siteを行う。削除や保護ルール変更を自動実行する処理は入れない。

入力した給与情報の外部送信・アクセス解析はアプリへ追加しない。ただし、Webサイトの読み込みはGitHubのホスティングへの通信を伴い、GitHub側のアクセスログ等はアプリ内計算とは別。ブラウザに返すHTMLに実ユーザーの入力値を埋め込まない。

## GitHub公式資料

- 公開元の設定：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- カスタムワークフローと利用可能プラン：https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- configure-pages：https://github.com/actions/configure-pages
- upload-pages-artifact：https://github.com/actions/upload-pages-artifact
- deploy-pages：https://github.com/actions/deploy-pages
