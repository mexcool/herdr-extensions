# Main with stats

Herdr's own `main` layout, unchanged except for its status bar. The single `workspace-status` block becomes a row: [Space status](../space-status) (Herdr's workspace status without the command hint) on the left, then [Pod stats](../pod-stats) (cpu, memory and disk against the machine's own limits) and [AI usage](../ai-usage) (Claude and Codex plan windows, with a hover panel) at the right end. All three follow the active space.

![Main with stats](preview.png)

## What you see

- Everything above the status bar is Herdr's `main` as of 0.1.16: the sidebar with spaces and agents, tabs, and the pane area with the files and changes panel.
- The 28px status bar, left to right:
  - `space-status` (weight 1): machine, branch and agent count, taking the free width.
  - `pod-stats`, as wide as its content: `cpu 1.5/8 mem 6.2/16G disk 40/100G`.
  - a 1×14px divider, then `ai-usage`, as wide as its content: `claude 5h ▬ 59% 7d ▬ 36% Opus ▬ 20% 1d 4h  codex 5h ▬ 88% 7d ▬ 70%`.
- In a space on a machine without cgroup v2 (macOS), `pod-stats` is empty. In one without signed-in agents, `ai-usage` is empty.

## How it behaves

- As `main` does, plus the three mods: see their recipes. Only `ai-usage` reacts to the pointer: hovering it opens its panel.

## Built from

- `layouts/main-stats.json`: a clone of the shipped `main` (`cloned_from: {name: "main", version: "0.1.16"}`). Its `status` block (28px, `workspace-status`) is replaced by:
  ```json
  { "id": "status-row", "type": "row", "size": { "px": 28 }, "resizable": false, "children": [
    { "id": "status", "type": "block", "size": { "weight": 1 }, "content": { "mod": "space-status" } },
    { "id": "pod-stats", "type": "block", "size": { "px": 270 }, "content": { "mod": "pod-stats", "props": { "fit": "pod-stats" } } },
    { "id": "ai-usage", "type": "block", "size": { "px": 560 }, "content": { "mod": "ai-usage", "props": { "fit": "ai-usage" } } } ] }
  ```
- The mods it needs are `../space-status/mods/space-status`, `../pod-stats/mods/pod-stats` and `../ai-usage/mods/ai-usage` in this repo. Copy all three into `mods/`.

## Watch out

- Clones don't follow Herdr's updates to `main`. On a release that changes `main`, clone it again (`layout.clone {"name": "main", "as": "main-stats"}`, after moving this one aside) and redo the status row.
- `pod-stats` and `ai-usage` size their blocks to their content (their `fit` props name their own block ids), so both sit flush at the right and `space-status` takes all the rest. Their `px` is only the width until the first reading. The resizes are window state, not edits to this file.

## Done when

- `herdr-app check` passes for the three mods, and `layout.switch {"name": "main-stats"}` gives no `layout.error` in `herdr-app status`.
- The window looks like `main`, with space status on the left of the status bar and pod stats and AI usage at its right.
- `ctrl-shift-l` cycles back to the previous layout.
