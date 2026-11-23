# Tab names

Lets a program name its tab, from any machine. Herdr's `tab.rename` needs `herdr-app`, which runs only where the window is, so an agent on another machine can't call it. That agent can label its own terminal through herdr-core, and this mod turns the label into the tab's name:

```sh
hc label "$HC_TERMINAL_ID" tab.name="fix login"
```

Use it to give a tab the same name as the agent sessions in it, so the tab, the agents list and the agent's own apps all read alike.

A `pane.name` label names the pane showing that terminal the same way, with Herdr 0.1.17's `pane.rename`: `hc label "$HC_TERMINAL_ID" pane.name=proj-123-impl`.

Without a label it still names a tab nobody named: after the title of its first agent pane, which for Claude Code is the session's name (`claude -n …`, `/rename`). So the tab picker and `herdr-app ls` show the same name as the tab bar, which only shows the title live over the tab's number.

## What you see

- Nothing: an empty block, 0px wide. No preview.
- The tab of a labelled terminal takes the label's value as its name, within a second, in every window.
- The pane of a terminal with a `pane.name` label takes the label's value as its name, the same way.
- A tab no label names, and nobody named, takes the title of its first agent pane, up to ` | ` (Codex appends its worktree): `proj-123`, `proj-123-rev`.

## How it behaves

- Each second it reads `terminals()` and `panes()`. For every terminal with a `tab.name` label whose value it hasn't given yet, it runs `tab.rename {id, name}` on the tab whose pane shows that terminal.
- Once per value: it keeps the value it gave per terminal address in shared state (`tab-names`), so a rename made later in the app stays. Setting a new value renames the tab again.
- `pane.name` works the same, with `pane.rename {pane, name}` on the pane showing that terminal, and its own record in shared state (`tab-names.panes`). It has no title fallback: an unnamed pane shows its program's title, as before.
- A labelled terminal without a pane yet (a sub-agent, a terminal still being adopted) is tried again on the next tick. A sub-agent's label never names its parent's tab.
- The title fallback: for each tab, the first pane running an agent now (`program.agent`, not `app`, which keeps an agent's last report after it exits). It takes only a title the tab bar would show (the tabs mod's `clean` and checks: not a path, a `user@host`, the terminal's address or the program's name), so a shell's title never names a tab. It renames a tab only if nobody named it, or if this mod named it from that pane's previous title, so a later `/rename` follows and a hand rename stays. A labelled tab never takes a title. Shell-only tabs keep their number.
- It remembers what it gave a terminal while that terminal lives, so an agent quit and started again in the same tab renames it again. It forgets a terminal once its machine is ready and the terminal is gone. A machine that's offline keeps its entries, so its labels don't rename again when it comes back.
- No clicks, keys or hovers. It runs nothing and reads no files.

## Built from

- `mods/tab-names/mod.json`: `place: none`, title "Tab names".
- `mods/tab-names/main.js`: `terminals()`, `panes()`, `spaces()` (whether a tab is named), `machines()`, `run("tab.rename")`, `run("pane.rename")` and `shared`/`setShared` from `herdr`; `cx.timer.every(1000)` from `init`, skipped while `checking()`; `render()` returns an empty `div()`.
- In a layout, a 0px block anywhere that stays in it, such as a status row:
  ```json
  { "id": "tab-names", "type": "block", "size": { "px": 0 }, "content": { "mod": "tab-names" } }
  ```

## Watch out

- It renames only while a window with this block is open. A label set while none is open applies when one opens.
- `tab.name` and `pane.name` are conventions of this mod, not Herdr's: Herdr's own labels are `herdr.*`.
- `pane.rename` is new in Herdr 0.1.17. On an older app the pane names do nothing; tab names still work.
- Remote addresses carry the machine (`vps/t7`) in `terminals()` and `panes()`, and the label is set with the bare address on that machine. Match on the app's form.

## Done when

- `herdr-app check mods/tab-names` passes.
- `hc label <terminal> tab.name=probe` renames that terminal's tab to `probe`, for a terminal on this computer and for one on another machine labelled there.
- After `tab.rename` by hand, the tab keeps that name; `hc label <terminal> tab.name=probe-2` then renames it to `probe-2`.
- A new tab with `claude -n probe-3` in it is named `probe-3`, and `/rename probe-4` there renames it. A tab renamed by hand keeps its name through a later `/rename`.
- Quitting that agent leaves the tab named `probe-4`, not the shell's title. `claude -n probe-5` in the same tab then renames it.
- `hc label <terminal> pane.name=probe-pane` names that terminal's pane `probe-pane`; a later hand rename of the pane stays until the label changes.
