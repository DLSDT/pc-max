//! Real end-to-end tests for the One-Click Optimization file pipeline.
//!
//! These exercise the exact shipped functions (`safe_destination`,
//! `apply_game_files`, `rollback`) against a real temporary filesystem that
//! mimics a game installation (files, nested dirs, files that must remain
//! untouched). No mocks, no simulated FS.

use super::{apply_game_files, detect_games, safe_destination, GameFilePayload, KnownExecutable};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static DIR_SEQ: AtomicU64 = AtomicU64::new(0);

/// A real, isolated fake game installation under the OS temp dir.
struct TestGameDir {
    root: PathBuf,
}

impl TestGameDir {
    fn new() -> Self {
        let seq = DIR_SEQ.fetch_add(1, Ordering::SeqCst);
        let root = std::env::temp_dir().join(format!(
            "goh-install-test-{}-{}",
            std::process::id(),
            seq
        ));
        // Realistic layout: executable, dlls, configs, a nested folder, and a
        // file that must NEVER be touched by an optimization.
        fs::create_dir_all(root.join("nested/deeper")).unwrap();
        fs::create_dir_all(root.join("data")).unwrap();
        fs::write(root.join("Game.exe"), b"original exe bytes").unwrap();
        fs::write(root.join("engine.dll"), b"original dll bytes").unwrap();
        fs::write(root.join("settings.cfg"), b"original settings").unwrap();
        fs::write(root.join("nested/deeper/level.cfg"), b"original level cfg").unwrap();
        fs::write(root.join("data/keep.bin"), b"do not touch me").unwrap();
        TestGameDir { root }
    }

    /// Path of a file inside the fake install.
    fn p(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn sha(&self, rel: &str) -> String {
        sha256_hex(&fs::read(self.p(rel)).expect("file must exist"))
    }

    /// Every file that should remain untouched by an optimization.
    fn untouched(&self) -> Vec<(&'static str, String)> {
        vec![
            ("Game.exe", sha256_hex(b"original exe bytes")),
            ("engine.dll", sha256_hex(b"original dll bytes")),
            ("data/keep.bin", sha256_hex(b"do not touch me")),
        ]
    }
}

impl Drop for TestGameDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn payload(dest: &str, content: &[u8]) -> GameFilePayload {
    GameFilePayload {
        destination: dest.to_string(),
        content_base64: base64::engine::general_purpose::STANDARD.encode(content),
        sha256: sha256_hex(content),
    }
}

fn payload_corrupt(dest: &str, content: &[u8]) -> GameFilePayload {
    let mut p = payload(dest, content);
    // Flip the hash so it can never match the content.
    p.sha256 = format!("0{}", &p.sha256[1..]);
    p
}

// ---------------------------------------------------------------------------
// safe_destination — path validation (every payload from the security spec)
// ---------------------------------------------------------------------------

#[test]
fn accepts_safe_destinations() {
    let game = PathBuf::from("C:/Games/GTA V Test");
    for dest in [
        "settings.cfg",
        "nested/deeper/level.cfg",
        "folder with spaces/game.ini",
        "profiles/user1.json",
        // A middle `.` normalizes away (Rust components() strips it) and the
        // result stays inside the game dir — same semantics as the server.
        "a/./b.cfg",
    ] {
        let resolved = safe_destination(&game, dest);
        assert!(resolved.is_some(), "should accept {dest:?}");
        assert!(
            resolved.unwrap().starts_with(&game),
            "resolved path must stay under the game dir"
        );
    }
}

#[test]
fn rejects_path_traversal_and_absolute_payloads() {
    let game = PathBuf::from("C:/Games/GTA V Test");
    // Every payload the security spec lists (plus equivalents).
    for dest in [
        r"..\outside.txt",
        "../../outside.txt",
        "../outside.txt",
        r"C:\Windows\System32\test.dll",
        "C:/Windows/System32/test.dll",
        r"C:\Users\Public\test.txt",
        r"\\server\share\test.dll",
        r"//server/share/test.dll",
        "/etc/passwd",
        "a/../b.cfg",
        ".hidden.cfg",
        "nested/..",
        "",
        "no-extension",
        "script.exe",
        "run.bat",
        "evil.ps1",
        "shell.sh",
        "a\\b.cfg", // backslash anywhere is rejected (Windows separator)
        // NTFS alternate data streams: Windows creates a file named for the
        // part BEFORE the colon, so the allowlist would see ".dll" while an
        // ".exe" appeared in the game directory.
        "foo.exe:payload.dll",
        "a.bat:x.cfg",
        "settings.cfg:extra.cfg",
    ] {
        assert!(
            safe_destination(&game, dest).is_none(),
            "must reject {dest:?}"
        );
    }
}

#[test]
fn rejects_absolute_resolution_after_normalization() {
    let game = PathBuf::from("C:/Games/GTA V Test");
    assert!(safe_destination(&game, "settings.cfg").is_some());
    // Path::new normalizes "." — the components() check must still reject it.
    assert!(safe_destination(&game, "./settings.cfg").is_none());
}

// ---------------------------------------------------------------------------
// apply_game_files — real filesystem behaviour
// ---------------------------------------------------------------------------

#[test]
fn installs_files_atomically_and_keeps_unrelated_files_untouched() {
    let game = TestGameDir::new();
    let before = game.sha("settings.cfg");
    assert_ne!(before, sha256_hex(b"optimized settings"));

    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![
            payload("settings.cfg", b"optimized settings"),
            payload("nested/deeper/level.cfg", b"optimized level cfg"),
            payload("nested/new_file.ini", b"brand new ini"),
        ],
    );
    assert!(res.is_ok(), "apply failed: {res:?}");

