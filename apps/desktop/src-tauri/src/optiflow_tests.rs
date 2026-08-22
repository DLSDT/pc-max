//! Real-filesystem tests for the OptiFlow installer.
//!
//! Every case builds an actual game-shaped directory tree under the OS temp
//! dir and runs the shipped functions against it — no mocks. The install path
//! writes into whatever the user picked, so the properties worth proving are
//! the ones about what it refuses to write, and each of those tests was first
//! confirmed to fail against a version of the code without its guard.

use super::optiflow::{
    find_components, install, is_within, resolve_game_root, safe_component_name, scan, FileRole,
    OptiFlowFile,
};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SEQ: AtomicU64 = AtomicU64::new(0);

struct TempTree {
    root: PathBuf,
}

impl TempTree {
    fn new(label: &str) -> Self {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
            "optiflow-test-{label}-{}-{n}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp root");
        // canonicalize: macOS temp dirs are symlinked, and the installer's own
        // containment check canonicalizes, so the test must compare like for like.
        let root = root.canonicalize().expect("canonicalize temp root");
        Self { root }
    }

    /// Create `rel` with `contents`, making parent directories as needed.
    fn file(&self, rel: &str, contents: &[u8]) -> PathBuf {
        let path = self.root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, contents).unwrap();
        path
    }

    fn read(&self, rel: &str) -> Vec<u8> {
        fs::read(self.root.join(rel)).unwrap()
    }

    fn exists(&self, rel: &str) -> bool {
        self.root.join(rel).exists()
    }
}

impl Drop for TempTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn payload(filename: &str, destination: &str, role: FileRole, bytes: &[u8]) -> OptiFlowFile {
    let mut h = Sha256::new();
    h.update(bytes);
    OptiFlowFile {
        filename: filename.to_string(),
        destination: destination.to_string(),
        role,
        content_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        sha256: format!("{:x}", h.finalize()),
    }
}

// ---------------------------------------------------------------------------
// Filename validation
// ---------------------------------------------------------------------------

#[test]
fn accepts_the_real_streamline_component_names() {
    for name in [
        "sl.interposer.dll",
        "sl.dlss_g.dll",
        "sl.common.dll",
        "nvngx_dlssg.dll",
        "version.dll",
        "dlss-enabler.ini",
    ] {
        assert!(safe_component_name(name).is_some(), "{name} should be allowed");
    }
}

#[test]
fn rejects_anything_that_is_not_a_bare_allowed_filename() {
    for bad in [
        "../version.dll",          // traversal
        "bin/version.dll",         // a path, not a name
        "bin\\version.dll",        // Windows separator
        "C:version.dll",           // drive-relative
        "game.exe:version.dll",    // NTFS alternate data stream
        "payload.exe",             // executable
        "run.bat",                 // script
        ".hidden.dll",             // dotfile
        "noextension",
        "",
        "..",
    ] {
        assert!(safe_component_name(bad).is_none(), "{bad:?} must be rejected");
    }
}

// ---------------------------------------------------------------------------
// Game-root resolution
// ---------------------------------------------------------------------------

#[test]
fn walks_up_out_of_bin_x64() {
    let root = Path::new("/games/Cyberpunk 2077/bin/x64");
    assert_eq!(
        resolve_game_root(root).unwrap(),
        PathBuf::from("/games/Cyberpunk 2077")
    );
}

#[test]
fn a_launcher_already_at_the_root_stays_there() {
    let root = Path::new("/games/Some Game");
    assert_eq!(resolve_game_root(root).unwrap(), PathBuf::from("/games/Some Game"));
}

#[test]
fn refuses_to_treat_a_shallow_path_as_a_game_root() {
    // Walking up must never reach a drive root or a top-level install folder,
    // because the installer searches and writes inside whatever it returns.
    assert!(resolve_game_root(Path::new("/bin")).is_none());
    assert!(resolve_game_root(Path::new("/")).is_none());
}

#[test]
fn stops_climbing_at_the_depth_floor_instead_of_escaping() {
    // Every component is an engine subdir name, so an unbounded walk would
    // climb to "/". The floor keeps at least two named components.
    let resolved = resolve_game_root(Path::new("/game/bin/x64")).unwrap();
    assert!(
        resolved.components().filter(|c| matches!(c, std::path::Component::Normal(_))).count() >= 2,
        "resolved {} climbed too far",
        resolved.display()
    );
}

