//go:build !windows

package gitworktree

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// repairRemovePermissions restores owner write+search on every real directory
// under root so a following os.RemoveAll can unlink their children. Unlinking
// an entry needs write permission on its PARENT directory, not on the entry
// itself, so a dependency manager that leaves a directory at 0500 (renv's
// sandbox does this) makes everything inside it undeletable even for the
// owner. Regular files are left alone: their own mode never blocks unlink.
//
// Symlinks are skipped entirely. filepath.WalkDir reports them via Lstat and
// never descends into them, and os.Chmod would follow the link and change the
// TARGET's mode — which may live far outside the worktree (renv links straight
// into the system R library). A symlink is unlinked from its parent like any
// other entry, so the parent's repair is all it needs.
//
// Reports whether anything changed so the caller only retries when a retry
// can plausibly succeed. Chmod failures are ignored: a directory AO does not
// own cannot be repaired here, and the retry surfaces the real error.
func repairRemovePermissions(root string) bool {
	repaired := false
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d == nil {
			// ReadDir on a directory we could not open (0000): the entry
			// callback already ran for it, so its chmod is done; the next
			// RemoveAll pass will get further. Nothing else to do here.
			return nil
		}
		if d.Type()&fs.ModeSymlink != 0 || !d.IsDir() {
			return nil
		}
		info, statErr := d.Info()
		if statErr != nil {
			return nil
		}
		const need = 0o700
		if info.Mode().Perm()&need == need {
			return nil
		}
		if chmodErr := os.Chmod(path, info.Mode().Perm()|need); chmodErr == nil {
			repaired = true
		}
		return nil
	})
	return repaired
}

func isPermissionRemoveError(err error) bool { return errors.Is(err, fs.ErrPermission) }
