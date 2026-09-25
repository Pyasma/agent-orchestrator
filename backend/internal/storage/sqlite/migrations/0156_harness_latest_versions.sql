-- +goose Up
CREATE TABLE harness_latest_versions (
    registry   TEXT NOT NULL,
    name       TEXT NOT NULL,
    version    TEXT NOT NULL,
    checked_at TIMESTAMP NOT NULL,
    PRIMARY KEY (registry, name)
);

-- Cached answers from public package registries (npm, PyPI, Homebrew), keyed
-- by the exact registry+name a harness's install recipe reports. Deliberately
-- does not emit session CDC events into change_log: this is a request-scoped
-- cache, not durable session state.

-- +goose Down
DROP TABLE harness_latest_versions;
