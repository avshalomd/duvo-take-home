#!/usr/bin/env bash
# PreToolUse hook on Bash: the screen is being recorded, so a command that would PRINT a secret is refused before
# it runs, with the way to do it safely. Exit 2 blocks the call and hands stderr to the agent; exit 0 lets it run.
# It is a seat belt, not a vault: the rule itself is in CLAUDE.md (check a variable by name only).
input=$(cat)
# Fast path: nearly every command mentions neither an env file nor a secret's name.
case "$input" in *env*|*export*|*\"set\"*|*KEY*|*TOKEN*|*SECRET*|*PASSWORD*|*DATABASE_URL*|*POSTGRES*|*OPENROUTER*|*TYPESAFE*) ;; *) exit 0 ;; esac
printf '%s' "$input" | python3 -c '
import json, re, shlex, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "") or ""
except Exception:
    sys.exit(0)

# An env file that holds values: .env, .env.local, .env.production.local ... but never .env.example.
ENV_FILE = re.compile(r"(?:^|[\s/\x27\"=<(])\.env(?!\.example)(?:\.[\w-]+)*(?=$|[\s\x27\");|&>\\])")
SECRET_VAR = re.compile(r"\$\{?[A-Za-z_]*(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|POSTGRES_URL)[A-Za-z_]*")
PRINTERS = {"cat", "head", "tail", "less", "more", "bat", "nl", "sed", "awk", "cut", "sort", "uniq", "strings",
            "xxd", "od", "hexdump", "paste", "tr", "rev", "base64", "open", "code", "vim", "vi", "nano", "view",
            "diff", "tac", "fold", "column", "jq"}
GREPS = {"grep", "egrep", "fgrep", "rg", "ag"}
SECRET_NAME = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|POSTGRES|OPENROUTER|TYPESAFE")
RECURSIVE = re.compile(r"(?:^|\s)(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)(?=\s|$)")
COUNT_ONLY = re.compile(r"(?:^|\s)(?:-[A-Za-z]*[cqlL][A-Za-z]*|--count|--quiet|--files-with(?:out)?-match(?:es)?)(?=\s|$)")

def words(segment):
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return segment.split()

def program(ws):
    for w in ws:  # skip leading VAR=value assignments
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", w):
            continue
        return w.rsplit("/", 1)[-1]
    return ""

def refuse(why, instead):
    sys.stderr.write("BLOCKED (the screen is recorded): " + why + " " + instead + "\n")
    sys.exit(2)

for segment in re.split(r"\|\||&&|[|;\n]", cmd):
    ws = words(segment)
    prog = program(ws)
    if not prog:
        continue
    touches_env = bool(ENV_FILE.search(segment))
    if touches_env and prog in PRINTERS:
        refuse(prog + " on an env file prints its values.",
               "Check a variable by name only: grep -c \x27^NAME=\x27 .env.local. A value is set by him, with .claude/scripts/set-secret.sh NAME.")
    if touches_env and prog in GREPS and not COUNT_ONLY.search(segment):
        refuse("grep on an env file prints the matching line, value included.",
               "Count instead: grep -c \x27^NAME=\x27 .env.local.")
    # Plain grep -r does not honour .gitignore (the Grep tool and rg do), so a sweep from the repo root for a
    # secret\x27s NAME prints its line from .env.local, value and all.
    if prog in {"grep", "egrep", "fgrep"} and RECURSIVE.search(segment) and SECRET_NAME.search(segment) \
            and not COUNT_ONLY.search(segment) and "--exclude" not in segment and "--include" not in segment:
        positional = [w for w in ws[1:] if not w.startswith("-")]
        if len(positional) < 2 or any(w in (".", "./", "*", "..") for w in positional[1:]):
            refuse("a recursive grep for a secret\x27s name from the repo root also reads .env.local and prints the value.",
                   "Use the Grep tool, or name the directory: grep -rn NAME src.")
    if touches_env and prog in {"python", "python3", "node", "ruby", "perl"} and any(w in ("-c", "-e", "-p") for w in ws):
        refuse("an inline script reading an env file can print its values.", "Check a variable by name only: grep -c \x27^NAME=\x27 .env.local.")
    if prog == "printenv" or (prog in {"env", "export", "set"} and len([w for w in ws if not w.startswith("-")]) == 1):
        refuse(prog + " lists the environment, secrets included.", "Check one variable by name: [ -n \"${NAME:-}\" ] && echo set.")
    if prog in {"echo", "printf"} and SECRET_VAR.search(segment) and ">" not in segment:
        refuse("echo of a secret variable puts its value in a command line, and on screen unless it is piped.",
               "Test for it instead: [ -n \"${NAME:-}\" ] && echo set. A value is set by him: .claude/scripts/set-secret.sh NAME.")
    if prog == "curl" and SECRET_VAR.search(segment) and re.search(r"(?:^|\s)(?:-[A-Za-z]*v[A-Za-z]*|--verbose|--trace\S*)(?=\s|$)", segment):
        refuse("curl -v prints the request headers, the key included.", "Drop -v; use -w \x27%{http_code}\x27 and -o to see the result.")
sys.exit(0)
'
