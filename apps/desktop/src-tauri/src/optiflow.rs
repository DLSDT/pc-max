//! OptiFlow installer — the Streamline component swap plus the launcher-side
//! unlocker drop.
//!
//! What makes this different from `apply_game_files` (which handles ordinary
//! optimization packages) is that OptiFlow's destinations are not known until
//! the user picks their game. A Streamline component has to replace whatever
//! copy the game already ships, wherever that happens to be, and the unlocker
//! goes beside the executable the user selected. Neither path can come from
//! the server, so both are resolved here — which makes this file, not the
//! manifest, the security boundary.
//!
//! Three rules hold for every write, without exception:
//!   1. the target resolves inside the game root, checked after canonicalising
//!      the parent directory (so a symlink cannot point out of it);
//!   2. the filename passes the same extension allowlist as every other
//!      package file — nothing executable is ever written;
//!   3. a `streamline` file is only ever a *replacement*. If the game does not
//!      already ship that component, nothing is created: a game that never had
//!      `sl.dlss_g.dll` is not made to have one.
//!
//! Everything is staged and hash-verified before a single byte is written, and
//! the whole batch rolls back together.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Directory names that sit between a game's root and its executable. Walking
/// up past these is how a selected `…/bin/x64/game.exe` becomes the install
/// root that holds the Streamline components.
const ENGINE_SUBDIRS: &[&str] = &[
    "bin", "bin64", "binaries", "win64", "win32", "x64", "x86", "retail",
    "shipping", "game", "engine", "system", "redist", "launcher",
];

/// Directories never worth descending into when searching an install: our own
/// backups, VCS metadata, and the caches games scatter around.
const SKIP_DIRS: &[&str] = &[".goh-backup", ".git", ".svn", "__pycache__", "node_modules"];

/// Bounded search — a game install is deep but not unbounded, and a runaway
/// walk on a 200 GB drive would hang the UI thread.
const MAX_SCAN_DEPTH: usize = 8;
const MAX_SCAN_ENTRIES: usize = 200_000;

/// Where an OptiFlow file goes. Mirrors `PackageFileRole` in the shared Zod
/// contract; a value the client does not understand is refused rather than
/// guessed at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileRole {
    /// Path under the game root, exactly like an ordinary package file.
    Relative,
    /// Replace the same-named file wherever it already exists in the install.
    Streamline,
    /// Drop beside the executable the user selected.
    Launcher,
}

