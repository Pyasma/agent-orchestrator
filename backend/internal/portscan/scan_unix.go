//go:build !windows

package portscan

import (
	"context"

	aoprocess "github.com/aoagents/agent-orchestrator/backend/internal/process"
)

// ListListeningTCP runs `lsof -iTCP -sTCP:LISTEN -P -n` and parses its
// output. Any failure (lsof absent, permission denied, non-zero exit) is
// returned to the caller; ports.DetectedPortLister implementations must treat
// it as fail-open (empty list, no user-facing error) rather than propagate it.
func ListListeningTCP(ctx context.Context) ([]Socket, error) {
	out, err := aoprocess.CommandContext(ctx, "lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n").Output()
	if err != nil {
		return nil, err
	}
	return parseLsofListen(string(out)), nil
}
