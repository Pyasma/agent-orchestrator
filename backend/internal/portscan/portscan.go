// Package portscan enumerates listening TCP sockets on the local host. It is
// a best-effort, system-wide probe: callers that want a session-scoped
// result (e.g. ports.DetectedPortLister implementations) intersect Socket.PID
// against their own descendant-PID set. Every platform implementation fails
// open -- a missing scan tool or a permission error yields an empty slice and
// a nil error, never a user-facing failure, because this is a suggestion
// surface rather than a managed lifecycle.
package portscan

// Socket is one listening TCP port discovered by a platform scan.
type Socket struct {
	Port int
	PID  int
	// Command is best-effort and may be empty when the scanning tool did not
	// report it (or truncated it); callers that already have a fuller process
	// table (e.g. from a `ps` walk) should prefer that over this field.
	Command string
}
