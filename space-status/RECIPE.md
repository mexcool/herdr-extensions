# Space status

Herdr's own `workspace-status` block without its command-palette hint: the active space's machine and branch, how many agents there are, and how many need you. Use it to free the status bar's right side for other blocks.

![Space status](preview.png)

## What you see

- A 28px block on the `chrome` background with a 1px `border` line on top, 14px side padding, 16px between items, text 11.8px `muted`.
- Left to right:
  - a 13px `monitor` icon and `This computer`, or a `server` icon and the machine's name for a remote space;
  - a `branch` icon and the branch, when the space has one;
  - a 6px `dim` dot and `3 agents`, then `· 1 needs you` in `blocked` when some agent is blocked.
- Nothing at the right end: no `⌘⇧P commands` hint.

## How it behaves

- It redraws as spaces and agents change. No clicks, keys or hovers.

## Built from

- `mods/space-status/mod.json`: `place: none`, title "Space status".
- `mods/space-status/main.js`: Herdr 0.1.16's `workspace-status/main.js` with the `hint` method and its `palette` child (and the spacer before it) removed. It uses `spaces()`, `agents()` and `theme()` from `herdr`, `h_flex` from `gpui-base`, and `svg("mods/workspace-chrome/<icon>.svg")` for the `monitor`, `server` and `branch` icons, which ship with Herdr.
- In a layout, the weight-1 block of a 28px status row:
  ```json
  { "id": "status", "type": "block", "size": { "weight": 1 }, "content": { "mod": "space-status" } }
  ```
- It runs nothing and reads no files.

## Watch out

- It doesn't follow Herdr's updates to `workspace-status`. After a release that changes it, compare the two and carry the changes over.
- The icons are Herdr's own `workspace-chrome` ones, so it needs that shipped mod. `svg()` doesn't follow a symlink out of Herdr's home, so icons of the mod's own would draw blank when it is linked. Herdr's are inside its home.

## Done when

- `herdr-app check mods/space-status` passes.
- In place of `workspace-status`, it shows the same machine, branch and agent count, and no palette hint.
- A blocked agent adds `· 1 needs you` in the `blocked` color.
