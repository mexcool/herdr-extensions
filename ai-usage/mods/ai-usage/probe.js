// Plan usage of the Claude Code and Codex accounts signed in on a machine.
//
// Claude: the endpoint behind Claude Code's /usage (undocumented, may change),
// with the CLI's own OAuth token from its credentials file, or the macOS
// Keychain. That JSON also holds a token per MCP server signed in, so only the
// one inside "claudeAiOauth" is taken. A running claude keeps the token fresh; this never refreshes it,
// so it can't race the CLI's token rotation. The token reaches curl on stdin,
// never on a command line.
//
// Codex: its app-server's account/rateLimits/read, so Codex handles its own
// login. app-server quits at the end of its input before it answers, so the
// input stays open until the answer is in (at most 15s).
export const PROBE = String.raw`
creds() {
  f="$HOME/.claude/.credentials.json"
  [ -n "$CLAUDE_CONFIG_DIR" ] && f="$CLAUDE_CONFIG_DIR/.credentials.json"
  if [ -r "$f" ]; then cat "$f"
  elif command -v security >/dev/null; then security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null
  fi
}
token=$(creds | tr -d '\n' | sed -n 's/.*"claudeAiOauth" *: *{[^}]*"accessToken" *: *"\([^"]*\)".*/\1/p')
echo "--- claude"
if [ -n "$token" ]; then
  printf 'Authorization: Bearer %s\nanthropic-beta: oauth-2025-04-20\n' "$token" |
    curl -sS --max-time 10 -H @- https://api.anthropic.com/api/oauth/usage
  echo
fi
echo "--- codex"
if command -v codex >/dev/null; then
  d=$(mktemp -d)
  {
    printf '%s\n' '{"id":1,"method":"initialize","params":{"clientInfo":{"name":"ai-usage","version":"1"}}}' \
      '{"method":"initialized"}' '{"id":2,"method":"account/rateLimits/read"}'
    i=0
    while [ ! -e "$d/done" ] && [ "$i" -lt 150 ]; do sleep 0.1; i=$((i + 1)); done
  } | codex app-server 2>/dev/null | {
    while IFS= read -r line; do
      case $line in '{"id":2,'*) echo "$line"; break ;; esac
    done
    touch "$d/done"
  }
  rm -rf "$d"
fi`;

// { claude, codex }: each a list of { label, left (% of the window unused), resets (ms) }, or null.
export function parse(out) {
  const section = (name) => {
    const s = out.split(/^--- /m).find((part) => part.startsWith(`${name}\n`));
    try {
      return s ? JSON.parse(s.slice(name.length + 1)) : null;
    } catch {
      return null; // an error page, or nothing
    }
  };
  return { claude: claude(section("claude")), codex: codex(section("codex")) };
}

function claude(data) {
  // `limits` names every window, model-scoped weekly ones included; older replies
  // only have five_hour and seven_day.
  const windows = Array.isArray(data?.limits)
    ? data.limits.map((l) => ({
        label: { session: "5h", weekly_all: "7d" }[l.kind] ?? l.scope?.model?.display_name ?? l.kind,
        left: 100 - l.percent,
        resets: Date.parse(l.resets_at),
      }))
    : [["5h", data?.five_hour], ["7d", data?.seven_day]]
        .filter(([, w]) => w)
        .map(([label, w]) => ({ label, left: 100 - w.utilization, resets: Date.parse(w.resets_at) }));
  return windows.length ? windows : null;
}

function codex(data) {
  const limits = data?.result?.rateLimits;
  // The primary window is 5h or weekly depending on the plan; secondary may be absent.
  const windows = [limits?.primary, limits?.secondary].filter(Boolean).map((w) => ({
    label: w.windowDurationMins % 1440 === 0 ? `${w.windowDurationMins / 1440}d` : `${Math.round(w.windowDurationMins / 60)}h`,
    left: 100 - w.usedPercent,
    resets: w.resetsAt * 1000,
  }));
  return windows.length ? windows : null;
}

// "2h 5m", "3d 4h": how long until `ms`.
export function until(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((ms - now) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}
