# herdr-extensions

Mods and layouts for the [Herdr app](https://herdr.dev), the desktop client of herdr-core. Each folder is one extension, laid out like `~/.config/herdr-app`, with a `RECIPE.md` (the brief an agent builds it from) and a `preview.png`.

| Extension | Kind | What it shows |
|---|---|---|
| [`pod-stats`](pod-stats) | mod | CPU, memory and disk of the active space's machine against its own cgroup limits, so a container shows its limits rather than the node's |
| [`ai-usage`](ai-usage) | mod | How much of each Claude and Codex plan window is left for the accounts on the active space's machine, with reset times on hover |
| [`main-stats`](main-stats) | layout | Herdr's `main` with `ai-usage` and `pod-stats` at the right of its status bar |

Both mods follow the active space: switching to a space on another machine shows that machine's last numbers at once, then refreshes them.

**What they run.** Herdr asks you to know this before you add a mod:
- `pod-stats` runs a small `sh` script on the active space's machine through its herdr-core. The script reads `/sys/fs/cgroup` and runs `df "$HOME"`. It makes no network calls.
- `ai-usage` runs a `sh` script there that reads Claude Code's OAuth token (its credentials file, or the macOS Keychain) and calls `api.anthropic.com/api/oauth/usage` with `curl`. It also asks `codex app-server` for Codex's rate limits.

## Install

Ask the agent in your Herdr window, for one extension:

> Read `~/.config/herdr-app/AGENTS.md`, then add this mod: https://github.com/mexcool/herdr-extensions/tree/main/pod-stats

For the layout, which brings both mods:

> Read `~/.config/herdr-app/AGENTS.md`, then add this layout: https://github.com/mexcool/herdr-extensions/tree/main/main-stats

Or by hand, keeping a checkout you can `git pull`:

```sh
git clone https://github.com/mexcool/herdr-extensions
cd herdr-extensions
mkdir -p ~/.config/herdr-app/mods ~/.config/herdr-app/layouts
ln -sfn "$PWD/pod-stats/mods/pod-stats" ~/.config/herdr-app/mods/pod-stats
ln -sfn "$PWD/ai-usage/mods/ai-usage" ~/.config/herdr-app/mods/ai-usage
ln -sf "$PWD/main-stats/layouts/main-stats.json" ~/.config/herdr-app/layouts/main-stats.json
herdr-app do layout.switch '{"name":"main-stats"}'
```

Herdr follows the links. It saves a deliberate layout edit (docking a mod, `layout.set`) through the link into the checkout. It also writes `gpui-kit.d.ts` and `jsconfig.json` into each mod folder; `.gitignore` covers them. `ctrl-shift-l` cycles back to your previous layout.

The mods have no settings. To put them in your own layout, add a block for each to a 28px status row. The recipes have the JSON.

## License

[Apache-2.0](LICENSE)
