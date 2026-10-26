# OSVによる依存関係の修正

自動修正または検証が完了していません。手動対応が必要なDraft PRです。

| パッケージ | 更新前 | 更新後 | 検出された脆弱性 |
| --- | --- | --- | --- |
| body-parser | 2.3.0 | 2.4.0 | GHSA-27r3-jxmh-p828 |
| undici | 7.29.1 | 7.30.1 | GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c |


| 検証 | 結果 |
| --- | --- |
| 依存関係のインストール | failure |
| OSV再診断 | skipped |
| ESLint | skipped |
| 型検査 | skipped |
| テスト | skipped |
| externalのビルド | skipped |
| internalのビルド | skipped |

[実行ログ](https://github.com/TMed-IT/auth/actions/runs/40271493971)

このPRの変更に対する検証はPR作成前に上記のActions実行内で行っています。自動マージは行いません。
