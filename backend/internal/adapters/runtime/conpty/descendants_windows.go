//go:build windows

package conpty

import (
	"context"
	"encoding/csv"
	"sort"
	"strconv"
	"strings"

	"github.com/aoagents/agent-orchestrator/backend/internal/ports"
	"github.com/aoagents/agent-orchestrator/backend/internal/portscan"
	aoprocess "github.com/aoagents/agent-orchestrator/backend/internal/process"
)

const processTreeScript = `Get-CimInstance Win32_Process | ` +
	`Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation`

type winProcessEntry struct {
	pid     int
	ppid    int
	command string
}

// listWindowsProcessTree runs Get-CimInstance Win32_Process and parses its
// CSV output -- the same cmdlet the ao-desktop-dev skill already uses to
// enumerate checkout-scoped processes for preflight checks.
func listWindowsProcessTree(ctx context.Context) ([]winProcessEntry, error) {
	out, err := aoprocess.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", processTreeScript).Output()
	if err != nil {
		return nil, err
	}
	return parseWin32ProcessCSV(string(out)), nil
}

// parseWin32ProcessCSV parses the CSV produced by:
//
//	Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation
//
// which looks like:
//
//	"ProcessId","ParentProcessId","Name"
//	"5678","100","node.exe"
//
// Rows that fail to parse are skipped rather than failing the whole scan --
// this is a best-effort suggestion surface, not a strict parser.
func parseWin32ProcessCSV(output string) []winProcessEntry {
	reader := csv.NewReader(strings.NewReader(output))
	records, err := reader.ReadAll()
	if err != nil || len(records) == 0 {
		return nil
	}
	var entries []winProcessEntry
	for _, record := range records[1:] { // skip header row
		if len(record) < 3 {
			continue
		}
		pid, err := strconv.Atoi(strings.TrimSpace(record[0]))
		if err != nil {
			continue
		}
		ppid, err := strconv.Atoi(strings.TrimSpace(record[1]))
		if err != nil {
			continue
		}
		entries = append(entries, winProcessEntry{pid: pid, ppid: ppid, command: record[2]})
	}
	return entries
}

// windowsDescendantPIDs is the Win32_Process analogue of the tmux adapter's
// descendantPIDs: a BFS over the parent/child map rooted at rootPID.
func windowsDescendantPIDs(entries []winProcessEntry, rootPID int) map[int]bool {
	descendants := map[int]bool{rootPID: true}
	for changed := true; changed; {
		changed = false
		for _, entry := range entries {
			if descendants[entry.pid] || !descendants[entry.ppid] {
				continue
			}
			descendants[entry.pid] = true
			changed = true
		}
	}
	return descendants
}

// listDetectedPorts is the Windows implementation of the platform hook
// Runtime.ListDetectedPorts calls. It intersects a system-wide listening-port
// scan (portscan.ListListeningTCP, backed by Get-NetTCPConnection) with the
// descendants of rootPID (the pty-host's own OS pid; the ConPTY-spawned shell
// is its direct child). Best-effort throughout: any failure yields an empty
// list rather than an error, matching ports.DetectedPortLister's fail-open
// contract.
func listDetectedPorts(ctx context.Context, rootPID int) ([]ports.DetectedPort, error) {
	entries, err := listWindowsProcessTree(ctx)
	if err != nil {
		return nil, nil
	}
	sockets, err := portscan.ListListeningTCP(ctx)
	if err != nil {
		return nil, nil
	}
	descendants := windowsDescendantPIDs(entries, rootPID)
	commands := make(map[int]string, len(entries))
	for _, entry := range entries {
		commands[entry.pid] = entry.command
	}
	var detected []ports.DetectedPort
	for _, socket := range sockets {
		if !descendants[socket.PID] {
			continue
		}
		command := commands[socket.PID]
		if command == "" {
			command = socket.Command
		}
		detected = append(detected, ports.DetectedPort{Port: socket.Port, PID: socket.PID, Command: command})
	}
	sort.Slice(detected, func(i, j int) bool {
		if detected[i].Port != detected[j].Port {
			return detected[i].Port < detected[j].Port
		}
		return detected[i].PID < detected[j].PID
	})
	return detected, nil
}