/// Result of pointing the installer at an executable: what it decided the game
/// root and launcher directory are, and which components it found.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub game_dir: String,
    pub launcher_dir: String,
    pub executable: String,
    /// One entry per requested filename that exists somewhere in the install,
    /// with every location it was found at (relative to the game root).
    pub found: Vec<FoundComponent>,
    /// Requested filenames with no copy in the install. These are reported,
    /// not created — see the module docs.
    pub missing: Vec<String>,
    /// True when the walk hit its entry budget; the report may be incomplete.
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundComponent {
    pub filename: String,
    pub locations: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptiFlowFile {
    pub filename: String,
    pub destination: String,
    pub role: FileRole,
    /// Empty when the bytes arrive in the command's blob table instead.
    ///
    /// A package ships the same payload under several names — OptiScaler puts
    /// one 24 MB binary behind eight proxy-DLL names so a game finds whichever
    /// it looks for. Carrying the base64 on every entry meant that binary
    /// crossed the IPC boundary eight times. The command fills this in from
    /// `sha256` before anything here runs, so the installer still sees a
    /// complete file list.
    #[serde(default)]
    pub content_base64: String,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReport {
    pub game_dir: String,
    pub launcher_dir: String,
    pub backup_dir: String,
    pub written: Vec<WrittenFile>,
    /// Streamline components the game does not ship. Not an error — the user
    /// is told which parts of the package did not apply and why.
    pub skipped: Vec<SkippedFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WrittenFile {
    pub filename: String,
    pub path: String,
    pub role: FileRole,
    pub replaced: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub filename: String,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/// Reject a filename that is anything but a plain name with an allowed
/// extension. Shares the allowlist with ordinary package files, so a payload
/// the server accepted cannot become something this refuses to write — or,
/// worse, something it writes that the server never vetted.
pub fn safe_component_name(name: &str) -> Option<&str> {
    if name.is_empty() || name.len() > 255 {
        return None;
    }
    // A separator, a colon (drive letters and NTFS alternate data streams), or
    // a leading dot all mean this is not the bare filename it claims to be.
    if name.contains('/') || name.contains('\\') || name.contains(':') || name.starts_with('.') {
        return None;
    }
    if name.contains('\0') || name == "." || name == ".." {
        return None;
    }
    let ext = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    if !crate::ALLOWED_EXT.contains(&ext.as_str()) {
        return None;
    }
    Some(name)
}

/// Derive the install root from the directory holding the executable.
///
/// Walks up while each directory is a known engine/binaries folder, then makes
/// one extra step for the Unreal layout (`…/MyGame/Binaries/Win64/x.exe`,
/// where the real root is the parent holding both `MyGame` and `Engine`).
/// Never climbs past a directory with fewer than two components, so a drive
/// root or `C:\Program Files` can never become a game root.
pub fn resolve_game_root(launcher_dir: &Path) -> Option<PathBuf> {
    let mut current = launcher_dir.to_path_buf();
    for _ in 0..MAX_SCAN_DEPTH {
        let name = current.file_name()?.to_str()?.to_ascii_lowercase();
        if !ENGINE_SUBDIRS.contains(&name.as_str()) {
            break;
        }
        let Some(parent) = current.parent() else { break };
        if !has_enough_depth(parent) {
            break;
        }
        current = parent.to_path_buf();
    }

    // Unreal: the project directory sits beside `Engine`. Both are inside the
    // install, so stepping up keeps the search within the game and catches
    // components shipped under Engine/Binaries.
    if let Some(parent) = current.parent() {
        if has_enough_depth(parent) && parent.join("Engine").is_dir() && current.join("Content").is_dir() {
            current = parent.to_path_buf();
        }
    }

    if !has_enough_depth(&current) {
        return None;
    }
    Some(current)
}

/// A path shallow enough to be a filesystem or install root is never a game
/// directory. Two named components is the floor (`C:\Games\Foo` qualifies,
/// `C:\Games` does not).
///
/// A Windows drive letter counts as one of those levels. `E:\Resident Evil 2`
/// has a single named component but is a perfectly ordinary game folder — the
/// "second drive full of games" layout — and requiring two named components
/// rejected every install sitting directly on a drive with "That executable is
/// not inside a game folder". `E:\` alone still has no named component and is
/// still refused, which is what the floor is actually for.
///
/// Only Windows paths carry a Prefix, so POSIX behaviour is unchanged.
fn has_enough_depth(path: &Path) -> bool {
    use std::path::Component;
    let named = path.components().filter(|c| matches!(c, Component::Normal(_))).count();
    let rooted_at_a_drive = path.components().any(|c| matches!(c, Component::Prefix(_)));
    depth_ok(named, rooted_at_a_drive)
}

/// The depth rule itself, separated from path parsing so it can be tested off
/// Windows. `Component::Prefix` only exists on Windows targets, so a test
/// written against a real `E:\…` path compiles away everywhere CI runs — which
/// is how the drive-root case went unnoticed in the first place.
pub fn depth_ok(named_components: usize, rooted_at_a_drive: bool) -> bool {
    named_components >= if rooted_at_a_drive { 1 } else { 2 }
}

/// True when `target` is inside `root`. Directories on the way down are
/// canonicalised, so a symlinked directory inside the game cannot redirect a
/// write outside it. Neither `target` nor the folders leading to it need exist
/// yet — an install routinely creates them.
pub fn is_within(root: &Path, target: &Path) -> bool {
    use std::path::Component;

    let Some(parent) = target.parent() else { return false };
    let Ok(real_root) = root.canonicalize() else { return false };

    // `..` is the one component that could climb back out of an ancestor we
    // have already accepted, so it disqualifies the path outright rather than
    // being resolved. Nothing legitimate here contains one.
    if target.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }

    // `canonicalize` fails on a path that does not exist, and this used to
    // canonicalise the immediate parent — so a destination one folder deep,
    // like `<game>/OptiScaler/libxess_fg.dll`, was refused as "outside the game
    // folder" purely because `OptiScaler` had not been created yet.
    //
    // Verify the deepest ancestor that *does* exist instead. What is missing
    // cannot be a symlink pointing anywhere, because it is not anything yet,
    // and the components below it are all `Normal` (see the `..` check above),
    // so they can only descend.
    let mut existing = parent;
    loop {
        if let Ok(real) = existing.canonicalize() {
            return real.starts_with(&real_root);
        }
        match existing.parent() {
            Some(up) => existing = up,
            None => return false,
        }
    }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/// Find every copy of each requested filename inside the install.
///
/// Returns paths relative to `root`, sorted, so the report is stable between
/// runs and two machines with the same game produce the same output.
pub fn find_components(root: &Path, wanted: &[String]) -> (BTreeMap<String, Vec<String>>, bool) {
    let mut lookup: BTreeMap<String, String> = BTreeMap::new();
    for name in wanted {
        lookup.insert(name.to_ascii_lowercase(), name.clone());
    }
    let mut hits: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut budget = MAX_SCAN_ENTRIES;
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        if depth > MAX_SCAN_DEPTH {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            if budget == 0 {
                return (hits, true);
            }
            budget -= 1;
            let path = entry.path();
            // symlink_metadata, not metadata: a symlink is never followed, so
            // a link planted inside the install cannot widen the search or
            // become a write target.
            let Ok(meta) = entry.path().symlink_metadata() else { continue };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if SKIP_DIRS.contains(&name.as_str()) {
                    continue;
                }
                stack.push((path, depth + 1));
            } else if meta.is_file() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if let Some(original) = lookup.get(&name) {
                    if let Ok(rel) = path.strip_prefix(root) {
                        hits.entry(original.clone())
                            .or_default()
                            .push(rel.to_string_lossy().replace('\\', "/"));
                    }
                }
            }
        }
    }
    for locations in hits.values_mut() {
        locations.sort();
    }
    (hits, false)
}

/// Inspect a selected executable: work out the game root and launcher folder,
/// then report which of `wanted` the install actually ships.
pub fn scan(exe_path: &Path, wanted: &[String]) -> Result<ScanReport, String> {
    if !exe_path.is_file() {
        return Err(format!("not_a_file|{}", exe_path.display()));
    }
    let is_exe = exe_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);
    if !is_exe {
        return Err("not_an_exe|".to_string());
    }
    let launcher_dir = exe_path
        .parent()
        .ok_or_else(|| "exe_no_parent|".to_string())?
        .to_path_buf();
    if !launcher_dir.is_dir() {
        return Err("exe_folder_unreadable|".to_string());
    }
    let game_dir = resolve_game_root(&launcher_dir)
        .ok_or_else(|| "not_in_game_folder|".to_string())?;

    let (hits, truncated) = find_components(&game_dir, wanted);
    let found: Vec<FoundComponent> = hits
        .iter()
        .map(|(filename, locations)| FoundComponent { filename: filename.clone(), locations: locations.clone() })
        .collect();
    let missing: Vec<String> = wanted.iter().filter(|n| !hits.contains_key(*n)).cloned().collect();

    Ok(ScanReport {
        game_dir: game_dir.to_string_lossy().to_string(),
        launcher_dir: launcher_dir.to_string_lossy().to_string(),
        executable: exe_path.to_string_lossy().to_string(),
        found,
        missing,
        truncated,
    })
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

struct Staged {
    filename: String,
    role: FileRole,
    target: PathBuf,
    bytes: Vec<u8>,
}

/// Install an OptiFlow payload against a selected executable.
///
/// Phase 1 validates names, resolves every target and verifies every hash
/// without touching the disk — a corrupt or hostile payload does not get so
/// far as creating a backup directory. Phase 2 snapshots the originals, and
/// phase 3 writes temp-then-rename, rolling the whole batch back on any error.
pub fn install(exe_path: &Path, files: &[OptiFlowFile]) -> Result<InstallReport, String> {
    let wanted: Vec<String> = files
        .iter()
        .filter(|f| f.role == FileRole::Streamline)
        .map(|f| f.destination.clone())
        .collect();
    let report = scan(exe_path, &wanted)?;
    let game_dir = PathBuf::from(&report.game_dir);
    let launcher_dir = PathBuf::from(&report.launcher_dir);

    // ---- Phase 1: resolve and verify, purely ----
    let mut staged: Vec<Staged> = Vec::new();
    let mut skipped: Vec<SkippedFile> = Vec::new();
    let mut seen_targets: std::collections::HashSet<PathBuf> = std::collections::HashSet::new();

    for f in files {
        if safe_component_name(&f.filename).is_none() {
            return Err(format!("unsafe_filename|{}", f.filename));
        }

        // Decode and hash before deciding anything about the filesystem, so a
        // checksum mismatch aborts the batch rather than half-applying it.
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &f.content_base64)
            .map_err(|_| format!("invalid_data|{}", f.filename))?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(&f.sha256) {
            return Err(format!(
                "checksum_mismatch|{} (expected {}, got {})",
                f.filename, f.sha256, actual
            ));
        }

        let targets: Vec<PathBuf> = match f.role {
            FileRole::Launcher => {
                // A path, not just a name: the launcher folder is the base and
                // the destination is resolved under it. OptiScaler ships a
                // folder of backend libraries that has to sit beside its proxy
                // DLL — i.e. beside the exe — and resolving that against the
                // game root instead put it several levels above the game's
                // binaries, where nothing looked for it.
                //
                // `safe_destination` is the same gate the relative role uses:
                // no `..`, no absolute or drive-lettered path, no dotfiles, and
                // the extension allowlist. A bare filename still resolves to
                // exactly what it did before.
                let target = crate::safe_destination(&launcher_dir, &f.destination)
                    .ok_or_else(|| format!("unsafe_destination|{}", f.destination))?;
                vec![target]
            }
            FileRole::Streamline => {
                if safe_component_name(&f.destination).is_none() {
                    return Err(format!("unsafe_destination|{}", f.destination));
                }
                let locations = report
                    .found
                    .iter()
                    .find(|c| c.filename == f.destination)
                    .map(|c| c.locations.clone())
                    .unwrap_or_default();
                if locations.is_empty() {
                    // Deliberately not an error: a game that does not ship this
                    // component simply does not get one.
                    skipped.push(SkippedFile {
                        filename: f.filename.clone(),
                        reason: format!("{} is not part of this game's files", f.destination),
                    });
                    continue;
                }
                locations.iter().map(|rel| game_dir.join(rel)).collect()
            }
            FileRole::Relative => {
                let target = crate::safe_destination(&game_dir, &f.destination)
                    .ok_or_else(|| format!("unsafe_destination|{}", f.destination))?;
                vec![target]
            }
        };

        for target in targets {
            if !is_within(&game_dir, &target) {
                return Err(format!("outside_game_folder|{}", target.display()));
            }
            if !seen_targets.insert(target.clone()) {
                return Err(format!("duplicate_target|{}", target.display()));
            }
            staged.push(Staged {
                filename: f.filename.clone(),
                role: f.role,
                target,
                bytes: bytes.clone(),
            });
        }
    }

    if staged.is_empty() {
        return Err("nothing_applies|".to_string());
    }

    // ---- Phase 2: snapshot originals ----
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{}-{}", d.as_secs(), d.subsec_nanos()))
        .unwrap_or_else(|_| "0-0".to_string());
    let backup_root = game_dir.join(".goh-backup").join(format!("optiflow-{stamp}"));
    let mut originals: Vec<(PathBuf, PathBuf)> = Vec::new();
    for s in &staged {
        if s.target.exists() {
            let rel = s.target.strip_prefix(&game_dir).unwrap_or(Path::new(&s.filename));
            let backup = backup_root.join(rel);
            if let Some(parent) = backup.parent() {
                if let Err(e) = fs::create_dir_all(parent) {
                    let _ = fs::remove_dir_all(&backup_root);
                    return Err(format!("backup_folder_failed|{e}"));
                }
            }
            if let Err(e) = fs::copy(&s.target, &backup) {
                let _ = fs::remove_dir_all(&backup_root);
                return Err(format!("backup_failed|{}: {e}", s.target.display()));
            }
            originals.push((s.target.clone(), backup));
        }
    }

    // ---- Phase 3: write ----
    let mut applied: Vec<PathBuf> = Vec::new();
    let mut written: Vec<WrittenFile> = Vec::new();
    for (i, s) in staged.iter().enumerate() {
        let replaced = s.target.exists();
        if let Some(parent) = s.target.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                rollback(&originals, &applied, &backup_root);
                return Err(format!("mkdir_failed|{}: {e}", parent.display()));
            }
        }
        let tmp = s.target.with_extension(format!("goh-tmp-{i}"));
        if let Err(e) = fs::write(&tmp, &s.bytes) {
            rollback(&originals, &applied, &backup_root);
            return Err(format!("write_failed|{}: {e}", s.target.display()));
        }
        if let Err(e) = fs::rename(&tmp, &s.target) {
            let _ = fs::remove_file(&tmp);
            rollback(&originals, &applied, &backup_root);
            return Err(format!("replace_failed|{}: {e}", s.target.display()));
        }
        applied.push(s.target.clone());
        written.push(WrittenFile {
            filename: s.filename.clone(),
            path: s.target.to_string_lossy().to_string(),
            role: s.role,
            replaced,
        });
    }

    // Verify every write landed. A rename that reported success but left no
    // file is the failure mode worth catching before telling the user it worked.
    for s in &staged {
        if !s.target.is_file() {
            rollback(&originals, &applied, &backup_root);
            return Err(format!("write_vanished|{}", s.target.display()));
        }
    }

    Ok(InstallReport {
        game_dir: report.game_dir,
        launcher_dir: report.launcher_dir,
        backup_dir: backup_root.to_string_lossy().to_string(),
        written,
        skipped,
    })
}