// ---------------------------------------------------------------------------
// Component search
// ---------------------------------------------------------------------------

#[test]
fn finds_every_copy_of_a_component_not_just_the_first() {
    let t = TempTree::new("multi");
    t.file("bin/x64/sl.dlss_g.dll", b"original-a");
    t.file("Engine/Binaries/ThirdParty/sl.dlss_g.dll", b"original-b");
    t.file("bin/x64/unrelated.dll", b"leave me");

    let (hits, truncated) = find_components(&t.root, &["sl.dlss_g.dll".to_string()]);
    assert!(!truncated);
    let locations = hits.get("sl.dlss_g.dll").expect("component found");
    assert_eq!(locations.len(), 2, "both copies must be found, got {locations:?}");
    assert!(locations.contains(&"bin/x64/sl.dlss_g.dll".to_string()));
}

#[test]
fn search_is_case_insensitive_because_windows_paths_are() {
    let t = TempTree::new("case");
    t.file("bin/SL.DLSS_G.DLL", b"original");
    let (hits, _) = find_components(&t.root, &["sl.dlss_g.dll".to_string()]);
    assert!(hits.contains_key("sl.dlss_g.dll"), "case must not hide a component");
}

#[test]
fn search_ignores_our_own_backup_folder() {
    let t = TempTree::new("backup");
    t.file(".goh-backup/old/sl.dlss.dll", b"a previous install's original");
    let (hits, _) = find_components(&t.root, &["sl.dlss.dll".to_string()]);
    assert!(
        hits.is_empty(),
        "restoring a backup over itself would corrupt the rollback set"
    );
}

#[cfg(unix)]
#[test]
fn search_does_not_follow_symlinks_out_of_the_install() {
    let t = TempTree::new("symlink");
    let outside = TempTree::new("outside");
    outside.file("secret/sl.dlss.dll", b"not part of the game");
    std::os::unix::fs::symlink(&outside.root, t.root.join("linked")).unwrap();

    let (hits, _) = find_components(&t.root, &["sl.dlss.dll".to_string()]);
    assert!(hits.is_empty(), "a symlink must not pull outside files into scope");
}

