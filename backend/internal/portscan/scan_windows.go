//go:build windows

package portscan

import (
	"context"

	aoprocess "github.com/aoagents/agent-orchestrator/backend/internal/process"
)

const listListeningTCPScript = `Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ` +
	`Select-Object LocalPort,OwningProcess | ConvertTo-Csv -NoTypeInformation`

// ListListeningTCP runs Get-NetTCPConnection and parses its CSV output. Any
// failure (PowerShell absent, the cmdlet unavailable, permission denied) is
// returned to the caller; ports.DetectedPortLister implementations must treat
// it as fail-open (empty list, no user-facing error) rather than propagate it.
func ListListeningTCP(ctx context.Context) ([]Socket, error) {
	out, err := aoprocess.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", listListeningTCPScript).Output()
	if err != nil {
		return nil, err
	}
	return parseNetTCPConnectionCSV(string(out)), nil
}
