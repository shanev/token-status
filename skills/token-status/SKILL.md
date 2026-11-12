---
name: token-status
description: Check Claude Code, Codex, and Grok Build plan usage, remaining allowance, reset times, and whether current usage will exhaust a limit before reset. Use for subscription usage questions, not API billing or counting tokens in text.
---

# Token status

Use the `token-status` CLI to read live usage on the machine where the user
is signed in to the relevant providers. Requires Python 3 on macOS or Linux
and the CLI from https://github.com/shanev/token-status.

## Read usage

Run once with JSON output; the default terminal mode keeps refreshing:

```sh
token-status --json
token-status --json codex
token-status --json claude
token-status --json grok
```

Choose a single provider when requested; otherwise fetch all. If the command
is missing from PATH, check `~/.local/bin/token-status` or use an existing
checkout's `token-status` script by its actual path. A skills installer copies
this skill's instructions, not the CLI. If the CLI is unavailable, explain
that prerequisite and link to the repository's install instructions; do not
invent usage or silently install software.

## Interpret the result

The top-level `fetched_at` is the observation time. Each provider contains
`limits`, `note`, and `error`. Each limit contains:

- `label`: the limit's name and scope. Keep separate windows and model pools separate.
- `percent`: percentage used; remaining allowance is `max(0, 100 - percent)` percent.
- `resets_at`: ISO timestamp, or null when unknown.
- `window_seconds`: duration of the limit window, or null.
- `pace`: null or an object with `elapsed_pct`, `projected_pct`, and `hits_limit_at`.

Report usage and remaining allowance per relevant limit, plus reset times
in the user's timezone when known (otherwise label the timestamp's timezone).
If `hits_limit_at` is present, highlight the estimated exhaustion time.
Otherwise use `projected_pct` to explain the estimated usage at reset.
Pace assumes the average usage rate since the window began continues; it is
an estimate, not a guaranteed deadline. Null pace or projection means there
is insufficient information, often because the window has just started.
A limit already at 100% is exhausted even if `hits_limit_at` is null.
These percentages do not imply an exact count of tokens or requests remaining.

## Provider errors

The CLI can exit successfully while individual providers return an `error`.
Report those providers as unavailable and still summarize successful ones.
An empty `limits` list is not evidence of zero usage.

For `codex not found`, explain that the installed Codex executable must be
discoverable through PATH, common install locations, or `CODEX_BIN` set to
its executable path. For authentication failures, direct the user to the
provider's own sign-in flow. Never display credential files or access tokens.
The CLI uses existing provider logins and may refresh an expired Grok login.
