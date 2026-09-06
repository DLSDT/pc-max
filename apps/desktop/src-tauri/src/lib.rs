mod optiflow;
mod winopt;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// CREATE_NO_WINDOW — background system queries (hardware/WMI detection) must
/// never flash a console window in the packaged GUI app.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
use tauri::Manager;
use winopt::{ApplyResult, RealOs, RecoveryReport, ScanResult, SnapshotMeta, SnapshotStore};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Crash recovery: if the previous session was interrupted mid
            // Windows-optimization, roll it back before the UI mounts.
            let dir = snapshot_dir(app.handle());
            let store = SnapshotStore::new(dir.clone());
            let report = winopt::recover_interrupted(&RealOs, &dir, &store);
            if report.interrupted {
                eprintln!("[winopt] recovery: {}", report.message);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            detect_hardware,
            detect_games,
            apply_game_files,
            optiflow_scan,
            optiflow_install,
            optiflow_uninstall,
            extract_game_icon,
            save_binary_file,
            windows_scan,
            windows_apply,
            windows_restore,
            windows_snapshots,
            windows_recover
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Snapshot storage lives in the app data dir (never inside a game folder).
fn snapshot_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from(".").join("pcmax-data"))
        .join("winopt")
}

// ---------------------------------------------------------------------------
// Windows Optimizer commands (thin wrappers over the winopt engine)
// ---------------------------------------------------------------------------

#[tauri::command]
fn windows_scan(app: tauri::AppHandle) -> Result<ScanResult, String> {
    let dir = snapshot_dir(&app);
    let store = SnapshotStore::new(dir);
    let info = winopt::detect_system_info();
    Ok(winopt::scan(&RealOs, &info, &store))
}

#[tauri::command]
fn windows_apply(
    app: tauri::AppHandle,
    profile: String,
    tweak_ids: Vec<String>,
) -> Result<ApplyResult, String> {
    if tweak_ids.is_empty() {
        return Err("no optimizations selected".into());
    }
    if tweak_ids.len() > 20 {
        return Err("too many optimizations selected".into());
    }
    let dir = snapshot_dir(&app);
    let store = SnapshotStore::new(dir.clone());
    Ok(winopt::apply(&RealOs, &store, &dir, &profile, &tweak_ids))
}

#[tauri::command]
fn windows_restore(app: tauri::AppHandle, snapshot_id: String) -> Result<usize, String> {
    let dir = snapshot_dir(&app);
    let store = SnapshotStore::new(dir);
    winopt::restore_snapshot(&RealOs, &store, &snapshot_id)
}

#[tauri::command]
fn windows_snapshots(app: tauri::AppHandle) -> Result<Vec<SnapshotMeta>, String> {
    let dir = snapshot_dir(&app);
    let store = SnapshotStore::new(dir);
    Ok(store.list())
}

#[tauri::command]
fn windows_recover(app: tauri::AppHandle) -> Result<RecoveryReport, String> {
    let dir = snapshot_dir(&app);
    let store = SnapshotStore::new(dir.clone());
    Ok(winopt::recover_interrupted(&RealOs, &dir, &store))
}

/// A known executable the catalog maps to a supported game.
#[derive(Deserialize)]
struct KnownExecutable {
    slug: String,
    name: String,
    exe: String,
}

/// A game found on disk by the generic detection pass.
#[derive(Serialize, Debug, PartialEq)]
struct GameDetection {
    slug: String,
    name: String,
    path: String,
    executable: String,
}

/// Steam library folders discovered from `libraryfolders.vdf` (best-effort).
fn steam_library_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let candidates = [
        r"C:\Program Files (x86)\Steam",
        r"C:\Program Files\Steam",
        r"D:\Steam",
        r"D:\SteamLibrary",
        r"E:\Steam",
        r"E:\SteamLibrary",
    ];
    for base in candidates {
        let vdf = Path::new(base).join("steamapps/libraryfolders.vdf");
        if let Ok(text) = fs::read_to_string(&vdf) {
            // Lines like:  "1"   "D:\\Games"
            for line in text.lines() {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 5 && parts[1].chars().all(|c| c.is_ascii_digit()) {
                    let p = parts[3].replace("\\\\", "\\");
                    if !p.is_empty() {
                        out.push(PathBuf::from(p).join("steamapps/common"));
                    }
                }
            }
        }
    }
    out
}

