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
fn has_enough_depth(path: &Path) -> bool {
    path.components()
        .filter(|c| matches!(c, std::path::Component::Normal(_)))
        .count()
        >= 2
}

/// True when `target` is inside `root`. The parent is canonicalised first, so
/// a symlinked directory inside the game cannot redirect a write outside it.
/// `target` itself may not exist yet — that is the normal case for the
/// unlocker.
pub fn is_within(root: &Path, target: &Path) -> bool {
    let Some(parent) = target.parent() else { return false };
    let (Ok(real_root), Ok(real_parent)) = (root.canonicalize(), parent.canonicalize()) else {
        return false;
    };
    real_parent.starts_with(&real_root)
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
        return Err(format!("Not a file: {}", exe_path.display()));
    }
    let is_exe = exe_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);
    if !is_exe {
        return Err("Select the game's .exe file".to_string());
    }
    let launcher_dir = exe_path
        .parent()
        .ok_or_else(|| "Executable has no parent directory".to_string())?
        .to_path_buf();
    if !launcher_dir.is_dir() {
        return Err("Executable's folder could not be read".to_string());
    }
    let game_dir = resolve_game_root(&launcher_dir)
        .ok_or_else(|| "That executable is not inside a game folder".to_string())?;

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
            return Err(format!("Unsafe filename: {}", f.filename));
        }

        // Decode and hash before deciding anything about the filesystem, so a
        // checksum mismatch aborts the batch rather than half-applying it.
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &f.content_base64)
            .map_err(|_| format!("Invalid data for {}", f.filename))?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(&f.sha256) {
            return Err(format!(
                "Checksum mismatch for {} — expected {}, got {}",
                f.filename, f.sha256, actual
            ));
        }

        let targets: Vec<PathBuf> = match f.role {
            FileRole::Launcher => {
                let name = safe_component_name(&f.destination)
                    .ok_or_else(|| format!("Unsafe destination: {}", f.destination))?;
                vec![launcher_dir.join(name)]
            }
            FileRole::Streamline => {
                if safe_component_name(&f.destination).is_none() {
                    return Err(format!("Unsafe destination: {}", f.destination));
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
                    .ok_or_else(|| format!("Unsafe destination: {}", f.destination))?;
                vec![target]
            }
        };

        for target in targets {
            if !is_within(&game_dir, &target) {
                return Err(format!("Refusing to write outside the game folder: {}", target.display()));
            }
            if !seen_targets.insert(target.clone()) {
                return Err(format!("Two files both want to write {}", target.display()));
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
        return Err("Nothing to install — none of the package's files apply to this game".to_string());
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
                    return Err(format!("Cannot create backup folder: {e}"));
                }
            }
            if let Err(e) = fs::copy(&s.target, &backup) {
                let _ = fs::remove_dir_all(&backup_root);
                return Err(format!("Cannot back up {}: {e}", s.target.display()));
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
                return Err(format!("Cannot create {}: {e}", parent.display()));
            }
        }
        let tmp = s.target.with_extension(format!("goh-tmp-{i}"));
        if let Err(e) = fs::write(&tmp, &s.bytes) {
            rollback(&originals, &applied, &backup_root);
            return Err(format!("Cannot write {}: {e}", s.target.display()));
        }
        if let Err(e) = fs::rename(&tmp, &s.target) {
            let _ = fs::remove_file(&tmp);
            rollback(&originals, &applied, &backup_root);
            return Err(format!("Cannot replace {}: {e}", s.target.display()));
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
            return Err(format!("{} did not survive the install", s.target.display()));
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
