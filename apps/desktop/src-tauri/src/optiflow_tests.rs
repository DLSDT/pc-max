//! Real-filesystem tests for the OptiFlow installer.
//!
//! Every case builds an actual game-shaped directory tree under the OS temp
//! dir and runs the shipped functions against it — no mocks. The install path
//! writes into whatever the user picked, so the properties worth proving are
//! the ones about what it refuses to write, and each of those tests was first
//! confirmed to fail against a version of the code without its guard.

use super::optiflow::{
    depth_ok, find_components, install, is_within, resolve_game_root, safe_component_name, scan,
    uninstall,
    FileRole, InstalledFile, OptiFlowFile,
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

#[test]
fn containment_allows_a_folder_the_install_is_about_to_create() {
    // canonicalize() fails on a path that does not exist, and this check used
    // to run it on the immediate parent — so a destination one folder deep was
    // refused as "outside the game folder" for the sole reason that the folder
    // had not been created yet.
    let t = TempTree::new("nested-ok");
    let target = t.root.join("OptiScaler").join("libxess_fg.dll");
    assert!(!t.root.join("OptiScaler").exists(), "test setup: the folder is missing");
    assert!(is_within(&t.root, &target));
}

#[cfg(unix)]
#[test]
fn containment_still_refuses_a_missing_folder_under_a_symlinked_parent() {
    // The fix walks up to the deepest ancestor that exists. That ancestor is
    // exactly where a symlink could be hiding, so the escape must still be
    // caught when the leaf folders are the ones missing.
    let t = TempTree::new("nested-escape");
    let outside = TempTree::new("nested-escape-target");
    fs::create_dir_all(outside.root.join("elsewhere")).unwrap();
    std::os::unix::fs::symlink(outside.root.join("elsewhere"), t.root.join("evil")).unwrap();

    let target = t.root.join("evil").join("not-created-yet").join("version.dll");
    assert!(!is_within(&t.root, &target), "a symlinked ancestor must still be caught");
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
fn installs_a_file_into_a_subfolder_the_game_does_not_have_yet() {
    // OptiScaler drops its payload into its own folder. Nothing had ever
    // installed into a folder that did not already exist, so the containment
    // check refused the whole batch: "Refusing to write outside the game
    // folder: …\OptiScaler/libxess_fg.dll".
    let t = TempTree::new("subfolder");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    let report = install(
        &exe,
        &[payload("libxess_fg.dll", "OptiScaler/libxess_fg.dll", FileRole::Relative, b"fg bytes")],
    )
    .expect("a destination one folder deep must install");

    assert_eq!(t.read("OptiScaler/libxess_fg.dll"), b"fg bytes");
    assert_eq!(report.written.len(), 1);
}

#[test]
fn installs_a_whole_directory_tree_and_keeps_its_shape() {
    // A package can name a folder as its destination — OptiScaler ships into
    // one. The question this pins is whether nesting survives: a payload bound
    // for `Optim/data/x.dll` must land there and not be flattened to `x.dll`
    // beside the executable, which would leave the game unable to find it.
    let t = TempTree::new("tree");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    let report = install(
        &exe,
        &[
            payload("a.dll", "Optim/a.dll", FileRole::Relative, b"one"),
            payload("b.dll", "Optim/data/b.dll", FileRole::Relative, b"two"),
            payload("c.ini", "Optim/data/deep/c.ini", FileRole::Relative, b"three"),
        ],
    )
    .expect("a directory tree must install");

    assert_eq!(t.read("Optim/a.dll"), b"one");
    assert_eq!(t.read("Optim/data/b.dll"), b"two");
    assert_eq!(t.read("Optim/data/deep/c.ini"), b"three");
    assert_eq!(report.written.len(), 3);
    // Nothing was flattened into the game root beside the executable.
    assert!(!t.exists("a.dll"), "a.dll was flattened out of its folder");
    assert!(!t.exists("bin/x64/b.dll"), "b.dll landed beside the exe");
}

#[test]
fn a_directory_tree_comes_back_out_again() {
    // Removal reads the record, so a nested file has to be found by the path it
    // was written to rather than by name.
    let t = TempTree::new("tree-remove");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("Optim/keep-me.txt", b"the user put this here");

    let report = install(
        &exe,
        &[payload("a.dll", "Optim/data/a.dll", FileRole::Relative, b"one")],
    )
    .unwrap();

    let record: Vec<InstalledFile> = report
        .written
        .iter()
        .map(|w| InstalledFile { path: w.path.clone(), replaced: w.replaced })
        .collect();
    let un = uninstall(&exe, Path::new(&report.backup_dir), &record).expect("uninstall");

    assert_eq!(un.removed.len(), 1, "{un:?}");
    assert!(!t.exists("Optim/data/a.dll"));
    // A file the user had in that folder is not ours and must survive.
    assert_eq!(t.read("Optim/keep-me.txt"), b"the user put this here".to_vec());
}

#[test]
fn a_destination_cannot_climb_out_of_the_game_folder() {
    // The same directory support that lets a package nest is what a crafted
    // package would use to escape, so the escape is pinned beside the feature.
    let t = TempTree::new("tree-escape");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    for bad in [
        "../outside.dll",
        "Optim/../../outside.dll",
        "/etc/passwd.dll",
        "C:/Windows/system32/evil.dll",
        "Optim/../../../evil.dll",
    ] {
        let err = install(&exe, &[payload("x.dll", bad, FileRole::Relative, b"x")])
            .expect_err(&format!("{bad} must be refused"));
        assert!(
            err.starts_with("unsafe_destination|") || err.starts_with("outside_game_folder|"),
            "unexpected error for {bad}: {err}"
        );
    }
}

#[test]
fn optiscalers_folder_lands_beside_the_executable_not_at_the_game_root() {
    // The bug this pins, in the shape it was reported: the Plan and the Order
    // arrived and the OptiScaler folder did not.
    //
    // OptiScaler is one directory's worth of files. A proxy DLL under the name
    // of something the game already loads (the Plan), a config beside it (the
    // Order), and a folder of backend libraries the proxy opens by relative
    // path. All three have to be in the SAME folder as the executable.
    //
    // The first two are `launcher` files and were always correct. The folder
    // could only be expressed as `relative`, which resolves against the game
    // ROOT — here two levels above `bin/x64`, so the DLL that went looking for
    // `OptiScaler/libxess.dll` beside itself found nothing and the tool did
    // not work. The folder was on disk; it was in the wrong place.
    let t = TempTree::new("optiscaler-layout");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    let report = install(
        &exe,
        &[
            payload("OptiScaler.dll", "dxgi.dll", FileRole::Launcher, b"the proxy"),
            payload("OptiScaler.ini", "OptiScaler.ini", FileRole::Launcher, b"[Upscalers]"),
            payload("libxess.dll", "OptiScaler/libxess.dll", FileRole::Launcher, b"xess"),
            payload(
                "amd_fidelityfx_vk.dll",
                "OptiScaler/amd_fidelityfx_vk.dll",
                FileRole::Launcher,
                b"fsr",
            ),
        ],
    )
    .expect("an OptiScaler-shaped payload must install");

    // Everything in one directory — the one holding the executable.
    assert_eq!(t.read("bin/x64/dxgi.dll"), b"the proxy");
    assert_eq!(t.read("bin/x64/OptiScaler.ini"), b"[Upscalers]");
    assert_eq!(t.read("bin/x64/OptiScaler/libxess.dll"), b"xess");
    assert_eq!(t.read("bin/x64/OptiScaler/amd_fidelityfx_vk.dll"), b"fsr");
    assert_eq!(report.written.len(), 4);

    // And nothing at the game root, which is where the folder used to go.
    assert!(
        !t.exists("OptiScaler"),
        "the backend folder landed at the game root, two levels above the exe that loads it"
    );
}

#[test]
fn the_published_optiscaler_manifest_installs_into_one_directory() {
    // The destinations below are the ones the live package actually serves —
    // one Plan and one Order out of the published sets, plus all eleven base
    // files. Pinning the real list catches what the four-file case above
    // cannot: that nothing in the full combination collides (`OptiScaler.dll`
    // the file sits beside `OptiScaler/` the folder), and that every one of the
    // twenty files lands in the same directory as the executable.
    let t = TempTree::new("optiscaler-real");
    let exe = t.file("Bin/Win64/TheGame.exe", b"MZ");

    let base = [
        "OptiScaler.dll",
        "OptiScaler/amd_fidelityfx_framegeneration_dx12.dll",
        "OptiScaler/amd_fidelityfx_loader_dx12.dll",
        "OptiScaler/amd_fidelityfx_upscaler_dx12.dll",
        "OptiScaler/amd_fidelityfx_vk.dll",
        "OptiScaler/dlss-enabler-headless.dll",
        "OptiScaler/dlssg_to_fsr3_amd_is_better.dll",
        "OptiScaler/libxell.dll",
        "OptiScaler/libxess.dll",
        "OptiScaler/libxess_dx11.dll",
        "OptiScaler/libxess_fg.dll",
    ];
    let mut files: Vec<OptiFlowFile> = base
        .iter()
        .map(|d| {
            let name = d.rsplit('/').next().unwrap();
            payload(name, d, FileRole::Launcher, d.as_bytes())
        })
        .collect();
    // The user's two choices: a proxy name the game already loads, and a profile.
    files.push(payload("OptiScaler.dll", "dxgi.dll", FileRole::Launcher, b"plan"));
    files.push(payload("OptiScaler.ini", "OptiScaler.ini", FileRole::Launcher, b"order"));

    let report = install(&exe, &files).expect("the published manifest must install");
    assert_eq!(report.written.len(), 13);
    assert!(report.skipped.is_empty(), "{:?}", report.skipped);

    // Every file in the executable's own folder, and the folder is a folder.
    for d in base {
        assert_eq!(t.read(&format!("Bin/Win64/{d}")), d.as_bytes(), "{d} is not beside the exe");
    }
    assert_eq!(t.read("Bin/Win64/dxgi.dll"), b"plan");
    assert_eq!(t.read("Bin/Win64/OptiScaler.ini"), b"order");
    assert!(t.root.join("Bin/Win64/OptiScaler").is_dir());
    assert!(!t.exists("OptiScaler"), "the backend folder is at the game root again");
}

#[test]
fn a_folder_beside_the_executable_comes_back_out_again() {
    let t = TempTree::new("optiscaler-remove");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/dxgi.dll", b"the game's own dxgi");

    let report = install(
        &exe,
        &[
            payload("OptiScaler.dll", "dxgi.dll", FileRole::Launcher, b"the proxy"),
            payload("libxess.dll", "OptiScaler/libxess.dll", FileRole::Launcher, b"xess"),
        ],
    )
    .unwrap();

    let record: Vec<InstalledFile> = report
        .written
        .iter()
        .map(|w| InstalledFile { path: w.path.clone(), replaced: w.replaced })
        .collect();
    let un = uninstall(&exe, Path::new(&report.backup_dir), &record).expect("uninstall");

    // The proxy displaced a real file, so that one is restored rather than
    // deleted; the library was ours to begin with and goes.
    assert_eq!(un.restored, vec![t.root.join("bin/x64/dxgi.dll").to_string_lossy().to_string()]);
    assert_eq!(t.read("bin/x64/dxgi.dll"), b"the game's own dxgi".to_vec());
    assert!(!t.exists("bin/x64/OptiScaler/libxess.dll"));
}

#[test]
fn a_launcher_destination_cannot_climb_out_either() {
    // The launcher role takes a path now, which is the same lever the relative
    // role gives a crafted package. Its base is deeper in the tree, so `..`
    // stays inside the game folder for two levels before leaving it — the
    // containment check has to be what stops it, not the depth.
    let t = TempTree::new("launcher-escape");
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");

    for bad in [
        "../loot.dll",
        "../../loot.dll",
        "OptiScaler/../../../loot.dll",
        "/etc/passwd.dll",
        "C:/Windows/system32/evil.dll",
    ] {
        let err = install(&exe, &[payload("x.dll", bad, FileRole::Launcher, b"x")])
            .expect_err(&format!("{bad} must be refused"));
        assert!(
            err.starts_with("unsafe_destination|") || err.starts_with("outside_game_folder|"),
            "unexpected error for {bad}: {err}"
        );
    }
    assert!(!t.exists("bin/loot.dll"));
    assert!(!t.exists("loot.dll"));
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

    assert!(err.starts_with("checksum_mismatch|"), "unexpected error: {err}");
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
        assert!(err.starts_with("unsafe_"), "unexpected error for {dest}: {err}");
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
    assert!(err.starts_with("duplicate_target|"), "unexpected error: {err}");
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

// ---------------------------------------------------------------------------
// Uninstall
// ---------------------------------------------------------------------------

mod uninstall_tests {
    use super::*;
    use crate::optiflow::{install, uninstall, InstalledFile};

    /// Build a game, install into it, then undo — the round trip must leave the
    /// tree byte-identical to how it started.
    #[test]
    fn uninstall_restores_the_game_to_its_original_state() {
        let t = TempTree::new("uninstall-round");
        let exe = t.file("bin/x64/TheGame.exe", b"MZ");
        t.file("bin/x64/sl.dlss_g.dll", b"ORIGINAL SHIPPED BUILD");
        t.file("bin/x64/GameSaves.dat", b"precious");

        let report = install(
            &exe,
            &[
                payload("sl.dlss_g.dll", "sl.dlss_g.dll", FileRole::Streamline, b"pcmax build"),
                payload("OptiScaler.dll", "OptiScaler.dll", FileRole::Launcher, b"drop-in"),
            ],
        )
        .expect("install");

        assert_eq!(t.read("bin/x64/sl.dlss_g.dll"), b"pcmax build");
        assert!(t.exists("bin/x64/OptiScaler.dll"));

        let installed: Vec<InstalledFile> = report
            .written
            .iter()
            .map(|w| InstalledFile { path: w.path.clone(), replaced: w.replaced })
            .collect();

        let un = uninstall(&exe, Path::new(&report.backup_dir), &installed).expect("uninstall");

        assert_eq!(t.read("bin/x64/sl.dlss_g.dll"), b"ORIGINAL SHIPPED BUILD", "replaced file not restored");
        assert!(!t.exists("bin/x64/OptiScaler.dll"), "added file not removed");
        assert_eq!(t.read("bin/x64/GameSaves.dat"), b"precious", "unrelated file touched");
        assert_eq!(un.restored.len(), 1);
        assert_eq!(un.removed.len(), 1);
        assert!(un.failed.is_empty(), "{:?}", un.failed);
    }

    #[test]
    fn uninstall_never_touches_a_same_named_file_it_did_not_install() {
        // The property that stops "remove OptiScaler" from deleting a copy the
        // user installed by hand, or one the game itself ships elsewhere.
        let t = TempTree::new("uninstall-scope");
        let exe = t.file("bin/x64/TheGame.exe", b"MZ");
        t.file("bin/x64/sl.dlss_g.dll", b"shipped");
        t.file("mods/OptiScaler.dll", b"the user's own copy");
        t.file("Engine/Binaries/sl.dlss_g.dll", b"a second shipped copy");

        // Install touching ONLY the launcher folder's copy.
        let report = install(
            &exe,
            &[payload("OptiScaler.dll", "OptiScaler.dll", FileRole::Launcher, b"drop-in")],
        )
        .expect("install");

        let installed: Vec<InstalledFile> = report
            .written
            .iter()
            .map(|w| InstalledFile { path: w.path.clone(), replaced: w.replaced })
            .collect();
        uninstall(&exe, Path::new(&report.backup_dir), &installed).expect("uninstall");

        assert_eq!(t.read("mods/OptiScaler.dll"), b"the user's own copy", "deleted a same-named file it never installed");
        assert_eq!(t.read("Engine/Binaries/sl.dlss_g.dll"), b"a second shipped copy");
        assert_eq!(t.read("bin/x64/sl.dlss_g.dll"), b"shipped");
    }

    #[test]
    fn a_missing_backup_leaves_the_file_alone_and_says_so() {
        // Deleting a replaced file whose backup is gone would destroy the very
        // original the backup existed to hold.
        let t = TempTree::new("uninstall-nobackup");
        let exe = t.file("bin/x64/TheGame.exe", b"MZ");
        t.file("bin/x64/sl.dlss.dll", b"shipped");

        let report = install(&exe, &[payload("sl.dlss.dll", "sl.dlss.dll", FileRole::Streamline, b"new")]).unwrap();
        fs::remove_dir_all(&report.backup_dir).unwrap();

        let installed: Vec<InstalledFile> = report
            .written
            .iter()
            .map(|w| InstalledFile { path: w.path.clone(), replaced: w.replaced })
            .collect();
        let un = uninstall(&exe, Path::new(&report.backup_dir), &installed).unwrap();

        assert!(t.exists("bin/x64/sl.dlss.dll"), "file deleted despite having no backup to restore");
        assert_eq!(un.failed.len(), 1);
        assert!(un.failed[0].reason.contains("backup is missing"));
        assert!(un.removed.is_empty());
    }

    #[test]
    fn uninstall_refuses_a_recorded_path_outside_the_game_folder() {
        // The record comes off disk, so it is re-validated rather than trusted.
        let t = TempTree::new("uninstall-escape");
        let exe = t.file("bin/x64/TheGame.exe", b"MZ");
        let backup = t.root.join(".goh-backup");
        std::fs::create_dir_all(&backup).unwrap();
        let outside = TempTree::new("uninstall-outside");
        let victim = outside.file("important.dll", b"not ours");

        let un = uninstall(
            &exe,
            &backup,
            &[InstalledFile { path: victim.to_string_lossy().to_string(), replaced: false }],
        )
        .unwrap();

        assert!(victim.exists(), "deleted a file outside the game folder");
        assert_eq!(un.failed.len(), 1);
        assert!(un.failed[0].reason.contains("outside the game folder"));
    }

    #[test]
    fn an_already_gone_file_is_reported_not_failed() {
        let t = TempTree::new("uninstall-gone");
        let exe = t.file("bin/x64/TheGame.exe", b"MZ");
        let backup = t.root.join(".goh-backup");
        std::fs::create_dir_all(&backup).unwrap();
        let un = uninstall(
            &exe,
            &backup,
            &[InstalledFile { path: t.root.join("never-existed.dll").to_string_lossy().to_string(), replaced: false }],
        )
        .unwrap();
        assert_eq!(un.missing.len(), 1);
        assert!(un.failed.is_empty());
    }
}

// ---------------------------------------------------------------------------
// Uninstall boundary
// ---------------------------------------------------------------------------

/// Build a game tree with one installed file recorded, and return
/// (exe, backup_dir, record) ready to hand to `uninstall`.
fn installed_fixture(label: &str) -> (TempTree, PathBuf, PathBuf, Vec<InstalledFile>) {
    let t = TempTree::new(label);
    let exe = t.file("bin/x64/TheGame.exe", b"MZ");
    t.file("bin/x64/sl.dlss.dll", b"pcmax version");
    let backup = t.root.join(".goh-backup/x");
    fs::create_dir_all(backup.join("bin/x64")).unwrap();
    fs::write(backup.join("bin/x64/sl.dlss.dll"), b"original").unwrap();
    let rec = vec![InstalledFile {
        path: t.root.join("bin/x64/sl.dlss.dll").to_string_lossy().to_string(),
        replaced: true,
    }];
    (t, exe, backup, rec)
}

#[test]
fn uninstall_restores_the_original_from_the_backup() {
    let (t, exe, backup, rec) = installed_fixture("uninst-ok");
    let report = uninstall(&exe, &backup, &rec).expect("uninstall should succeed");
    assert_eq!(report.restored.len(), 1, "{report:?}");
    assert_eq!(t.read("bin/x64/sl.dlss.dll"), b"original".to_vec());
}

#[cfg(unix)]
#[test]
fn uninstall_restores_when_the_recorded_path_is_not_in_canonical_form() {
    // On Windows canonicalize() hands back a `\\?\` verbatim path while the
    // install records a plain `F:\…` one. Stripping the record against the
    // canonical root therefore never matched, and every replaced file came
    // back "unexpected path" — a removal that restored nothing and told the
    // user only that something was unexpected.
    //
    // A symlinked root reproduces exactly that divergence on a platform CI
    // runs on: the recorded path and the canonical root name the same file
    // through different spellings.
    let (t, _real_exe, _real_backup, _rec) = installed_fixture("uninst-noncanon");
    let holder = TempTree::new("uninst-noncanon-link");
    let game = holder.root.join("TheGameInstall");
    std::os::unix::fs::symlink(&t.root, &game).unwrap();

    let exe = game.join("bin/x64/TheGame.exe");
    let backup = game.join(".goh-backup/x");
    let rec = vec![InstalledFile {
        path: game.join("bin/x64/sl.dlss.dll").to_string_lossy().to_string(),
        replaced: true,
    }];

    let report = uninstall(&exe, &backup, &rec).expect("uninstall should succeed");

    assert_eq!(report.restored.len(), 1, "the original must come back: {report:?}");
    assert!(report.failed.is_empty(), "{report:?}");
    assert_eq!(t.read("bin/x64/sl.dlss.dll"), b"original".to_vec());
}

#[test]
fn uninstall_refuses_a_backup_folder_outside_the_game() {
    // The boundary must not be something the caller can move. A record pointing
    // at a backup elsewhere on disk would let a crafted record copy arbitrary
    // bytes over a real game file.
    let (_t, exe, _backup, rec) = installed_fixture("uninst-backup");
    let elsewhere = TempTree::new("uninst-elsewhere");
    fs::create_dir_all(elsewhere.root.join("bin/x64")).unwrap();
    fs::write(elsewhere.root.join("bin/x64/sl.dlss.dll"), b"attacker bytes").unwrap();

    let err = uninstall(&exe, &elsewhere.root, &rec).expect_err("must refuse an outside backup");
    assert!(err.starts_with("backup_outside|"), "unexpected: {err}");
}

#[test]
fn uninstall_refuses_a_recorded_path_outside_the_game() {
    let (_t, exe, backup, _rec) = installed_fixture("uninst-escape");
    let outside = TempTree::new("uninst-target");
    let victim = outside.file("important.dll", b"do not touch");

    let rec = vec![InstalledFile { path: victim.to_string_lossy().to_string(), replaced: false }];
    let report = uninstall(&exe, &backup, &rec).expect("should report, not error");
    assert_eq!(report.removed.len(), 0);
    assert_eq!(report.failed.len(), 1);
    assert!(victim.is_file(), "a file outside the game folder was deleted");
}

#[test]
fn uninstall_refuses_a_recorded_path_this_installer_could_not_have_written() {
    // Every path install could write had an allowlisted extension. A record
    // naming a .exe was not written by us, so removing it is not ours to do.
    let (t, exe, backup, _rec) = installed_fixture("uninst-ext");
    let other = t.file("bin/x64/GameLauncher.exe", b"the real launcher");

    let rec = vec![InstalledFile { path: other.to_string_lossy().to_string(), replaced: false }];
    let report = uninstall(&exe, &backup, &rec).expect("should report, not error");
    assert_eq!(report.removed.len(), 0);
    assert_eq!(report.failed.len(), 1);
    assert!(other.is_file(), "the game's own launcher was deleted");
}

#[test]
fn uninstall_derives_the_root_from_the_exe_not_from_the_caller() {
    // The old signature took game_dir and files[].path from the same caller and
    // checked one against the other. Passing an exe whose real root does not
    // contain the recorded file must now fail closed.
    let (_t, _exe, backup, rec) = installed_fixture("uninst-derive");
    let other_game = TempTree::new("uninst-othergame");
    let other_exe = other_game.file("bin/x64/Other.exe", b"MZ");

    let report = uninstall(&other_exe, &backup, &rec);
    // Either the backup is rejected as outside that game, or the recorded path is.
    match report {
        Err(e) => assert!(
            e.starts_with("backup_outside|") || e.starts_with("not_in_game_folder|"),
            "unexpected: {e}"
        ),
        Ok(r) => assert_eq!(r.restored.len(), 0, "restored across two different games: {r:?}"),
    }
}

#[test]
#[cfg(windows)]
fn a_game_directly_on_a_drive_root_is_a_game_folder() {
    // The layout that broke in the field: a second drive holding games at its
    // top level. `E:\Resident Evil 2 2019` has one named component, and the
    // old two-component floor rejected it with "That executable is not inside
    // a game folder" — every install on a drive root, refused.
    let dir = Path::new(r"E:\Resident Evil 2 2019");
    assert_eq!(resolve_game_root(dir).unwrap(), PathBuf::from(r"E:\Resident Evil 2 2019"));
}

#[test]
#[cfg(windows)]
fn a_bare_drive_root_is_still_refused() {
    // The floor exists to stop the installer searching and writing across a
    // whole drive. Allowing the case above must not cost that.
    assert!(resolve_game_root(Path::new(r"E:\")).is_none());
    assert!(resolve_game_root(Path::new(r"C:\")).is_none());
}

#[test]
#[cfg(windows)]
fn walks_up_out_of_bin_x64_on_a_drive_root() {
    let dir = Path::new(r"E:\Cyberpunk 2077\bin\x64");
    assert_eq!(resolve_game_root(dir).unwrap(), PathBuf::from(r"E:\Cyberpunk 2077"));
}

#[test]
fn a_game_on_a_drive_root_clears_the_depth_floor() {
    // `E:\Resident Evil 2 2019` — one named component under a drive prefix.
    // The old rule demanded two named components and refused it, so every game
    // installed at the top of a second drive reported "That executable is not
    // inside a game folder". Reported from a real machine.
    assert!(depth_ok(1, true), "a game directly on a drive root must qualify");
}

#[test]
fn a_bare_drive_root_still_fails_the_depth_floor() {
    // What the floor is actually for: never let the installer treat a whole
    // drive as the game folder and search or write across it.
    assert!(!depth_ok(0, true), "E:\\ must never be a game root");
}

#[test]
fn posix_still_needs_two_named_components() {
    // Unchanged off Windows: `/games/Foo` yes, `/games` no.
    assert!(depth_ok(2, false));
    assert!(!depth_ok(1, false));
    assert!(!depth_ok(0, false));
}