/// Generic, data-driven game detection.
///
/// Scans a bounded set of candidate roots (Program Files, Steam library
/// folders, user paths) for any of the catalog-supplied executable names. The
/// scan is at most two levels deep — fast, never walks the whole disk.
/// Returns every (root, executable) match; the caller merges results into the
/// user's library.
#[tauri::command]
fn detect_games(roots: Vec<String>, known: Vec<KnownExecutable>) -> Vec<GameDetection> {
    let mut roots: Vec<PathBuf> = roots.into_iter().map(PathBuf::from).collect();
    roots.extend(steam_library_roots());
    roots.sort();
    roots.dedup();

    let mut found: Vec<GameDetection> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for root in roots {
        // Root itself, then immediate subdirectories (bounded depth 2).
        let mut dirs = vec![root.clone()];
        if let Ok(entries) = fs::read_dir(&root) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() {
                    dirs.push(p);
                }
            }
        }
        for dir in dirs {
            // Index this directory's file names once (case-insensitive) so a
            // catalog entry never misses because of casing (Windows is
            // case-insensitive, Linux is not — we match on both).
            let mut files: Vec<(String, String)> = Vec::new(); // (lowercase, real)
            if let Ok(entries) = fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let p = e.path();
                    if p.is_file() {
                        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                            files.push((name.to_lowercase(), name.to_string()));
                        }
                    }
                }
            }
            for k in &known {
                if Path::new(&k.exe).extension().is_none() {
                    continue; // detection is executable-name based
                }
                let wanted = k.exe.to_lowercase();
                if let Some((_, real)) = files.iter().find(|(low, _)| low == &wanted) {
                    let key = (dir.to_string_lossy().to_lowercase(), k.slug.clone());
                    if seen.insert(key) {
                        found.push(GameDetection {
                            slug: k.slug.clone(),
                            name: k.name.clone(),
                            path: dir.to_string_lossy().to_string(),
                            executable: real.clone(),
                        });
                    }
                }
            }
        }
    }
    found
}

/// The packaged app version — used by the About screen and future update flows.
#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Privacy-conscious hardware snapshot. Only the fields needed for optimization
/// compatibility are collected — never device serials, IDs or personal data.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct HardwareInfo {
    cpu: Option<String>,
    gpu_model: Option<String>,
    gpu_vendor: Option<String>,
    vram_mb: Option<u64>,
    ram_gb: Option<u64>,
    windows_version: Option<String>,
    arch: Option<String>,
    resolution: Option<String>,
    driver_version: Option<String>,
}

fn powershell(script: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let out = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(text)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = script;
        None
    }
}

/// GPU vendor inference from the adapter name (same rules as the server).
fn infer_vendor(model: &str) -> &'static str {
    let m = model.to_lowercase();
    if m.contains("nvidia") || m.contains("geforce") || m.contains("rtx") || m.contains("gtx") {
        "nvidia"
    } else if m.contains("radeon") || m.contains("amd") || m.contains("rx ") {
        "amd"
    } else if m.contains("intel") || m.contains("arc") || m.contains("uhd") || m.contains("iris") {
        "intel"
    } else {
        "unknown"
    }
}

// ---------------------------------------------------------------------------
// One-Click Optimization — file apply (Phase 14)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameFilePayload {
    destination: String,
    content_base64: String,
    sha256: String,
}

/// Extensions optimization packages may write. Mirrors the server allowlist —
/// executables and scripts are NEVER allowed.
pub(crate) const ALLOWED_EXT: &[&str] = &[
    "cfg", "ini", "txt", "json", "xml", "toml", "preset", "pak", "bin", "dat", "dll",
    "fx", "nvpreset", "sig", "profile", "settings", "upd", "blend", "lut", "csv", "yml",
    "yaml", "log",
    // A DLL under another extension, loaded in-process by an ASI loader the
    // game already has. OptiScaler ships two. Same risk class as the dll entry
    // above, which has always been here; nothing in this app executes a
    // package file. (Keep quotation marks out of these comments: the
    // server/client parity test parses this list by scanning for quoted words.)
    "asi",
    // Plain-text licence notices shipped beside the binaries they cover, as
    // NVIDIA's Streamline set does. Refusing them meant a folder could not be
    // uploaded whole. (Keep quotation marks out of these comments: the
    // server/client parity test parses this list by scanning for quoted words.)
    "license",
];

