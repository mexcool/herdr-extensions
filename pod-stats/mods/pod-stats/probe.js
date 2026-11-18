// CPU, memory and disk of a machine as its own cgroup (v2) sees them. In a
// container those are its limits: free, /proc/loadavg and df / report the
// whole node. CPU is a counter, so it takes two readings (see main.js).
export const PROBE = `set -e
cd /sys/fs/cgroup
grep '^usage_usec ' cpu.stat
echo "cpu.max $(cat cpu.max)"
echo "nproc $(nproc)"
echo "memory.current $(cat memory.current)"
echo "memory.max $(cat memory.max)"
grep -E '^(active|inactive)_file ' memory.stat
df -Pk "$HOME" | tail -1`;

const GIB = 2 ** 30;

export function parse(out) {
  const rows = out.trim().split("\n").map((line) => line.trim().split(/\s+/));
  const value = (key) => Number(rows.find((r) => r[0] === key)[1]);
  const [quota, period] = rows.find((r) => r[0] === "cpu.max").slice(1).map(Number);
  // df -Pk: filesystem, 1024-blocks, used, available, capacity, mounted on.
  const [, total, used] = rows[rows.length - 1].map(Number);
  return {
    usage: value("usage_usec"),
    // "max": no CPU quota, so it can use every CPU in its cpuset.
    cores: Number.isNaN(quota) ? value("nproc") : quota / period,
    // Page cache is reclaimed before the OOM killer fires at memory.max, so leave it out.
    mem: (value("memory.current") - value("active_file") - value("inactive_file")) / GIB,
    // "max": no memory limit.
    memMax: value("memory.max") / GIB,
    // $HOME, where checkouts and their dependencies land, may be its own volume.
    disk: (used * 1024) / GIB,
    diskMax: (total * 1024) / GIB,
  };
}

// Cores in use between two readings: usage_usec over the wall time between them.
export function coresBetween(prev, next) {
  return (next.usage - prev.usage) / ((next.at - prev.at) * 1000);
}
