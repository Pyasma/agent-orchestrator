//go:build windows

package portscan

import (
	"reflect"
	"testing"
)

func TestParseNetTCPConnectionCSVParsesRows(t *testing.T) {
	output := "\"LocalPort\",\"OwningProcess\"\n\"3000\",\"5678\"\n\"135\",\"1234\"\n"

	got := parseNetTCPConnectionCSV(output)
	want := []Socket{
		{Port: 3000, PID: 5678},
		{Port: 135, PID: 1234},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parseNetTCPConnectionCSV = %#v, want %#v", got, want)
	}
}

func TestParseNetTCPConnectionCSVSkipsUnparseableRows(t *testing.T) {
	output := "\"LocalPort\",\"OwningProcess\"\n\"notaport\",\"5678\"\n\"3000\",\"notapid\"\n"

	if got := parseNetTCPConnectionCSV(output); len(got) != 0 {
		t.Fatalf("parseNetTCPConnectionCSV = %#v, want empty", got)
	}
}

func TestParseNetTCPConnectionCSVEmptyOrHeaderOnly(t *testing.T) {
	if got := parseNetTCPConnectionCSV(""); got != nil {
		t.Fatalf("parseNetTCPConnectionCSV(\"\") = %#v, want nil", got)
	}
	if got := parseNetTCPConnectionCSV("\"LocalPort\",\"OwningProcess\"\n"); got != nil {
		t.Fatalf("parseNetTCPConnectionCSV(header only) = %#v, want nil", got)
	}
}