// ---------------------------------------------------------------------------
// Containment
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[test]
fn containment_check_sees_through_a_symlinked_directory() {
    let t = TempTree::new("escape");
    let outside = TempTree::new("escape-target");
    fs::create_dir_all(outside.root.join("elsewhere")).unwrap();
    std::os::unix::fs::symlink(outside.root.join("elsewhere"), t.root.join("evil")).unwrap();

    // The path is textually inside the game dir; only canonicalising the
    // parent reveals that writing there lands outside it.
    let target = t.root.join("evil").join("version.dll");
    assert!(target.starts_with(&t.root), "test setup: path looks contained");
    assert!(!is_within(&t.root, &target), "symlinked parent must not pass");
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

#[test]
fn replaces_streamline_components_in_place_and_drops_the_unlocker_by_the_exe() {
    let t = TempTree::new("install");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ fake");
    t.file("bin/x64/sl.dlss_g.dll", b"shipped version");
    t.file("bin/x64/keep.dll", b"untouched");

    let report = install(
        &exe,
        &[
            payload("sl.dlss_g.dll", "sl.dlss_g.dll", FileRole::Streamline, b"pcmax version"),
            payload("version.dll", "version.dll", FileRole::Launcher, b"unlocker"),
        ],
    )
    .expect("install should succeed");

    assert_eq!(t.read("bin/x64/sl.dlss_g.dll"), b"pcmax version");
    assert_eq!(t.read("bin/x64/version.dll"), b"unlocker", "unlocker goes beside the exe");
    assert_eq!(t.read("bin/x64/keep.dll"), b"untouched", "unrelated files must not move");
    assert_eq!(report.written.len(), 2);
    assert!(report.skipped.is_empty());

    // The original is recoverable.
    let backup = PathBuf::from(&report.backup_dir).join("bin/x64/sl.dlss_g.dll");
    assert_eq!(fs::read(&backup).unwrap(), b"shipped version");
}

#[test]
fn replaces_a_component_at_every_location_the_game_ships_it() {
    let t = TempTree::new("everywhere");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/sl.common.dll", b"old-a");
    t.file("Engine/Binaries/sl.common.dll", b"old-b");

    install(&exe, &[payload("sl.common.dll", "sl.common.dll", FileRole::Streamline, b"new")])
        .expect("install should succeed");

    assert_eq!(t.read("bin/x64/sl.common.dll"), b"new");
    assert_eq!(t.read("Engine/Binaries/sl.common.dll"), b"new", "a stale second copy would win at load time");
}

#[test]
fn a_component_the_game_does_not_ship_is_skipped_not_created() {
    let t = TempTree::new("skip");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/sl.dlss.dll", b"shipped");

    let report = install(
        &exe,
        &[
            payload("sl.dlss.dll", "sl.dlss.dll", FileRole::Streamline, b"new dlss"),
            payload("sl.dlss_g.dll", "sl.dlss_g.dll", FileRole::Streamline, b"new frame gen"),
        ],
    )
    .expect("install should succeed");

    assert_eq!(t.read("bin/x64/sl.dlss.dll"), b"new dlss");
    assert!(
        !t.exists("bin/x64/sl.dlss_g.dll"),
        "adding a component the game never had is not a swap"
    );
    assert_eq!(report.skipped.len(), 1);
    assert_eq!(report.written.len(), 1);
}

#[test]
fn a_bad_checksum_aborts_before_anything_is_written() {
    let t = TempTree::new("checksum");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/sl.dlss.dll", b"shipped");

    let mut bad = payload("sl.dlss.dll", "sl.dlss.dll", FileRole::Streamline, b"tampered");
    bad.sha256 = "0".repeat(64);

    let err = install(
        &exe,
        &[
            payload("version.dll", "version.dll", FileRole::Launcher, b"unlocker"),
            bad,
        ],
    )
    .expect_err("a checksum mismatch must fail the install");

    assert!(err.contains("Checksum mismatch"), "unexpected error: {err}");
    assert_eq!(t.read("bin/x64/sl.dlss.dll"), b"shipped", "original must be intact");
    assert!(!t.exists("bin/x64/version.dll"), "no file from the batch may land");
    assert!(!t.exists(".goh-backup"), "a rejected payload must not even create a backup dir");
}

#[test]
fn refuses_a_payload_whose_destination_tries_to_escape() {
    let t = TempTree::new("traversal");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    for dest in ["../../evil.dll", "..\\evil.dll", "evil.exe"] {
        let err = install(&exe, &[payload("version.dll", dest, FileRole::Launcher, b"x")])
            .expect_err("must refuse {dest}");
        assert!(err.contains("Unsafe"), "unexpected error for {dest}: {err}");
    }
}

#[test]
fn refuses_two_payloads_that_target_the_same_file() {
    let t = TempTree::new("collision");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    // Last-write-wins would make the backup bookkeeping ambiguous: the second
    // write's "original" is the first write's output.
    let err = install(
        &exe,
        &[
            payload("version.dll", "version.dll", FileRole::Launcher, b"a"),
            payload("version-b.dll", "version.dll", FileRole::Launcher, b"b"),
        ],
    )
    .expect_err("a target collision must fail");
    assert!(err.contains("both want to write"), "unexpected error: {err}");
}

#[test]
fn install_needs_an_executable_not_a_folder() {
    let t = TempTree::new("notexe");
    let dir = t.root.join("bin/x64");
    fs::create_dir_all(&dir).unwrap();
    let txt = t.file("bin/x64/readme.txt", b"not a game");

    assert!(install(&txt, &[]).is_err(), "a .txt is not a game executable");
    assert!(install(&dir, &[]).is_err(), "a directory is not a game executable");
}

#[test]
fn scan_reports_what_an_install_would_touch_without_touching_it() {
    let t = TempTree::new("scan");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/sl.interposer.dll", b"shipped");

    let report = scan(
        &exe,
        &["sl.interposer.dll".to_string(), "sl.dlss_g.dll".to_string()],
    )
    .expect("scan should succeed");

    assert_eq!(report.game_dir, t.root.to_string_lossy());
    assert_eq!(report.launcher_dir, t.root.join("bin/x64").to_string_lossy());
    assert_eq!(report.found.len(), 1);
    assert_eq!(report.missing, vec!["sl.dlss_g.dll".to_string()]);
    assert!(!t.exists(".goh-backup"), "a scan writes nothing");
}
