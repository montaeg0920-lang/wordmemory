#!/usr/bin/env python3
"""보이지 않는 문자를 찾고 정리한다 (표준 라이브러리만 사용)."""
import argparse
import sys
import unicodedata
from collections import Counter

REMOVE = {
    0x00AD: "SOFT HYPHEN",
    0x180E: "MONGOLIAN VOWEL SEPARATOR",
    0x200B: "ZERO WIDTH SPACE",
    0x200C: "ZERO WIDTH NON-JOINER",
    0x200D: "ZERO WIDTH JOINER",
    0x200E: "LEFT-TO-RIGHT MARK",
    0x200F: "RIGHT-TO-LEFT MARK",
    0x2060: "WORD JOINER",
    0xFEFF: "BYTE ORDER MARK",
    **{c: unicodedata.name(chr(c)) for c in range(0x202A, 0x202F)},
    **{c: unicodedata.name(chr(c)) for c in range(0x2066, 0x206A)},
}
TO_SPACE = {0x00A0, 0x2007, 0x202F, 0x205F, *range(0x2000, 0x200B)}
TO_NEWLINE = {0x2028, 0x2029}


def is_emoji_context(text, i):
    """ZWJ·이체 선택자가 이모지 사이에 있으면 보존한다."""
    def emoji_like(ch):
        return ch and (ord(ch) >= 0x1F000 or 0x2600 <= ord(ch) <= 0x27BF)
    prev = text[i - 1] if i > 0 else ""
    nxt = text[i + 1] if i + 1 < len(text) else ""
    return emoji_like(prev) or (emoji_like(nxt) and prev in ("‍", "️"))


def clean(text, trim=False, keep_ideographic=True):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    out, found = [], Counter()
    for i, ch in enumerate(text):
        cp = ord(ch)
        if cp == 0x200D and is_emoji_context(text, i):
            out.append(ch)
        elif cp in REMOVE:
            found[REMOVE[cp]] += 1
        elif cp in TO_SPACE:
            found[unicodedata.name(ch, hex(cp))] += 1
            out.append(" ")
        elif cp in TO_NEWLINE:
            found[unicodedata.name(ch)] += 1
            out.append("\n")
        elif cp == 0x3000 and not keep_ideographic:
            found["IDEOGRAPHIC SPACE"] += 1
            out.append(" ")
        elif unicodedata.category(ch) == "Cf":
            found[unicodedata.name(ch, hex(cp))] += 1
        else:
            out.append(ch)
    result = "".join(out)
    if trim:
        result = "\n".join(line.rstrip(" \t") for line in result.split("\n"))
    return result, found


def report(text):
    rows = []
    for n, line in enumerate(text.replace("\r\n", "\n").split("\n"), 1):
        _, found = clean(line)
        for name, count in found.items():
            rows.append((n, name, count))
    return rows


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input", nargs="?", help="입력 파일 (없으면 표준입력)")
    p.add_argument("-o", "--output", help="출력 파일 (없으면 표준출력)")
    p.add_argument("--in-place", action="store_true", help="입력 파일을 덮어쓴다")
    p.add_argument("--check", action="store_true", help="정리하지 않고 찾은 문자만 보고한다")
    p.add_argument("--trim", action="store_true", help="줄 끝 공백 제거")
    p.add_argument("--normalize-ideographic", action="store_true", help="전각 공백도 일반 공백으로")
    a = p.parse_args()

    if a.input:
        with open(a.input, encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    if a.check:
        rows = report(text)
        if not rows:
            print("보이지 않는 문자를 찾지 못했습니다.")
        for line, name, count in rows:
            print(f"{line}번째 줄\t{name}\t{count}개")
        return

    result, found = clean(text, a.trim, not a.normalize_ideographic)
    target = a.input if a.in_place and a.input else a.output
    if target:
        with open(target, "w", encoding="utf-8") as f:
            f.write(result)
    else:
        sys.stdout.write(result)
    total = sum(found.values())
    print(f"정리한 문자: {total}개" + "".join(f"\n  {k}: {v}" for k, v in found.most_common()), file=sys.stderr)


if __name__ == "__main__":
    main()
