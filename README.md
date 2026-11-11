# token-status

Live plan-usage bars for **Claude Code**, **Codex** and **Grok Build** in a terminal pane.

```
Claude
  5-hour session  ↻ 2h 18m (Wed 17:20)
  ██████████░░░░░░░░░░░░░░░░░░░░  35.0%
  Weekly (all models)  ↻ 2d 4h (Fri 20:00)
  ████████████████████░░░░░░░░░░  68.0%
  Weekly (Fable)  ↻ 2d 4h (Fri 20:00)
  ██████████████████░░░░░░░░░░░░  61.0%
Codex
  Weekly  ↻ 23h 40m (Thu 14:42)
  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░   6.0%
Grok
  Weekly  ↻ 20h 35m (Thu 11:36)
  █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   3.0%
```

One Python 3 file, standard library only.

## Use

```sh
token-status            # all three, stacked
token-status claude     # or codex / grok
token-status all 120    # refresh every 120 s (default: 300 for all/claude, 120 for codex/grok)
```

The script restarts itself when its file changes, so edits show up in running panes.

## Install

```sh
git clone https://github.com/shanev/token-status
ln -s "$PWD/token-status/token-status" ~/.local/bin/token-status
```

## Where the numbers come from

Each provider is read with that tool's own login on this machine, from the
same place the tool's own usage screen reads. No tokens are stored or sent
anywhere other than the provider's own server.

| Provider | Login read from | Asks |
|---|---|---|
| Claude | `~/.claude/.credentials.json` | `api.anthropic.com/api/oauth/usage` (Claude Code's `/usage`) |
| Codex | the installed `codex` CLI | `codex app-server` → `account/rateLimits/read` (Codex's `/status`) |
| Grok | `~/.grok/auth.json` | `cli-chat-proxy.grok.com/v1/billing` (Grok's `/usage`); an expired token is renewed with `grok models`, which makes no model call |

None of these are documented public APIs, so they can change without notice.

## Herdr

To bring it up beside the focused pane in [Herdr](https://herdr.dev) 2, bind a key in
`~/.config/herdr-app/keys.json`:

```json
"cmd-shift-u": {"command": "pane.split", "args": {"direction": "right",
  "argv": ["/bin/sh", "-c", "exec \"$HOME/.local/bin/token-status\""]}}
```

Herdr starts the program without your shell's PATH, so the binding uses the
install path. It runs on the machine of the focused pane, so install
token-status there.