/// Resolve `destination` relative to `game_dir`, rejecting any traversal or
/// absolute path. Returns None when unsafe.
pub(crate) fn safe_destination(game_dir: &Path, destination: &str) -> Option<PathBuf> {
    if destination.starts_with('/') || destination.contains("..") || destination.contains('\\') {
        return None;
    }
    // A colon anywhere is rejected, which covers two Windows-only tricks that
    // both slip past the checks above on a Unix build:
    //   - a drive-letter prefix ("C:/..."), which is_absolute() does not catch
    //     because on Unix "C:" is an ordinary component;
    //   - an NTFS alternate data stream ("foo.exe:payload.dll"), where the
    //     extension allowlist sees the harmless ".dll" after the colon while
    //     Windows creates a file literally named foo.exe.
    // Nothing legitimate in a relative destination contains one.
    if destination.contains(':') {
        return None;
    }
    let path = Path::new(destination);
    if path.is_absolute() {
        return None;
    }
    for comp in path.components() {
        match comp {
            Component::Normal(c) => {
                // Reject hidden/dotfile names in any segment — packages should
                // never touch dotfiles or OS-level hidden entries.
                if c.to_string_lossy().starts_with('.') {
                    return None;
                }
            }
            _ => return None,
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())?;
    if !ALLOWED_EXT.contains(&ext.as_str()) {
        return None;
    }
    Some(game_dir.join(path))
}

/// Apply verified optimization files atomically: back up any existing target,
/// write temp + rename, and roll everything back if any step fails.
#[tauri::command]
fn apply_game_files(game_dir: String, files: Vec<GameFilePayload>) -> Result<serde_json::Value, String> {
    let base = PathBuf::from(&game_dir);
    if !base.is_dir() {
        return Err(format!("Game directory not found: {game_dir}"));
    }

    // A manifest must address each file exactly once — otherwise the last
    // payload silently wins and the backup bookkeeping is ambiguous.
    {
        let mut seen = std::collections::HashSet::new();
        for f in &files {
            if !seen.insert(f.destination.clone()) {
                return Err(format!("Duplicate destination: {}", f.destination));
            }
        }
    }

    // Phase 1 — validate destinations and verify checksums PURELY (no filesystem
    // mutation yet). A corrupt or hostile package must not even create a backup
    // directory or touch a single byte.
    let mut staged: Vec<(PathBuf, Vec<u8>)> = Vec::new();
    for f in &files {
        let Some(target) = safe_destination(&base, &f.destination) else {
            return Err(format!("Unsafe destination: {}", f.destination));
        };
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&f.content_base64)
            .map_err(|_| format!("Invalid base64 for {}", f.destination))?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(&f.sha256) {
            return Err(format!(
                "Checksum mismatch for {} — expected {}, got {}",
                f.destination, f.sha256, actual
            ));
        }
        staged.push((target, bytes));
    }

    // Phase 2 — snapshot the originals. The stamp is second+nanosecond so two
    // installs within the same second never share a backup snapshot.
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| format!("{}-{}", d.as_secs(), d.subsec_nanos()))
        .unwrap_or_else(|_| "0-0".to_string());
    let backup_root = base.join(".goh-backup").join(stamp);
    let mut originals: Vec<(PathBuf, PathBuf)> = Vec::new(); // (target, backup)
    for (f, (target, _)) in files.iter().zip(staged.iter()) {
        if target.exists() {
            let backup = backup_root.join(&f.destination);
            if let Some(parent) = backup.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::copy(target, &backup);
            originals.push((target.clone(), backup));
        }
    }

    // Apply atomically (temp + rename per file); roll back on failure.
    let mut applied: Vec<PathBuf> = Vec::new();
    for (i, (target, bytes)) in staged.iter().enumerate() {
        if let Some(parent) = target.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                rollback(&originals, &applied, &backup_root);
                return Err(format!("Cannot create {}: {e}", parent.display()));
            }
        }
        let tmp = target.with_extension(format!("{}.goh-tmp-{i}", tmp_ext(target)));
        if let Err(e) = fs::write(&tmp, bytes) {
            rollback(&originals, &applied, &backup_root);
            return Err(format!("Cannot write {}: {e}", target.display()));
        }
        if let Err(e) = fs::rename(&tmp, target) {
            let _ = fs::remove_file(&tmp);
            rollback(&originals, &applied, &backup_root);
            return Err(format!("Cannot replace {}: {e}", target.display()));
        }
        applied.push(target.clone());
    }

    Ok(serde_json::json!({
        "applied": staged.len(),
        "backupDir": backup_root.to_string_lossy().to_string(),
    }))
}

fn tmp_ext(target: &Path) -> String {
    target
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_string()
}

/// Undo a partially-applied batch: restore originals from the backup root and
/// remove any files we already wrote.
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

