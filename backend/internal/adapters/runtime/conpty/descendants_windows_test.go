//go:build windows

package conpty

import "testing"

func TestParseWin32ProcessCSVParsesRows(t *testing.T) {
	output := "\"ProcessId\",\"ParentProcessId\",\"Name\"\n" +
		"\"100\",\"1\",\"cmd.exe\"\n" +
		"\"101\",\"100\",\"node.exe\"\n"

	entries := parseWin32ProcessCSV(output)
	if len(entries) != 2 {
		t.Fatalf("parseWin32ProcessCSV returned %d entries, want 2", len(entries))
	}
	if entries[1].pid != 101 || entries[1].ppid != 100 || entries[1].command != "node.exe" {
		t.Fatalf("parseWin32ProcessCSV entry = %#v, want {101 100 node.exe}", entries[1])
	}
}

func TestParseWin32ProcessCSVSkipsUnparseableRows(t *testing.T) {
	output := "\"ProcessId\",\"ParentProcessId\",\"Name\"\n\"notapid\",\"1\",\"cmd.exe\"\n"
	if entries := parseWin32ProcessCSV(output); entries != nil {
		t.Fatalf("parseWin32ProcessCSV = %#v, want nil", entries)
	}
}

func TestWindowsDescendantPIDsWalksTree(t *testing.T) {
	entries := []winProcessEntry{
		{pid: 100, ppid: 1, command: "cmd.exe"},
		{pid: 101, ppid: 100, command: "node.exe"},
		{pid: 102, ppid: 101, command: "child.exe"},
		{pid: 200, ppid: 1, command: "unrelated.exe"},
	}
	got := windowsDescendantPIDs(entries, 100)
	for _, pid := range []int{100, 101, 102} {
		if !got[pid] {
			t.Fatalf("windowsDescendantPIDs(100) missing pid %d: %#v", pid, got)
		}
	}
	if got[200] {
		t.Fatalf("windowsDescendantPIDs(100) wrongly includes unrelated pid 200: %#v", got)
	}
}
