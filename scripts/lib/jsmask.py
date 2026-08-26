"""JS ソースのうち **コードでない部分**（コメント・文字列・テンプレート・正規表現）を
空白へ潰す。位置は1対1で保つので、行番号と桁がそのまま使える。

【なぜ要るか】この工程で計測器を4度目に間違えたのが、
**コメント中のファイル名まで拾って 102 件**を出した走査だった。
検査の中身より先に、まず「どこがコードか」を間違えない。

【正規表現かどうか】直前の意味のあるトークンで決める（標準的な heuristic）。
識別子 / 数値 / `)` / `]` の直後の `/` は除算、それ以外は正規表現。
`}` は曖昧（ブロックの後なら正規表現、オブジェクトリテラルの後なら除算）なので
**正規表現側に倒す** —— この用途では正規表現を除算と読むほうが害が大きい
（`/.../ && x` のような形を取り逃す）。
"""
import re

_IDENT_END = re.compile(r'[A-Za-z0-9_$\)\]]')
_KEYWORD_BEFORE_RE = {'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
                      'void', 'throw', 'case', 'do', 'else', 'yield', 'await'}


def mask(src: str) -> str:
    out = list(src)
    i, n = 0, len(src)
    prev_tok = ''          # 直前の意味のあるトークン（末尾の1文字か語）
    while i < n:
        c = src[i]
        # 行コメント
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = ' '
            i = j
            continue
        # ブロックコメント
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                if out[k] != '\n':
                    out[k] = ' '
            i = j
            continue
        # 文字列
        if c in ('"', "'"):
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == c or src[j] == '\n':
                    break
                j += 1
            for k in range(i + 1, min(j, n)):
                if out[k] != '\n':
                    out[k] = ' '
            i = min(j + 1, n)
            prev_tok = '"'
            continue
        # テンプレート（${} の中はコードなので残す）
        if c == '`':
            j = i + 1
            depth = 0
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    # ${ ... } はコードとして残す。対応する } まで飛ばす
                    k, d = j + 2, 1
                    while k < n and d:
                        if src[k] == '{':
                            d += 1
                        elif src[k] == '}':
                            d -= 1
                        k += 1
                    j = k
                    continue
                if src[j] == '`':
                    break
                if out[j] != '\n':
                    out[j] = ' '
                j += 1
            i = min(j + 1, n)
            prev_tok = '`'
            continue
        # 正規表現 or 除算
        if c == '/':
            is_re = True
            if prev_tok and (_IDENT_END.match(prev_tok[-1]) and prev_tok not in _KEYWORD_BEFORE_RE):
                is_re = False
            if prev_tok == '"' or prev_tok == '`':
                is_re = False
            if is_re:
                j, in_class = i + 1, False
                while j < n:
                    if src[j] == '\\':
                        j += 2
                        continue
                    if src[j] == '[':
                        in_class = True
                    elif src[j] == ']':
                        in_class = False
                    elif src[j] == '/' and not in_class:
                        break
                    elif src[j] == '\n':
                        j = i        # 行をまたぐ = 正規表現ではなかった
                        break
                    j += 1
                if j > i:
                    for k in range(i, min(j + 1, n)):
                        out[k] = ' '
                    # フラグ
                    k = j + 1
                    while k < n and src[k].isalpha():
                        out[k] = ' '
                        k += 1
                    i = k
                    prev_tok = 'x'   # 値
                    continue
            prev_tok = '/'
            i += 1
            continue
        if c.isspace():
            i += 1
            continue
        # 語
        if c.isalnum() or c in '_$':
            j = i
            while j < n and (src[j].isalnum() or src[j] in '_$.'):
                j += 1
            prev_tok = src[i:j]
            i = j
            continue
        prev_tok = c
        i += 1
    return ''.join(out)