/// Undo a partially-applied batch: remove what we wrote, restore what we
/// replaced, discard the backup.
fn rollback(originals: &[(PathBuf, PathBuf)], applied: &[PathBuf], backup_root: &Path) {
    for target in applied {
        let _ = fs::remove_file(target);
    }
    for (target, backup) in originals {
        if backup.exists() {
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(backup, target);
        }
    }
    let _ = fs::remove_dir_all(backup_root);
}

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

/// One file a previous install wrote, as recorded in its report.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFile {
    /// Absolute path the installer wrote to.
    pub path: String,
    /// True when the install replaced a file that was already there. Those are
    /// restored from the backup; files we created are removed.
    pub replaced: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallReport {
    pub restored: Vec<String>,
    pub removed: Vec<String>,
    /// Entries that could not be undone, each with why. Reported rather than
    /// swallowed — a half-removed install the user is told was clean is worse
    /// than one they can see the state of.
    pub failed: Vec<SkippedFile>,
    /// Recorded files that were already gone. Not an error: the user may have
    /// verified the game's files or reinstalled it since.
    pub missing: Vec<String>,
}

/// Undo an install, using only the record of what that install wrote.
///
/// The safety property is that this NEVER pattern-matches on filenames. It
/// walks the recorded list and nothing else, so a file that merely shares a
/// name with something OptiScaler ships — a copy the user installed by hand, a
/// component the game itself shipped — is untouched unless this install
/// actually wrote it.
///
/// A recorded file that was replaced is restored from the backup taken at
/// install time. One that was newly created is deleted. If the backup is gone,
/// the file is left alone and reported: deleting it would destroy the original
/// the backup was supposed to hold.
pub fn uninstall(exe_path: &Path, backup_dir: &Path, files: &[InstalledFile]) -> Result<UninstallReport, String> {
    // Derive the root the same way `install` does, from the recorded executable
    // — NOT from a game_dir the caller also supplies.
    //
    // This used to take game_dir and files[].path from the same caller and then
    // check one against the other, which proves nothing: whoever supplies the
    // paths supplies the boundary they are checked against. Re-deriving it from
    // the exe means the boundary comes from `resolve_game_root`'s own rules
    // (walk up out of bin/x64, never past the depth floor) rather than from the
    // record being acted on.
    let launcher_dir = exe_path
        .parent()
        .ok_or_else(|| "record_no_folder|".to_string())?;
    let real_root = resolve_game_root(launcher_dir)
        .ok_or_else(|| "not_in_game_folder|".to_string())?
        .canonicalize()
        .map_err(|e| format!("game_folder_unresolvable|{e}"))?;

    // The backup is read from and copied over live game files, so it has to be
    // inside the same install — otherwise a crafted record could restore
    // arbitrary bytes from anywhere on disk into the game.
    //
    // Resolved leniently on purpose: a missing backup folder is not a reason to
    // refuse the whole removal. An install that only ADDED files has nothing to
    // restore, and a user who deleted the backup still deserves to get PC MAX's
    // files out of their game. Only the restore branch needs it, and that branch
    // already reports "the original backup is missing" per file.
    let real_backup = match backup_dir.canonicalize() {
        Ok(p) if p.starts_with(&real_root) => Some(p),
        Ok(_) => return Err("backup_outside|".to_string()),
        Err(_) => None,
    };

    let mut report = UninstallReport { restored: vec![], removed: vec![], failed: vec![], missing: vec![] };

    for f in files {
        let target = PathBuf::from(&f.path);

        // Same containment rule as install: the recorded path is data from
        // disk, so it is re-checked rather than trusted.
        if !is_within(&real_root, &target) {
            report.failed.push(SkippedFile {
                filename: f.path.clone(),
                reason: "outside the game folder — refused".to_string(),
            });
            continue;
        }
        if !target.exists() {
            report.missing.push(f.path.clone());
            continue;
        }

        // Every path install could write had an allowlisted extension. A record
        // naming anything else was not written by us, so it is not ours to
        // restore over or delete.
        if target
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(safe_component_name)
            .is_none()
        {
            report.failed.push(SkippedFile {
                filename: f.path.clone(),
                reason: "not a file this installer could have written — refused".to_string(),
            });
            continue;
        }

        if f.replaced {
            // `real_root` is canonical; the recorded path is whatever the
            // install wrote down. Stripping one against the other only worked
            // when the two happened to agree — and on Windows they never do,
            // because canonicalize() returns a `\\?\` verbatim path. Every
            // replaced file was reported "unexpected path" and left as it was,
            // which is a removal that quietly restores nothing.
            //
            // The file exists (checked above), so this cannot fail for the
            // reason the old code was tripping over.
            let real_target = match target.canonicalize() {
                Ok(p) => p,
                Err(e) => {
                    report.failed.push(SkippedFile { filename: f.path.clone(), reason: format!("cannot resolve the file: {e}") });
                    continue;
                }
            };
            let rel = match real_target.strip_prefix(&real_root) {
                Ok(r) => r,
                Err(_) => {
                    report.failed.push(SkippedFile { filename: f.path.clone(), reason: "unexpected path".into() });
                    continue;
                }
            };
            let backup = match &real_backup {
                Some(b) => b.join(rel),
                None => {
                    report.failed.push(SkippedFile {
                        filename: f.path.clone(),
                        reason: "the original backup is missing, so the file was left as it is".to_string(),
                    });
                    continue;
                }
            };
            if !backup.is_file() {
                report.failed.push(SkippedFile {
                    filename: f.path.clone(),
                    reason: "the original backup is missing, so the file was left as it is".to_string(),
                });
                continue;
            }
            match fs::copy(&backup, &target) {
                Ok(_) => report.restored.push(f.path.clone()),
                Err(e) => report.failed.push(SkippedFile { filename: f.path.clone(), reason: format!("restore failed: {e}") }),
            }
        } else {
            match fs::remove_file(&target) {
                Ok(()) => report.removed.push(f.path.clone()),
                Err(e) => report.failed.push(SkippedFile { filename: f.path.clone(), reason: format!("delete failed: {e}") }),
            }
        }
    }

    // Verify: nothing we claim to have removed may still be on disk.
    for p in &report.removed {
        if Path::new(p).exists() {
            report.failed.push(SkippedFile { filename: p.clone(), reason: "still present after delete".into() });
        }
    }

    Ok(report)
}
