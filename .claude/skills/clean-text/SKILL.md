---
name: clean-text
description: 보이지 않는 문자(제로폭 문자, 특이 공백, 방향 제어 문자, 소프트 하이픈, BOM 등)를 찾아 보여주고 정리한다. 사용자가 /clean-text 로 직접 부를 때만 사용한다.
disable-model-invocation: true
---

# 보이지 않는 문자 정리

사용자가 준 글(붙여넣은 텍스트 또는 파일)에서 눈에 보이지 않아 서식을 깨뜨리는 문자를 찾아 정리한다.

## 순서

1. 대상 준비
   - 붙여넣은 글이면 스크래치 파일에 그대로 저장한다.
   - 파일이면 그 경로를 쓴다.
2. 먼저 검사만 한다:
   ```bash
   python3 "${CLAUDE_SKILL_DIR:-.claude/skills/clean-text}/scripts/clean_text.py" --check 입력파일
   ```
   어떤 문자가 몇 개, 몇 번째 줄에 있었는지 사용자에게 짧게 표로 알려준다.
3. 정리한다:
   ```bash
   python3 "${CLAUDE_SKILL_DIR:-.claude/skills/clean-text}/scripts/clean_text.py" 입력파일 -o 출력파일
   ```
   - 원본 파일을 덮어쓰려면 사용자가 원할 때만 `--in-place` 를 쓴다.
   - 붙여넣은 글이면 정리된 글을 답변에 그대로 돌려준다.

## 처리 규칙 (스크립트가 하는 일)

- 삭제: 제로폭 공백/연결자/비연결자(U+200B~U+200D), 단어 결합자(U+2060), BOM(U+FEFF), 소프트 하이픈(U+00AD), 방향 제어 문자(U+200E/F, U+202A~E, U+2066~9), 기타 서식 문자(Cf)
- 일반 공백으로 바꿈: NBSP, 전각 아닌 특이 공백(U+2000~U+200A, U+202F, U+205F 등)
- 줄바꿈 통일: CRLF/CR → LF, U+2028/U+2029 → 줄바꿈
- 그대로 둠: 한글, 이모지(이모지 안의 ZWJ·이체 선택자는 보존), 전각 공백(U+3000)은 `--keep-ideographic` 기본값으로 보존
- `--trim` 을 주면 줄 끝 공백도 지운다.
