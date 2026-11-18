# AI usage

A status-bar block with how much of each Claude and Codex plan window is used, for the accounts signed in on the active space's machine. Agents on a remote machine spend that machine's accounts, so a space on it shows those. Each window gets a slim bar with a pace tick, so you can see at a glance whether you're spending faster than the clock. A badge flags extra spend. Hovering opens a panel with reset times, extra usage, credits and links to each dashboard. It refreshes every 5 minutes.

Thanks to [nozikov/herdr-usage-limits](https://github.com/nozikov/herdr-usage-limits) (MIT) for the tick bars and the hover panel this follows, and to [steipete/CodexBar](https://github.com/steipete/CodexBar) for the way it reads the numbers.

![AI usage](preview.png)

## What you see

- A 28px block on the `chrome` background with a 1px `border` line on top, at the right end of a status row. With the `fit` prop it is exactly as wide as what it shows, and 0px when it shows nothing. Its content is right-aligned, text 11.8px, `dim`: a 1×14px `border` divider at its left edge that sets it apart from the block before it, 14px, the accounts, and 14px of padding at the right.
- Per account, 14px apart: its name (`claude`, `codex`), then 8px apart:
  - per window, 4px apart: its label at 10.5px (`5h`, `7d`, or the model's name for a model-scoped weekly window, `Opus`); a 24×4px bar on a `border` track, filled to the percent used in `ansi2` (green) under 75%, `ansi3` (amber) from 75% and `ansi1` (red) from 90%, the same steps as pod-stats; on the bar a 1×8px `foreground` tick at 75% opacity, at the share of the window's time that has passed (a fill past its tick is using the window faster than the clock); the percent used, `foreground`, or amber or red with its bar; and, once amber or red, the time to reset (`2d 10h`, `38m`);
  - for Claude, `+$42` once extra usage this month is above zero: `dim`, amber from 75% of the monthly cap, red from 90%.
- An account whose last reading couldn't be refreshed is drawn at 55% opacity. One whose first probe was rate-limited or had no network shows a `dim` `…` after its name until the retry. One with no reading to be had shows a red `!`. One that isn't on the machine (no token and no CLI) is left out. With neither account, the block is empty.
- Hover, after 350ms: a panel above the block, anchored at its bottom right: 460px wide, `popover` background, 1px `border`, 8px radius, 12px padding, text 12px. Per account, with 1px `border` rules between them:
  - its name, semibold; the plan as a small `raised` badge in `accent` (`pro`, `plus`); and a `Usage dashboard ↗` link in `accent` at the right;
  - in `dim` 11px: `via API · updated 4m ago` (or `via CLI`), plus `· couldn't refresh: rate-limited (HTTP 429)`, `: no network` or `· machine unreachable` when stale. While it waits for its first answer, instead: `rate-limited (HTTP 429), retrying in 1m`;
  - a line per window: the long name (`5-hour`, `Weekly`, `Weekly · Opus`) in `muted`, a 110px bar with its tick, `59% left` in its color, and the time to reset with its local clock time (`3h 21m · 18:00`, `6d 13h · Wed 04:00`) in `dim`;
  - Claude: `Extra usage`, a bar of spend over the cap, `$42.10` in its color, `of $50 · resets Jan 1`; its hover explains that the reset date is assumed. Then `Saved resets: 1 available · next expires Jan 20`;
  - Codex: `Credits` with the balance, `unlimited` or `available`. Then `Reset credits: 2 available · next expires Jan 12`;
  - or `! Couldn't read its usage` in red.
- At the bottom, after a rule: `↻ Refresh` at the right, `↻ Refreshing…` in `dim` while a probe runs.

## How it behaves

- Agent statuses play no part. The panel opens on hover and stays open while the pointer is on it (300ms close delay), so its link and button can be clicked. `Usage dashboard ↗` opens claude.ai/settings/usage or Codex's analytics page in the browser. `↻ Refresh` probes the active machine now. There are no keys.
- A 1s timer checks whether the active space's machine is due: never read, or read 5 minutes ago. A probe with no fresh reading is retried after 1 minute, except when rate-limited (HTTP 429): then it waits 5 minutes, doubling while the limit lasts, up to 30. One probe at a time.
- The last reading of every machine is kept, so a space switch shows that machine's accounts at once. It probes again only when that machine is due, since Anthropic's endpoint throttles frequent polling.
- Where the numbers come from, per account, as CodexBar does:
  1. its usage API, with the OAuth token its CLI saved;
  2. the CLI, only when there is no token or the API refuses it (401/403). The CLI owns its login, so this also refreshes an expired token, and the next probe's API call works again. It gives the windows only: no badges, extra usage or credits;
  3. on anything else (429, 5xx, no network), or when the machine can't be reached, the last reading stays, marked stale with its age. With no reading yet, it waits for the retry a minute later, showing `…`.
- It redraws once a minute, so the ticks, countdowns and ages move between probes. A probe takes about 1.5s through the APIs, about 3s through the CLIs.

## Built from

- `mods/ai-usage/mod.json`: `place: none`, title "AI usage".
- `mods/ai-usage/probe.js`, the only file that knows where the numbers come from:
  - `PROBE`, a POSIX sh script printing a `--- claude` and a `--- codex` section, each starting with what answered (`api`, `cli`), `stale <HTTP status>` or `failed`, and empty when the machine has neither a token nor that CLI. `--- claude.plan` and `--- codex.resets` follow.
  - Claude, API: the `accessToken` inside `claudeAiOauth`, never another `accessToken` (the JSON holds one per signed-in MCP server), from `$CLAUDE_CONFIG_DIR/.credentials.json` or `~/.claude/.credentials.json`, else the macOS Keychain item `Claude Code-credentials`. `GET https://api.anthropic.com/api/oauth/usage?cedar_ember=1` with `Authorization: Bearer …`, `anthropic-beta: oauth-2025-04-20` and `User-Agent: claude-cli/<claude --version> (external, cli)`; on 400/403, once more without `cedar_ember=1`. The plan is `claudeAiOauth.subscriptionType`.
  - Claude, CLI: `claude -p --safe-mode --no-session-persistence --strict-mcp-config --settings '{"remoteControlAtStartup":false,"disableAllHooks":true}' --input-format stream-json --output-format stream-json --verbose`, fed one `{"type":"control_request",…,"request":{"subtype":"get_usage","skip_behaviors":true}}` from a file, read until its `control_response`, then killed. No prompt or model time, no session file, no hooks, MCP servers or Remote Control.
  - Codex, API: `tokens.access_token` and `tokens.account_id` from `$CODEX_HOME/auth.json` (default `~/.codex`). `GET https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer …`, `ChatGPT-Account-Id` and `User-Agent: codex-cli`. Then, best effort, `GET …/wham/rate-limit-reset-credits` for the credits' expiry.
  - Codex, CLI: `codex app-server` over stdio JSON-RPC: `initialize`, `initialized`, `account/rateLimits/read` (id 2).
  - Every token reaches curl on stdin (`-H @-`), never a command line. Nothing refreshes a token, redeems a reset or writes a credential file.
  - `parse` gives each account as null, `{ stale }`, `{ error }`, or `{ via, plan, windows, resets, extra, credits }`. Claude's windows come from the `limits` array (`kind` `session` 5h, `weekly_all` and `weekly_scoped` with `scope.model.display_name` 7d; `percent`; `resets_at`), falling back to `five_hour`/`seven_day`. Saved resets: `resets_left` summed over the `cedar_ember.grants` that aren't `paused`, have started and haven't ended, when `eligible`; the soonest `ends_at` of those with resets left. Extra usage: `extra_usage.used_credits` and `monthly_limit` over `10^decimal_places`, when `is_enabled`. Codex's windows come from `rate_limit.primary_window`/`secondary_window` (`used_percent`, `reset_at`, `limit_window_seconds`), or the CLI's `rateLimits.primary`/`secondary`. Credits: `credits` when `has_credits`. Reset credits: the `available` entries of the reset-credits list, else `rate_limit_reset_credits.available_count`.
  - `merge` keeps the last reading as stale, or marks the account `pending` when there's none; `level`, `elapsed` (the tick: `1 - (resets - now) / length`, clamped), `nextMonth`, `money`, `until`, `clock`, `date` and `ago` format.
- `mods/ai-usage/main.js`: a `View` with `init`, `tick`, `refresh`, `summary` (the row), `details` (the panel), `fit` and `render`. The row and panel sit in a `HoverCard` from `gpui-base`: `HoverCard.new("ai-usage-panel").anchor("bottom_right").open_delay(350).close_delay(300).trigger(row).content(panel)`. It uses `exec("sh", ["-c", PROBE], { on, timeout: 60000 })` on the active space's machine, `cx.open_url`, `theme()` tokens `chrome`, `border`, `dim`, `muted`, `foreground`, `popover`, `raised`, `accent`, `hover`, `ansi2`, `ansi3`, `ansi1`, `.tooltip`, `cx.timer.every`, `cx.spawn`, `cx.notify`, `checking()`, `props()` and `run()`.
  The block sizes itself to that content when the layout passes its block id as the `fit` prop: the content row reports its own width with `on_size_change`, and the mod sends `run("layout.resize", { id, px })` when it changes, 0px when there's nothing to show.
- In a layout, a block at the right end of a 28px status row:
  ```json
  { "id": "ai-usage", "type": "block", "size": { "px": 560 }, "content": { "mod": "ai-usage", "props": { "fit": "ai-usage" } } }
  ```
- It reads Claude Code's and Codex's OAuth tokens and calls `api.anthropic.com` and `chatgpt.com`, and runs `claude` and `codex` only as the fallback. It also runs `sh`, `tr`, `sed`, `tail`, `cut`, `curl`, `mktemp`, `sleep`, `touch` and, on macOS, `security`. No icons or other files.

## Watch out

- Width: with `fit`, the block follows its content, from about 550px on a normal day to about 780px at its widest (every window amber or red with a countdown, a six-letter model name, `+$X`). `fit` must name the block's own id; its resizes are window state, not edits to the layout file, and override a manual resize of that block. Without `fit` the block keeps its `px`, and content wider than it is clipped at its left edge.
- `/api/oauth/usage`, `cedar_ember`, `get_usage` and `wham/*` are all undocumented and can change. Each is read defensively: an unexpected reply shows `!` for that account rather than wrong numbers.
- The CLI fallback starts a full `claude` (about 0.6s and 270MB). While it runs, it is listed as a local session in Claude Code's own session list.
- Claude doesn't say when extra usage resets. Like CodexBar, it assumes the 1st of next month at 00:00 UTC.
- `codex app-server` quits at the end of its input before it answers, so the probe holds the input open until its reply arrives (at most 15s), and app-server then takes about 1.5s to exit.
- `exec` with `on` runs through that machine's herdr-core, with the core's environment: `curl`, and `claude` and `codex` for the fallback, must be on the core's `PATH`.
- The macOS Keychain read can raise an access prompt if the item's access list doesn't include `security`.
- A `HoverCard` opens only on hover and can't be opened from a script, so `herdr-app check` doesn't draw the panel. To check it, check a scratch copy that seeds a reading while `checking()` and also draws `details(...)` inline.

## Done when

- `herdr-app check mods/ai-usage` passes, and so does a scratch copy that seeds a reading (amber and red windows, extra spend, a stale account, a pending one, an unreadable one) and draws the panel inline.
- On a machine with both accounts signed in, the panel says `via API` for both, and the percentages match `/usage` in Claude Code and `/status` in Codex. Each tick sits at the share of its window's time gone.
- With the Claude token unreadable or refused, Claude says `via CLI` and still has its windows. Likewise Codex.
- With no network, both accounts keep their last reading, dimmed, with `couldn't refresh (no network)`.
- A window at 75% or more turns amber and shows its countdown; at 90%, red. `+$X` shows once there is extra spend. Saved resets and reset credits show in the panel only.
- A first probe that is rate-limited shows `…`, not `!`, and the panel says when it retries.
- `Usage dashboard ↗` opens the dashboard, and `↻ Refresh` probes at once.
