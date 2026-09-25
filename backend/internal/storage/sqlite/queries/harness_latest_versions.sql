-- name: GetHarnessLatestVersion :one
SELECT registry, name, version, checked_at
FROM harness_latest_versions
WHERE registry = ? AND name = ?;

-- name: UpsertHarnessLatestVersion :exec
INSERT INTO harness_latest_versions (registry, name, version, checked_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(registry, name) DO UPDATE SET
    version = excluded.version,
    checked_at = excluded.checked_at;
