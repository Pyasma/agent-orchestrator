//go:build !windows

package portscan

import (
	"reflect"
	"testing"
)

func TestParseLsofListenParsesIPv4AndIPv6(t *testing.T) {
	output := "COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n" +
		"node    12345 pyasma   23u  IPv4 123456      0t0  TCP 127.0.0.1:3000 (LISTEN)\n" +
		"node    12345 pyasma   24u  IPv6 123457      0t0  TCP [::1]:3000 (LISTEN)\n" +
		"nginx    9999 root     6u   IPv4  99999      0t0  TCP *:8080 (LISTEN)\n"

	got := parseLsofListen(output)
	want := []Socket{
		{Port: 3000, PID: 12345, Command: "node"},
		{Port: 3000, PID: 12345, Command: "node"},
		{Port: 8080, PID: 9999, Command: "nginx"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseLsofListen = %#v, want %#v", got, want)
	}
}

func TestParseLsofListenSkipsUnparseableLines(t *testing.T) {
	output := "COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n" +
		"node    notapid pyasma 23u  IPv4 123456 0t0  TCP 127.0.0.1:3000 (LISTEN)\n" +
		"weird line with no listen marker\n" +
		"node    12345 pyasma   23u  IPv4 123456      0t0  TCP 127.0.0.1:noport (LISTEN)\n" +
		"\n"

	got := parseLsofListen(output)
	if len(got) != 0 {
		t.Fatalf("parseLsofListen = %#v, want empty", got)
	}
}

func TestParseLsofListenEmptyInput(t *testing.T) {
	if got := parseLsofListen(""); got != nil {
		t.Fatalf("parseLsofListen(\"\") = %#v, want nil", got)
	}
}
