# FAQの質問比較を読み取り専用で実装

2026-09-04。オーナーの「人への依頼：あなたのおまかせ」を受けた技術調査。AIによる意味の照合であり、独立した人間による正解ラベルではない。

## 何を数えるか

手書きFAQPageの質問と、HTML本文のFAQ質問要素を言語別に比較する。完全一致しないものを候補として返す。候補を欠陥と断定せず、公開HTMLを上書きしない。追加の本文質問はJSON-LDの欠陥として数えない。inLanguageがない複数言語schemaは、言語ごとの質問集合の和と比較する。

CSSを実行した可視性、回答の真偽、検索結果への掲載はこの検査の対象外。本文の別節で説明されている質問、主語省略、言い換えは文字列検査だけでは判断しない。

## 実測

- 対象68ページ。完全一致58、差分候補10、読み取り不能0。候補率は10/68（14.7%）。
- 生成対象146ページについて、修正前後の生成payloadがすべてバイト単位で一致。
- 明確に一致すべき検体6件で誤検出0/6、欠落・非表示・別言語などの検体5件で見逃し0/5。読み取り不能2件も区別。これは検体上の測定で、全サイトの誤検出率ではない。
- 実サイトの差分候補10件を本文と照合した結果は以下。10件とも同じ問いへの説明があるため、候補を「内容欠落」と自動断定すると10/10が誤報になる。一方、文字列差分そのものは実在するので、報告では10件を維持する。この比較方式を自動の公開停止条件にはしない。

## 差分候補の照合記録

| ページ | 照合結果 | 内容SHA256 |
|---|---|---|
| `blog/meeting-memo-template.html` | 可視質問の末尾に「使い方は？」が追加されている。同じpost meeting memoの定義を問う質問。 | `14c3943418240d323db54ec15490516b02313b6ba6c3a5d9f14c2e618b215f53` |
| `note-to-email/index.html` | 可視質問の「（自分にメールを送りたい）」は補足。Android対応を問う同じ質問。 | `80d6a5693de06f267b32e8d05e89fee1b36b0ecb4abd18bc0cf5650e12d1acc7` |
| `obsidian/apple-watch-not-working/index.html` | 3問は本文の誤解と回避策の節に対応。ファイルAppと保管庫へのアクセス、ボイスメモ/リマインダーからの非連携、iPhoneを経由する3つの回避策を本文で確認。 | `0599a3896a01795bc13bf41786ff3d830ccf2a589b351123e8fcdf2ad86c547d` |
| `obsidian/compare/index.html` | 「比較する前に、まずObsidianを試すにはどうすればいいですか」と「比較の前に、まずObsidianを試すには」は同じ質問。 | `fd1694aacca24a87ad39e3d119971389f74dc781d437284f794c807e17ed84f1` |
| `obsidian/compare/logseq/index.html` | 同一ページの対象がObsidian/Logseq。本文では主語を省略した「iPhoneだけで使えますか」。 | `5f6390c985a229e246fcffc52b79c77cc10fbacd3ea1fddc3352eb510bc2b154` |
| `obsidian/daily-note/index.html` | 末尾FAQでは主語省略の1問。残る3問は本文の「iPhoneを開かず」の3段階、3ルート比較、声とApple Watchの節に説明がある。末尾FAQだけを読む抽出器の範囲外。 | `2f481ffbabbf73378d6f34c3bce9ff20e5b4e02298e87921d4c5fee880fa8741` |
| `obsidian/getting-started/index.html` | 本文の質問はObsidianという主語と「始める」などを省略。Vault、日本語、登録、PC、iPhoneの各質問は対応している。 | `f406e103948a7b7542caf73629a3762f903e95b149ec7ee0215cc93c4cf975cb` |
| `obsidian/plugins/index.html` | 「数」と「登録数」の言い換え、および公式以外からの導入に関する補足が差分。本文の導入元に関する質問・説明に対応する。 | `80ba54a8e811bf161e2e60777b7dff8791f1ca3fd0206bc2541e927c4559e99a` |
| `obsidian/shortcuts-not-working/index.html` | schemaの8問は末尾FAQではなく本文の「症状別の直し方」に対応。内蔵アクション不在、前面起動、本文エンコード、追記、新規ファイル、保管庫、Watch、オフラインの対処が本文にある。 | `1744ca180b00f932bbb315b459617efd4e13ae15f3de521c511d786d6c06b06e` |
| `obsidian/what-is-vault/index.html` | core-plugins.json直後の空白、「追加」と「足す」、「移すには」の語尾短縮。問いの対象は一致。 | `01c077ba4e32cf08e2fd90166999eebac2e9b20c9ddc18bfcebe1bad4a69751d` |

## 再実行

```sh
python3 scripts/inject_faq_schema.py --audit-questions
python3 scripts/inject_faq_schema.py --selftest
python3 scripts/inject_faq_schema.py --check
```

`--check` は質問比較の件数も出す。既存の空JSON-LD・不正JSON・生成内容の検査は従来どおり失敗を返す。質問差分は報告のみであり、意味を判定する既存の門を弱めたものではない。CLIとCIの両経路から実行される。