    // Installed content matches the package exactly.
    assert_eq!(game.sha("settings.cfg"), sha256_hex(b"optimized settings"));
    assert_eq!(
        game.sha("nested/deeper/level.cfg"),
        sha256_hex(b"optimized level cfg")
    );
    assert_eq!(
        game.sha("nested/new_file.ini"),
        sha256_hex(b"brand new ini")
    );

    // Unrelated files are byte-identical.
    for (rel, expected) in game.untouched() {
        assert_eq!(game.sha(rel), expected, "{rel} must remain untouched");
    }

    // A backup of the original was created and preserves the ORIGINAL bytes.
    let backups: Vec<PathBuf> = fs::read_dir(game.root.join(".goh-backup"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .collect();
    assert_eq!(backups.len(), 1, "one backup snapshot");
    let orig = fs::read(backups[0].join("settings.cfg")).unwrap();
    assert_eq!(orig, b"original settings", "backup must hold the original");
}

#[test]
fn checksum_mismatch_stops_installation_and_modifies_nothing() {
    let game = TestGameDir::new();
    let before = game.sha("settings.cfg");

    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![
            payload("settings.cfg", b"optimized settings"),
            // Corrupt hash — the pipeline must refuse BEFORE any write.
            payload_corrupt("nested/deeper/level.cfg", b"evil payload"),
        ],
    );
    assert!(res.is_err(), "corrupt package must fail");
    let err = res.unwrap_err().to_lowercase();
    assert!(err.contains("checksum"), "error should name the checksum: {err}");

    // Nothing was modified — original hash intact, no partial install.
    assert_eq!(game.sha("settings.cfg"), before);
    assert_eq!(
        game.sha("nested/deeper/level.cfg"),
        sha256_hex(b"original level cfg")
    );
    for (rel, expected) in game.untouched() {
        assert_eq!(game.sha(rel), expected);
    }
    // No backup dir survives a failed (pre-write) attempt.
    assert!(!game.root.join(".goh-backup").exists());
}

#[test]
fn unsafe_destination_is_rejected_before_any_write() {
    let game = TestGameDir::new();
    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![payload("../outside.txt", b"escape attempt")],
    );
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Unsafe destination"));

    // Nothing was created inside OR outside the game dir.
    assert!(!game.p("../outside.txt").exists());
    assert!(!game.root.join(".goh-backup").exists());
    for (rel, expected) in game.untouched() {
        assert_eq!(game.sha(rel), expected);
    }
}

#[test]
fn duplicate_destinations_are_rejected() {
    let game = TestGameDir::new();
    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![
            payload("settings.cfg", b"first"),
            payload("settings.cfg", b"second"),
        ],
    );
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("Duplicate destination"));
    assert_eq!(game.sha("settings.cfg"), sha256_hex(b"original settings"));
}

#[test]
fn mid_batch_failure_rolls_back_every_applied_file() {
    let game = TestGameDir::new();
    let before = game.sha("settings.cfg");

    // `blocker` exists as a FILE, so create_dir_all("blocker/child.cfg")
    // fails mid-batch after settings.cfg was already applied.
    fs::write(game.p("blocker"), b"i am a file, not a dir").unwrap();

    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![
            payload("settings.cfg", b"optimized settings"),
            payload("blocker/child.cfg", b"can never land"),
        ],
    );
    assert!(res.is_err(), "mid-batch failure must surface");

    // Rollback: the first file was applied, then removed/restored — the
    // original hash must be exactly preserved.
    assert_eq!(game.sha("settings.cfg"), before);
    assert!(!game.p("blocker/child.cfg").exists());
    // No leftover tmp files anywhere in the tree.
    let leftovers = walk(&game.root, |p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.contains(".goh-tmp"))
            .unwrap_or(false)
    });
    assert!(leftovers.is_empty(), "no tmp files may remain: {leftovers:?}");
    for (rel, expected) in game.untouched() {
        assert_eq!(game.sha(rel), expected);
    }
}

