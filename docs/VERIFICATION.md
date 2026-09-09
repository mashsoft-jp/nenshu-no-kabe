# 初期移行の検証

実施日：2026-09-09。前回作成した `nenshu-no-kabe-project-starter.zip` を作業環境に展開し、ビルドと既存回帰テストを実行した。ユーザーのPCではなく、この作業の実行環境での結果。

| 検証 | 結果 |
| --- | --- |
| `python3 build.py` | PASS。161,497 bytesの単体HTMLを生成 |
| 生成HTMLと元のv0.7 HTMLを `cmp` で比較 | バイト単位で一致 |
| `node test-monthly.cjs` | PASS。1,316シナリオ、既存例・等級・境界・入力検証 |
| `node test-policy.cjs` | PASS。6,015 assertions |
| `node test-unified.cjs` | PASS。2,065 checks |
| `python3 test-unified-ui.py` | PASS。1440 / 1024 / 768 / 390 / 320px、135 checks＋Playwright assertions |

ブラウザ検証はChromiumにHTMLを `set_content` で読み込む既存方式。合成データのみ使用。既存テストはJavaScriptエラーや不要なネットワーク要求も検査する。

移行時はGitHubに登録した各ソースのGit blob SHAをローカルの原本と照合する。`SOURCE-MANIFEST.json` の `index.html` は生成後に検査する対象で、Gitへコミットする対象ではない。資料の移行に伴いREADME、概要、開発手順、決定事項・課題・検証記録をGitHub運用に更新した。

## 未実施と注意

GitHub Actions上ではまだ実行していない。クラウド開発環境の起動、HTTP配信・file://直接起動の網羅確認、Safari / Firefox / 実機モバイル検証、公開サイトの動作確認は今回実施していない。

`TEST-RESULTS.md` はv0.7作成時の既存記録として保持した。そこにある追加ブラウザ確認のすべてを今回個別に再実施したわけではない。

テスト通過は実装と期待値の整合性を示すもので、法令準拠の独立した保証ではない。制度・適用時期・端数の独立検算はCALC-001とQA-001に残す。
