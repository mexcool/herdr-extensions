# herdr-extensions

Mods and layouts for the Herdr app, published at github.com/mexcool/herdr-extensions. The app's own guide is `~/.config/herdr-app/AGENTS.md` on any machine with the app. It covers the layout format, the mod API (`gpui-kit`, `gpui-base`, `herdr`), and how shared extensions are laid out and added. Read it before changing a mod or layout. The full API types are in the `gpui-kit.d.ts` the app writes into each mod folder it loads (`herdr-app types <mod folder>` writes one too).

## This repo is public

Nothing personal or private goes in: no names, emails, usernames, hostnames, machine or space names, home paths (`/Users/...`, `/home/...`), internal URLs, tokens, or account, plan or company details. Example numbers in docs are illustrative. Check every `preview.png` before committing it: space names, tab titles, branches, paths and terminal text all show up in a screenshot.

## Layout

One folder per extension, laid out like `~/.config/herdr-app`, so adding one is a copy:

```
<mod>/RECIPE.md, preview.png, mods/<mod>/{mod.json, main.js, probe.js}
<layout>/RECIPE.md, preview.png, layouts/<layout>.json
```

A layout uses the mods of the sibling folders and doesn't copy them; its recipe says which to copy. This repo stays off the herdr.dev gallery: don't add the `herdr-mod` or `herdr-layout` topics, which are what list a repo there.

## Mods

- Self-contained: a mod folder gets copied alone into `mods/`, so it imports only `gpui-kit`, `gpui-base`, `herdr` and its own files.
- `probe.js` holds what runs on a machine (`PROBE`, a sh script) and the pure functions that read its output. It imports nothing from Herdr, so Node can run it. `main.js` is the view.
- Follow the active space's machine (`spaces().find(s => s.active)?.machine`, `null` for this computer). Keep the last reading per machine and show the active one's, so a switch is instant and never shows another machine's numbers.
- No timers or `exec` while `checking()` is true (`herdr-app check`).
- Theme tokens only (`chrome`, `border`, `dim`, `foreground`, `ansi3` amber, `ansi1` red), so they suit any theme.
- Status-bar mods are `place: none` blocks for a 28px row: `chrome` background, 1px `border` on top, 14px side padding, 11.8px text, label `dim`.
- Never put a secret on a command line: pass it on stdin (`curl -H @-`).

## Checking a change

1. Run the probe through herdr-core, which is how the app runs it, and read it with the mod's own parser:
   ```sh
   node --input-type=module -e '
     import { PROBE, parse } from "./pod-stats/mods/pod-stats/probe.js";
     import { execFileSync } from "node:child_process";
     console.log(parse(execFileSync("hc", ["exec", "--", "sh", "-c", PROBE], { encoding: "utf8" })));'
   ```
2. `herdr-app check <ext>/mods/<mod>` for each mod. It loads the mod and renders it in a hidden window. With `checking()` the bar renders empty; to cover the render path, check a scratch copy whose `init` seeds a reading while checking. Without a window (a Linux server), the Linux release tarball's `herdr-app` runs `check` with `HERDR_APP_HOME` set to a scratch folder holding a copy of the mod.
3. Look at it in the app, with the mod linked into `~/.config/herdr-app/mods`. After a `git pull`, or an edit in the checkout, switch layouts away and back (`ctrl-shift-l`), or restart the app, to load the new code: Herdr doesn't see changes through the links. It only hot-reloads files saved inside `~/.config/herdr-app/mods`. `herdr-app shot` takes the screenshot for `preview.png`.

Keep `RECIPE.md` in step with the code: it is the brief a fresh build is made from. Write it in the order the app's guide gives (what you see, how it behaves, built from, watch out, done when), with exact sizes, tokens and calls.

## Commits

Straight to `main`, one logical change each, subject `<extension>: <what changed>` (`pod-stats: keep the last reading per machine`). Use the noreply Git identity the owner's config sets.