#[test]
#[cfg(not(target_os = "windows"))]
fn read_only_target_failure_restores_exact_original_hash() {
    let game = TestGameDir::new();
    let before = game.sha("settings.cfg");
    let ro = game.p("data");
    // Make the parent dir read-only so the temp write fails deterministically.
    fs::write(ro.join("locked.cfg"), b"original locked").unwrap();
    let mut perms = fs::metadata(&ro).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&ro, perms).unwrap();

    let res = apply_game_files(
        game.root.to_string_lossy().to_string(),
        vec![
            payload("settings.cfg", b"optimized settings"),
            payload("data/locked.cfg", b"should fail"),
        ],
    );
    let mut perms = fs::metadata(&ro).unwrap().permissions();
    perms.set_readonly(false);
    fs::set_permissions(&ro, perms).unwrap();
    assert!(res.is_err(), "read-only dir must fail the apply");

    // settings.cfg was applied first, then rolled back to its original.
    assert_eq!(game.sha("settings.cfg"), before);
    assert_eq!(game.sha("data/locked.cfg"), sha256_hex(b"original locked"));
    assert_eq!(game.sha("data/keep.bin"), sha256_hex(b"do not touch me"));
}

#[test]
fn repeated_installations_are_clean_and_cumulative() {
    let game = TestGameDir::new();

    let run = |content: &[u8]| {
        apply_game_files(
            game.root.to_string_lossy().to_string(),
            vec![
                payload("settings.cfg", content),
                payload("nested/deeper/level.cfg", b"level v1"),
            ],
        )
        .is_ok()
    };

    assert!(run(b"optimized v1"));
    assert!(run(b"optimized v2"));
    assert!(run(b"optimized v3"));

    // Final state is exactly the last package — no corruption.
    assert_eq!(game.sha("settings.cfg"), sha256_hex(b"optimized v3"));
    // No tmp debris accumulated across runs.
    let leftovers = walk(&game.root, |p| {
        p.file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.contains(".goh-tmp"))
            .unwrap_or(false)
    });
    assert!(leftovers.is_empty());
    // One backup snapshot per run.
    let backups: Vec<_> = fs::read_dir(game.root.join(".goh-backup"))
        .unwrap()
        .collect();
    assert_eq!(backups.len(), 3, "3 runs → 3 backup snapshots");
    for (rel, expected) in game.untouched() {
        assert_eq!(game.sha(rel), expected);
    }
}

#[test]
fn missing_game_directory_is_rejected() {
    let res = apply_game_files(
        "/definitely/not/a/game/dir-xyz".to_string(),
        vec![payload("settings.cfg", b"x")],
    );
    assert!(res.is_err());
    assert!(res.unwrap_err().contains("not found"));
}

#[test]
fn disallowed_extensions_never_reach_disk() {
    let game = TestGameDir::new();
    for dest in [
        "evil.exe",
        "run.bat",
        "script.ps1",
        "hook.dll", // allowed ext actually, but wrong hash path below
    ] {
        let res = apply_game_files(
            game.root.to_string_lossy().to_string(),
            vec![payload(dest, b"x")],
        );
        if dest.ends_with(".dll") {
            // dll IS on the allowlist; it must still install under the dir.
            assert!(res.is_ok(), "{dest} should be allowed");
            continue;
        }
        assert!(res.is_err(), "{dest} must be rejected");
        assert!(res.unwrap_err().contains("Unsafe destination"));
    }
}

// ---------------------------------------------------------------------------
// detect_games — generic, data-driven game detection
// ---------------------------------------------------------------------------

#[test]
fn detects_known_executables_in_candidate_roots() {
    let base = std::env::temp_dir().join(format!("goh-detect-{}", DIR_SEQ.fetch_add(1, Ordering::SeqCst)));
    let steam = base.join("Steam/steamapps/common/GTA V");
    let prog = base.join("Program Files/Elden Ring");
    fs::create_dir_all(&steam).unwrap();
    fs::create_dir_all(&prog).unwrap();
    fs::write(steam.join("GTA5.exe"), b"exe").unwrap();
    fs::write(prog.join("eldenring.exe"), b"exe").unwrap();
    fs::write(prog.join("NOT_A_GAME.exe"), b"exe").unwrap();

    let found = detect_games(
        vec![steam.parent().unwrap().to_string_lossy().to_string(), prog.parent().unwrap().to_string_lossy().to_string()],
        vec![
            KnownExecutable { slug: "gta-v".into(), name: "Grand Theft Auto V".into(), exe: "GTA5.exe".into() },
            KnownExecutable { slug: "elden-ring".into(), name: "Elden Ring".into(), exe: "eldenring.exe".into() },
        ],
    );
    assert_eq!(found.len(), 2, "both known games must be detected: {found:?}");
    let by_slug = |s: &str| found.iter().find(|f| f.slug == s).unwrap();
    assert!(by_slug("gta-v").path.contains("GTA V"));
    assert_eq!(by_slug("gta-v").executable, "GTA5.exe");
    assert!(by_slug("elden-ring").path.contains("Elden Ring"));
    // A game we did NOT ask about is never reported.
    assert!(!found.iter().any(|f| f.executable == "NOT_A_GAME.exe"));

    fs::remove_dir_all(&base).ok();
}

