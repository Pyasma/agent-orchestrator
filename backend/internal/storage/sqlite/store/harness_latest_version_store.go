package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/aoagents/agent-orchestrator/backend/internal/service/harnessupdate"
	"github.com/aoagents/agent-orchestrator/backend/internal/storage/sqlite/gen"
)

// GetHarnessLatestVersion returns the cached latest-version answer for one
// registry+name pair, satisfying harnessupdate.Store.
func (s *Store) GetHarnessLatestVersion(ctx context.Context, registry, name string) (harnessupdate.Record, bool, error) {
	row, err := s.qr.GetHarnessLatestVersion(ctx, gen.GetHarnessLatestVersionParams{Registry: registry, Name: name})
	if errors.Is(err, sql.ErrNoRows) {
		return harnessupdate.Record{}, false, nil
	}
	if err != nil {
		return harnessupdate.Record{}, false, fmt.Errorf("get harness latest version: %w", err)
	}
	return harnessupdate.Record{
		Registry: row.Registry, Name: row.Name, Version: row.Version, CheckedAt: row.CheckedAt.UTC(),
	}, true, nil
}

// UpsertHarnessLatestVersion persists the latest-version answer for one
// registry+name pair, satisfying harnessupdate.Store.
func (s *Store) UpsertHarnessLatestVersion(ctx context.Context, record harnessupdate.Record) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := s.qw.UpsertHarnessLatestVersion(ctx, gen.UpsertHarnessLatestVersionParams{
		Registry: record.Registry, Name: record.Name, Version: record.Version, CheckedAt: record.CheckedAt.UTC(),
	}); err != nil {
		return fmt.Errorf("upsert harness latest version: %w", err)
	}
	return nil
}
