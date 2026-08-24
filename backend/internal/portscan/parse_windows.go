//go:build windows

package portscan

import (
	"encoding/csv"
	"strconv"
	"strings"
)

// parseNetTCPConnectionCSV parses the CSV produced by:
//
//	Get-NetTCPConnection -State Listen | Select-Object LocalPort,OwningProcess | ConvertTo-Csv -NoTypeInformation
//
// which looks like:
//
//	"LocalPort","OwningProcess"
//	"3000","5678"
//
// Get-NetTCPConnection does not report a process name, so Command is always
// empty here; callers with their own process table (e.g. a descendant walk)
// should fill it in themselves. Rows that fail to parse are skipped rather
// than failing the whole scan -- this is a best-effort suggestion surface.
func parseNetTCPConnectionCSV(output string) []Socket {
	reader := csv.NewReader(strings.NewReader(output))
	records, err := reader.ReadAll()
	if err != nil || len(records) == 0 {
		return nil
	}
	var sockets []Socket
	for _, record := range records[1:] { // skip header row
		if len(record) < 2 {
			continue
		}
		port, err := strconv.Atoi(strings.TrimSpace(record[0]))
		if err != nil {
			continue
		}
		pid, err := strconv.Atoi(strings.TrimSpace(record[1]))
		if err != nil {
			continue
		}
		sockets = append(sockets, Socket{Port: port, PID: pid})
	}
	return sockets
}
