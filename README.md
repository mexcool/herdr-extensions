# herdr-extensions

Mods and layouts for the [Herdr app](https://herdr.dev), the desktop client of herdr-core. Each folder is one extension, laid out like `~/.config/herdr-app`, with a `RECIPE.md` (the brief an agent builds it from) and a `preview.png`.

| Extension | Kind | What it shows |
|---|---|---|
| [`pod-stats`](pod-stats) | mod | CPU, memory and disk of the active space's machine against its own cgroup limits, so a container shows its limits rather than the node's |
| [`ai-usage`](ai-usage) | mod | Each Claude and Codex plan window, read on this computer, as a draining bar of what's left with a pace tick, plus extra spend, and a hover panel with reset times, saved resets, credits and dashboard links. Thanks to [nozikov/herdr-usage-limits](https://github.com/nozikov/herdr-usage-limits) for the tick bars and hover panel this follows, and [steipete/CodexBar](https://github.com/steipete/CodexBar) for the data sources |
| [`space-status`](space-status) | mod | Herdr's `workspace-status` (machine, branch, agents) without its command-palette hint |
| [`tab-names`](tab-names) | mod | Nothing: renames a tab to the `tab.name` label of a terminal in it, so an agent on any machine can name its tab (`hc label "$HC_TERMINAL_ID" tab.name=...`); a tab nobody named takes its first agent's title, a Claude session's name |
| [`main-stats`](main-stats) | layout | Herdr's `main` with `space-status`, `pod-stats` and `ai-usage` in its status bar, and `tab-names` |

`pod-stats` follows the active space: switching to a space on another machine shows that machine's last numbers at once, then refreshes them. `ai-usage` shows the same reading in every space, since the accounts are the same wherever agents run. Both keep their readings in Herdr's shared state, so a reload, a layout switch or a second window shows them at once without probing again.

**What they run.** Herdr asks you to know this before you add a mod:
- `pod-stats` runs a small `sh` script on the active space's machine through its herdr-core. The script reads `/sys/fs/cgroup` and runs `df "$HOME"`. It makes no network calls.
- `ai-usage` reads Claude Code's and Codex's OAuth tokens (their credentials files, or Claude's macOS Keychain item) and calls `api.anthropic.com/api/oauth/usage` and `chatgpt.com/backend-api/wham/usage` and `wham/rate-limit-reset-credits` with `curl`, on this computer, or on the machine its `machine` prop names. Only when a token is missing or refused does it run `claude` (one `get_usage` request in safe mode, no prompt) or `codex app-server` instead. It never refreshes a token or writes a credential file.
- `space-status` runs nothing.
- `tab-names` runs nothing. It renames tabs with Herdr's `tab.rename` when a terminal asks through its `tab.name` label.

## Install

Ask the agent in your Herdr window, for one extension:

> Read `~/.config/herdr-app/AGENTS.md`, then add this mod: https://github.com/mexcool/herdr-extensions/tree/main/pod-stats

For the layout, which brings all four mods:

> Read `~/.config/herdr-app/AGENTS.md`, then add this layout: https://github.com/mexcool/herdr-extensions/tree/main/main-stats

Or by hand, keeping a checkout you can `git pull`:

```sh
git clone https://github.com/mexcool/herdr-extensions
cd herdr-extensions
mkdir -p ~/.config/herdr-app/mods ~/.config/herdr-app/layouts
ln -sfn "$PWD/pod-stats/mods/pod-stats" ~/.config/herdr-app/mods/pod-stats
ln -sfn "$PWD/ai-usage/mods/ai-usage" ~/.config/herdr-app/mods/ai-usage
ln -sfn "$PWD/space-status/mods/space-status" ~/.config/herdr-app/mods/space-status
ln -sfn "$PWD/tab-names/mods/tab-names" ~/.config/herdr-app/mods/tab-names
ln -sf "$PWD/main-stats/layouts/main-stats.json" ~/.config/herdr-app/layouts/main-stats.json
herdr-app do layout.switch '{"name":"main-stats"}'
```

Herdr follows the links. It saves a deliberate layout edit (docking a mod, `layout.set`) through the link into the checkout. It also writes `gpui-kit.d.ts` and `jsconfig.json` into each mod folder; `.gitignore` covers them. `ctrl-shift-l` cycles back to your previous layout.

After a `git pull`, switch layouts away and back (`ctrl-shift-l`), or restart the app, to load the new code: Herdr doesn't see changes through the links.

The mods have no settings. To put them in your own layout, add a block for each to a 28px status row. The recipes have the JSON.

## License

[Apache-2.0](LICENSE)