#[test]
fn detection_matches_executables_case_insensitively_and_dedupes() {
    let base = std::env::temp_dir().join(format!("goh-detect-{}", DIR_SEQ.fetch_add(1, Ordering::SeqCst)));
    let dir = base.join("Game Root");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("GAME.EXE"), b"exe").unwrap();

    // Two catalog entries for the same game (different case) → one result.
    let found = detect_games(
        vec![dir.to_string_lossy().to_string()],
        vec![
            KnownExecutable { slug: "game".into(), name: "Game".into(), exe: "game.exe".into() },
            KnownExecutable { slug: "game".into(), name: "Game".into(), exe: "GAME.EXE".into() },
        ],
    );
    assert_eq!(found.len(), 1, "duplicate matches must be deduped: {found:?}");
    assert_eq!(found[0].slug, "game");

    fs::remove_dir_all(&base).ok();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

fn walk(root: &Path, pred: impl Fn(&Path) -> bool) -> Vec<PathBuf> {
    let mut hits = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() {
                    stack.push(p.clone());
                }
                if pred(&p) {
                    hits.push(p);
                }
            }
        }
    }
    hits
}

// ---------------------------------------------------------------------------
// detect_hardware — the two things that only fail on a real Windows machine
// ---------------------------------------------------------------------------

/// The resolution query must produce "1920x1080", not the .NET struct dump
/// `Bounds.ToString()` gives. That string is 32 characters for a 1080p screen,
/// and HardwareProfileInput caps `resolution` at 30 — so saving the profile
/// failed validation and the hardware never reached the server.
#[test]
fn resolution_query_formats_width_by_height() {
    let src = include_str!("lib.rs");
    let start = src.find("info.resolution = powershell(").expect("resolution query");
    let query = &src[start..start + 400];
    assert!(
        query.contains("$($b.Width)x$($b.Height)"),
        "resolution must be built as WIDTHxHEIGHT, not Bounds.ToString()"
    );
    assert!(
        !query.contains("Bounds.ToString()"),
        "Bounds.ToString() renders the whole struct and overflows the 30-char schema limit"
    );
    // The longest plausible value stays inside the schema's limit.
    assert!("7680x4320".len() <= 30);
}

/// AdapterRAM is a uint32 of bytes, so it saturates just under 4 GB and reports
/// ~4095 MB for every modern card. The code once carried a comment promising a
/// fallback that was never written.
#[test]
fn vram_prefers_the_64_bit_registry_value() {
    let src = include_str!("lib.rs");
    assert!(
        src.contains("registry_vram_mb().or(adapter_mb)"),
        "the 64-bit qwMemorySize must win over the saturating AdapterRAM"
    );
    assert!(
        src.contains("qwMemorySize"),
        "qwMemorySize is the only source that can describe more than 4 GB"
    );
}

/// A nonsense reading must be dropped rather than reported as detected VRAM.
#[test]
fn vram_registry_reading_is_sanity_checked() {
    let src = include_str!("lib.rs");
    let start = src.find("fn registry_vram_mb()").expect("registry_vram_mb");
    let body = &src[start..start + 900];
    assert!(body.contains("bytes == 0"), "zero is not a VRAM size");
    assert!(body.contains("1024 * 1024 * 1024"), "an upper bound keeps a garbage value out");
}

/// Every WMI class that can legitimately have more than one instance must be
/// bounded. Win32_Processor returns a row per socket and Win32_VideoController
/// a row per adapter (integrated + discrete is the common laptop case), so an
/// unbounded query puts two names in a field the UI renders as one value.
#[test]
fn multi_instance_wmi_queries_are_bounded() {
    let src = include_str!("lib.rs");
    for class in ["Win32_Processor", "Win32_VideoController"] {
        for (idx, _) in src.match_indices(class) {
            let line_start = src[..idx].rfind('\n').map(|i| i + 1).unwrap_or(0);
            let line_end = src[idx..].find('\n').map(|i| idx + i).unwrap_or(src.len());
            let line = &src[line_start..line_end];
            // Only the query strings matter, not comments mentioning the class.
            if !line.contains("Get-CimInstance") {
                continue;
            }
            assert!(
                line.contains("Select-Object -First 1"),
                "{class} can return several rows; bound it:\n  {}",
                line.trim()
            );
        }
    }
}
