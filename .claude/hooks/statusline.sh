#!/usr/bin/env bash
# Status line: the task clock and the next gate, visible to the viewer of the recording.
# e.g. "T+09:12 | 50:48 left | next: design 11:17 | freeze 11:50"
cat >/dev/null
exec bash "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/clock.sh" --line
