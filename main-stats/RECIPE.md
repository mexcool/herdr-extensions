# Main with stats

Herdr's own `main` layout, unchanged except for its status bar. The single `workspace-status` block becomes a row: [Space status](../space-status) (Herdr's workspace status without the command hint) on the left, then [Pod stats](../pod-stats) (cpu, memory and disk against the machine's own limits) and [AI usage](../ai-usage) (Claude and Codex plan windows, with a hover panel) at the right end. All three follow the active space.

![Main with stats](preview.png)

## What you see

- Everything above the status bar is Herdr's `main` as of 0.1.16: the sidebar with spaces and agents, tabs, and the pane area with the files and changes panel.
- The 28px status bar, left to right:
  - `space-status` (weight 1): machine, branch and agent count, taking the free width.
  - `pod-stats` (300px): `cpu 1.5/8 mem 6.2/16G disk 40/100G`.
  - `ai-usage` (840px): `claude 5h ▬ 41% 7d ▬ 64% Opus ▬ 80% 1d 4h ↺1  codex 5h ▬ 12% 7d ▬ 30%`.
- In a space on a machine without cgroup v2 (macOS), `pod-stats` is empty. In one without signed-in agents, `ai-usage` is empty.

## How it behaves

- As `main` does, plus the three mods: see their recipes. Only `ai-usage` reacts to the pointer: hovering it opens its panel.

## Built from

- `layouts/main-stats.json`: a clone of the shipped `main` (`cloned_from: {name: "main", version: "0.1.16"}`). Its `status` block (28px, `workspace-status`) is replaced by:
  ```json
  { "id": "status-row", "type": "row", "size": { "px": 28 }, "resizable": false, "children": [
    { "id": "status", "type": "block", "size": { "weight": 1 }, "content": { "mod": "space-status" } },
    { "id": "pod-stats", "type": "block", "size": { "px": 300 }, "content": { "mod": "pod-stats" } },
    { "id": "ai-usage", "type": "block", "size": { "px": 840 }, "content": { "mod": "ai-usage" } } ] }
  ```
- The mods it needs are `../space-status/mods/space-status`, `../pod-stats/mods/pod-stats` and `../ai-usage/mods/ai-usage` in this repo. Copy all three into `mods/`.

## Watch out

- Clones don't follow Herdr's updates to `main`. On a release that changes `main`, clone it again (`layout.clone {"name": "main", "as": "main-stats"}`, after moving this one aside) and redo the status row.
- The two fixed widths (1140px together) are sized for `ai-usage` at its widest and suit a wide window. In a narrower one `space-status` gets what is left, and below that the blocks are squeezed: shrink `ai-usage` to what your plans need.

## Done when

- `herdr-app check` passes for the three mods, and `layout.switch {"name": "main-stats"}` gives no `layout.error` in `herdr-app status`.
- The window looks like `main`, with space status on the left of the status bar and pod stats and AI usage at its right.
- `ctrl-shift-l` cycles back to the previous layout.
