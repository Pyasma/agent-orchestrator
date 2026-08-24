//go:build !windows

package conpty

import (
	"context"

	"github.com/aoagents/agent-orchestrator/backend/internal/ports"
)

// listDetectedPorts is a stub on non-Windows platforms. conpty is the
// Windows-only runtime (the tmux adapter implements ports.DetectedPortLister
// on Darwin/Linux instead); this only exists to keep the package buildable
// and testable without Windows, matching host_conpty_other.go's newConPTY stub.
func listDetectedPorts(_ context.Context, _ int) ([]ports.DetectedPort, error) {
	return nil, nil
}