/// Write raw bytes to a user-chosen path — used by the "download game icon"
/// action, where the file dialog picks the destination and the webview hands
/// over the already-fetched image. There is no fs plugin in this app, so this
/// is the only write path outside the game-file installer.
///
/// The destination is expected to come from the OS save dialog. That is a
/// convention the caller follows, not something this function can verify, so it
/// additionally refuses any extension outside the image set below — see the
/// note in the body.
#[tauri::command]
fn save_binary_file(path: String, content_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|_| "Invalid base64 content".to_string())?;
    let target = PathBuf::from(&path);

    // The path is meant to come from the OS save dialog, but "meant to" is a
    // convention the webview is trusted to follow, not something this function
    // could previously check — it took any absolute path and wrote any bytes.
    // A single injection anywhere in the UI would have turned that into
    // persistence (drop a .bat into the Startup folder). The dialog only ever
    // returns an image destination, so refusing anything Windows would execute
    // costs the real caller nothing and removes the primitive.
    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    const SAVEABLE_EXT: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg"];
    if !SAVEABLE_EXT.contains(&ext.as_str()) {
        return Err(format!("Refusing to save a .{ext} file here"));
    }
    if !target.is_absolute() {
        return Err("The save location must be an absolute path".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    fs::write(&target, bytes).map_err(|e| format!("Cannot write {path}: {e}"))?;
    Ok(())
}

/// Extract the icon embedded in a Windows .exe and return it as a
/// `data:image/png;base64,...` URL, for the "add a game by executable"
/// flow (LibraryPage). Pure Rust PE resource parsing (icoextract_rs) — no
/// Windows shell APIs — decoded via `ico`, re-encoded as PNG.
#[tauri::command]
fn extract_game_icon(exe_path: String) -> Result<String, String> {
    use icoextract_rs::IconExtractor;
    use std::io::Cursor;

    let extractor = IconExtractor::from_path(&exe_path).map_err(|e| e.to_string())?;
    let icon = extractor.icon_by_index(0).map_err(|e| e.to_string())?;
    let ico_bytes = icon.to_ico_bytes().map_err(|e| e.to_string())?;

    let icon_dir = ico::IconDir::read(Cursor::new(ico_bytes)).map_err(|e| e.to_string())?;
    let entry = icon_dir
        .entries()
        .iter()
        .max_by_key(|e| u32::from(e.width()) * u32::from(e.height()))
        .ok_or_else(|| "The executable has no embedded icon".to_string())?;
    let image = entry.decode().map_err(|e| e.to_string())?;

    let mut png_bytes = Vec::new();
    image.write_png(&mut png_bytes).map_err(|e| e.to_string())?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

/// Real VRAM in MB from the display driver's registry entry.
///
/// Win32_VideoController.AdapterRAM is a 32-bit byte count that saturates just
/// below 4 GB, so it cannot describe an 8 GB card, let alone a 24 GB one.
/// `HardwareInformation.qwMemorySize` under the display class key is 64-bit and
/// carries the actual size. Returns None off Windows, or when no adapter
/// publishes it (some virtual and integrated adapters do not).
#[cfg(target_os = "windows")]
fn registry_vram_mb() -> Option<u64> {
    let out = powershell(
        "$k = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}'; \
         Get-ChildItem $k -ErrorAction SilentlyContinue | \
         ForEach-Object { (Get-ItemProperty $_.PSPath -Name 'HardwareInformation.qwMemorySize' -ErrorAction SilentlyContinue).'HardwareInformation.qwMemorySize' } | \
         Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1",
    )?;
    let bytes = out.trim().parse::<u64>().ok()?;
    // Guard against a bogus reading rather than reporting nonsense as detected.
    if bytes == 0 || bytes > 256u64 * 1024 * 1024 * 1024 {
        return None;
    }
    Some(bytes / 1024 / 1024)
}

#[cfg(not(target_os = "windows"))]
fn registry_vram_mb() -> Option<u64> {
    None
}

/// Detect CPU / GPU / VRAM / RAM / Windows / resolution on Windows.
/// On other platforms returns a mostly-empty snapshot (browser preview, CI).
#[tauri::command]
fn detect_hardware() -> HardwareInfo {
    let mut info = HardwareInfo::default();

    #[cfg(target_os = "windows")]
    {
        // -First 1 for the same reason the video-controller query has it: a
        // dual-socket machine returns one line per processor, and the joined
        // result would render as two CPU names in a single field.
        info.cpu = powershell("(Get-CimInstance Win32_Processor | Select-Object -First 1).Name");
        // One WMI round trip instead of two — Get-CimInstance is slow enough
        // that calling it twice for two properties of the same object is worth
        // avoiding on a detection users wait for.
        info.windows_version = powershell(
            "$os = Get-CimInstance Win32_OperatingSystem; \"$($os.Caption) $($os.Version)\"",
        );
        info.arch = std::env::consts::ARCH
            .to_string()
            .replace("x86_64", "x64")
            .into();
        info.ram_gb = powershell(
            "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)",
        )
        .and_then(|v| v.parse::<u64>().ok());

        // Primary display adapter (first video controller).
        if let Some(gpu_line) = powershell(
            "Get-CimInstance Win32_VideoController | Select-Object -First 1 Name,AdapterRAM,DriverVersion | Format-List",
        ) {
            let mut name = None;
            let mut vram_bytes: Option<u64> = None;
            let mut driver = None;
            for line in gpu_line.lines() {
                let Some((key, value)) = line.split_once(':') else {
                    continue;
                };
                let value = value.trim();
                match key.trim() {
                    "Name" => name = Some(value.to_string()),
                    "AdapterRAM" => vram_bytes = value.parse::<u64>().ok(),
                    "DriverVersion" => driver = Some(value.to_string()),
                    _ => {}
                }
            }
            info.gpu_model = name.clone();
            info.driver_version = driver;
            // AdapterRAM is a uint32 of bytes, so it saturates a little under
            // 4 GB and every modern card reports ~4095 MB. The comment here used
            // to promise a fallback that was never written. The driver's own
            // qwMemorySize is a 64-bit value and reports the real size, so
            // prefer it and keep AdapterRAM only as a floor.
            let adapter_mb = vram_bytes.map(|b| b / 1024 / 1024);
            info.vram_mb = registry_vram_mb().or(adapter_mb);
            if let Some(model) = &info.gpu_model {
                info.gpu_vendor = Some(infer_vendor(model).to_string());
            }
        }

        // Current desktop resolution. Bounds.ToString() renders the whole
        // struct — "{X=0,Y=0,Width=1920,Height=1080}" — which is not a
        // resolution and, at 32 characters, is also longer than the 30 the API
        // schema accepts, so saving the profile failed validation and the
        // hardware never reached the server.
        info.resolution = powershell(
            "Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \"$($b.Width)x$($b.Height)\"",
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        info.arch = std::env::consts::ARCH
            .to_string()
            .replace("x86_64", "x64")
            .into();
    }

    info
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod optiflow_tests;

// ---------------------------------------------------------------------------
// OptiFlow — Streamline component swap + launcher unlocker
// ---------------------------------------------------------------------------

/// Inspect a selected game executable: report the install root, the launcher
/// folder, and which of the requested Streamline components the game ships.
/// Read-only — nothing is written, so the UI can show the user exactly what an
/// install would touch before they agree to it.
#[tauri::command]
fn optiflow_scan(exe_path: String, components: Vec<String>) -> Result<optiflow::ScanReport, String> {
    optiflow::scan(Path::new(&exe_path), &components)
}

/// Install an OptiFlow payload against a selected executable. The manifest
/// comes from the entitlement-gated server endpoint; every destination is
/// resolved and bounds-checked here.
/// One payload, addressed by content hash, for the files that share it.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptiFlowBlob {
    pub sha256: String,
    pub content_base64: String,
}

#[tauri::command]
fn optiflow_install(
    exe_path: String,
    mut files: Vec<optiflow::OptiFlowFile>,
    blobs: Option<Vec<OptiFlowBlob>>,
) -> Result<optiflow::InstallReport, String> {
    // The client sends each distinct payload once and lets the file list refer
    // to it by hash. OptiScaler's manifest is 31 files but only 23 distinct
    // payloads: one 24 MB binary answers to eight different DLL names, and
    // repeating its base64 per entry put ~200 MB of duplicate string through
    // the IPC channel for a single install.
    if let Some(blobs) = blobs {
        let table: std::collections::HashMap<String, String> = blobs
            .into_iter()
            .map(|b| (b.sha256.to_ascii_lowercase(), b.content_base64))
            .collect();
        for f in &mut files {
            if f.content_base64.is_empty() {
                f.content_base64 = table
                    .get(&f.sha256.to_ascii_lowercase())
                    .cloned()
                    // Not reachable from our own client, but a file whose bytes
                    // never arrived must stop the install rather than be
                    // written as nothing.
                    .ok_or_else(|| format!("missing_blob|{}", f.filename))?;
            }
        }
    }
    optiflow::install(Path::new(&exe_path), &files)
}

/// Undo a previous OptiScaler/OptiFlow install from the record of what it
/// wrote. Nothing is matched by filename — only the recorded list is touched.
#[tauri::command]
fn optiflow_uninstall(
    exe_path: String,
    backup_dir: String,
    files: Vec<optiflow::InstalledFile>,
) -> Result<optiflow::UninstallReport, String> {
    optiflow::uninstall(Path::new(&exe_path), Path::new(&backup_dir), &files)
}
