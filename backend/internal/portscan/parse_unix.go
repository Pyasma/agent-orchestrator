//go:build !windows

package portscan

import (
	"bufio"
	"strconv"
	"strings"
)

// parseLsofListen parses the output of `lsof -iTCP -sTCP:LISTEN -P -n`, whose
// column layout is identical on macOS and Linux:
//
//	COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
//	node    12345 pyasma   23u  IPv4 123456      0t0  TCP 127.0.0.1:3000 (LISTEN)
//
// Lines that do not match the expected shape (the header row, an
// unparseable PID, a NAME column without a trailing ":<port>") are skipped
// rather than failing the whole scan -- this is a best-effort suggestion
// surface, not a strict parser.
func parseLsofListen(output string) []Socket {
	var sockets []Socket
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 || fields[0] == "COMMAND" {
			continue
		}
		pid, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}
		addrPort := ""
		for i, f := range fields {
			if f == "(LISTEN)" && i > 0 {
				addrPort = fields[i-1]
				break
			}
		}
		if addrPort == "" {
			continue
		}
		idx := strings.LastIndex(addrPort, ":")
		if idx < 0 || idx == len(addrPort)-1 {
			continue
		}
		port, err := strconv.Atoi(addrPort[idx+1:])
		if err != nil {
			continue
		}
		sockets = append(sockets, Socket{Port: port, PID: pid, Command: fields[0]})
	}
	return sockets
}
