# Pod stats

A status-bar block with the CPU, memory and disk of the active space's machine, measured against that machine's own cgroup limits, not the host's. Inside a container (a Kubernetes pod, a devcontainer) it shows what the container may use. Generic stats read `free`, `/proc/loadavg` and `df /`, which there report the whole node. It follows the active space, so switching to a space on another machine shows that machine's numbers at once.

![Pod stats](preview.png)

## What you see

- A 28px block on the `chrome` background with a 1px `border` line on top, sized to sit at the right of a status row. 300px fits the widest values (two-digit cores, three-digit disk).
- Right-aligned, 14px side padding, 16px between groups, text 11.8px: `cpu 0.7/16  mem 12.1/32G  disk 86/197G`. Each label is `dim`. Each value is `foreground`, `ansi3` (amber) from 75% of its limit, and `ansi1` (red) from 90%.
- cpu: cores in use / cores allowed (the CPU quota, or every CPU when there's none). mem: GiB in use without page cache / the memory limit. A machine with no memory limit shows only the used figure (`mem 12.1G`). disk: GiB used / size of the filesystem holding `$HOME`.
- Nothing at all for a machine without cgroup v2 (macOS) or one that can't be reached: an empty bar, not dashes.
- `cpu –/16` right after the first reading of a machine, for about a second.

## How it behaves

- Agent statuses play no part; it shows the machine only. No clicks, keys or hovers.
- A cheap 250ms timer compares the active space's machine with the one probed last. A probe runs when they differ, or when the last probe is 5s old. One probe at a time; a switch made during a probe is picked up as soon as it returns.
- The last reading of every machine is kept, so a space switch draws that machine's last numbers at once, then refreshes them. It never shows one machine's numbers under another's space.
- CPU comes from two readings of the `cpu.stat` counter. If the previous reading of that machine is under 15s old, cpu is the cores used between the two. Otherwise the last cpu value stays and the next probe comes 1s later instead of 5s.

## Built from

- `mods/pod-stats/mod.json`: `place: none`, title "Pod stats". It draws only where a layout puts it.
- `mods/pod-stats/probe.js`: `PROBE`, a `set -e` sh script run in `/sys/fs/cgroup` that prints raw values: `usage_usec` from `cpu.stat`, `cpu.max`, `nproc`, `memory.current`, `memory.max`, `active_file` and `inactive_file` from `memory.stat`, and `df -Pk "$HOME"`. `parse` turns them into numbers (all arithmetic is in JS, so no awk float formatting); `coresBetween` divides the `usage_usec` delta by the wall time.
- `mods/pod-stats/main.js`: a `View` with `init`, `tick` and `render`. It uses `exec("sh", ["-c", PROBE], { on, timeout: 5000 })` on the active space's machine (`spaces().find(s => s.active)?.machine`), `theme()` tokens `chrome`, `border`, `dim`, `foreground`, `ansi3`, `ansi1`, `cx.timer.every`, `cx.spawn`, `cx.notify`, and `checking()` (no timers while `herdr-app check` runs).
- In a layout, a block in a 28px status row:
  ```json
  { "id": "pod-stats", "type": "block", "size": { "px": 300 }, "content": { "mod": "pod-stats" } }
  ```
- It runs `sh`, `grep`, `cat`, `nproc`, `df` and `tail` on the machine, reads `/sys/fs/cgroup`, and reaches no network.

## Watch out

- cgroup v2 only (`/sys/fs/cgroup/cpu.stat`). On cgroup v1 the probe fails and the bar stays empty.
- Memory excludes `active_file` and `inactive_file`: page cache is reclaimed before the OOM killer acts at `memory.max`, so counting it would show a full container that isn't.
- Disk is the filesystem holding `$HOME`, where checkouts and their dependencies land. In a pod that is often its own volume. Other mounts aren't shown.
- `exec` with `on` runs through that machine's herdr-core, with the core's environment. `$HOME` is the core's home.
- A layout's 28px row is the height it was drawn for. Values longer than 300px of text spill out to the left: give the block more width for many-core machines.

## Done when

- `herdr-app check mods/pod-stats` passes.
- In a space on a Linux machine with cgroup v2, the bar shows cpu, mem and disk matching `cat /sys/fs/cgroup/memory.max` and `df -h "$HOME"` on that machine. In a macOS space it is empty.
- Switching to another machine's space shows its last numbers immediately (after its first visit), and fresh ones within a second.
- A memory use above 75% of `memory.max` turns the mem value amber, above 90% red.
