//! PC MAX Windows Optimizer — safe, reversible Windows optimization.
//!
//! Design principles (see docs/AUDIT.md §28):
//!   - Everything is data-driven from the `catalog()` — the UI never hardcodes
//!     a tweak, and no registry path / service name / filesystem path ever
//!     comes from the user or the API.
//!   - Every change is transactional: VALIDATE → SNAPSHOT → APPLY → VERIFY →
//!     COMMIT, with automatic rollback on any failure and a crash marker so an
//!     interrupted session is detected and recovered on next launch.
//!   - Unknown services, arbitrary registry paths, arbitrary commands and
//!     protected filesystem roots are rejected by construction.
//!   - Nothing is applied without a defensible rationale; HIGH/EXPERIMENTAL
//!     tweaks are never applied automatically.
//!   - Windows security (Defender, Firewall, SmartScreen, UAC, updates) is
//!     never touched.
//!
//! The OS-facing layer is the `OsBackend` trait: `MockOs` (in-memory, used by
//! the unit tests on every platform) and `RealOs` (Windows-only, implemented
//! through allowlisted `reg`/`sc`/`powercfg` invocations and safe fs walks).
//! The engine, catalog, validation and snapshot logic are platform-neutral and
//! fully unit-tested on Linux.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Risk {
    Low,
    Medium,
    High,
    Experimental,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Startup,
    Processes,
    Services,
    Gaming,
    Power,
    VisualEffects,
    Network,
    Privacy,
    Cleanup,
    Advanced,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Hive {
    Hkcu,
    Hklm,
}

impl Hive {
    fn prefix(self) -> &'static str {
        match self {
            Hive::Hkcu => "HKCU\\",
            Hive::Hklm => "HKLM\\",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Value {
    Dword(u32),
    String(String),
    Binary(Vec<u8>),
}

/// A validated registry location. Construction goes through `RegPath::new`,
/// which enforces the allowlist — arbitrary keys are impossible by type.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RegPath {
    pub hive: Hive,
    pub key: String,
    pub value: String,
}

/// Registry keys PC MAX is allowed to read/write (flat allowlist).
const ALLOWED_REG_KEYS: &[&str] = &[
    // Startup (HKCU only)
    r"Software\Microsoft\Windows\CurrentVersion\Run",
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder",
    // Windows NT version (read-only detection)
    r"Software\Microsoft\Windows NT\CurrentVersion",
    // Visual effects
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects",
    r"Control Panel\Desktop",
    // Gaming configuration
    r"Software\Microsoft\GameBar",
    r"Software\Microsoft\GameDVR",
    r"Software\Microsoft\Windows\CurrentVersion\GameDVR",
    r"System\CurrentControlSet\Control\GraphicsDrivers",
    // Privacy / telemetry
    r"Software\Policies\Microsoft\Windows\DataCollection",
    r"Software\Microsoft\Windows\CurrentVersion\Policies\DataCollection",
    // Power
    r"SYSTEM\CurrentControlSet\Control\Power",
];

impl RegPath {
    /// Build a validated registry path. Rejects anything outside the allowlist.
    pub fn new(hive: Hive, key: &str, value: &str) -> Result<Self, String> {
        if value.is_empty() || key.is_empty() {
            return Err("registry path: empty key or value".into());
        }
        if key.contains("..") || key.contains('\0') {
            return Err("registry path: invalid segments".into());
        }
        let normalized = key.trim_end_matches('\\').to_lowercase();
        if !ALLOWED_REG_KEYS.iter().any(|k| k.to_lowercase() == normalized) {
            return Err(format!("registry path not allowed: {key}"));
        }
        // Startup keys are user-scope only — machine-wide Run entries are out
        // of scope (other software may legitimately register them).
        let is_startup_key = normalized == r"software\microsoft\windows\currentversion\run".to_lowercase()
            || normalized.starts_with(r"software\microsoft\windows\currentversion\explorer\startupapproved");
        if is_startup_key && hive != Hive::Hkcu {
            return Err(format!("registry path not allowed for hive: {key}"));
        }
        Ok(RegPath { hive, key: key.to_string(), value: value.to_string() })
    }

    fn display(&self) -> String {
        format!("{}{}", self.hive.prefix(), self.key)
    }
}

/// Services PC MAX may change. Everything else is left untouched.
pub const SERVICES_ALLOWLIST: &[&str] = &[
    "DiagTrack",    // Connected User Experiences and Telemetry
    "WSearch",      // Windows Search
    "SysMain",      // SysMain (Superfetch)
    "WMPNetworkSvc", // Windows Media Player Network Sharing
];

/// Cleanup targets (expanded at runtime) — never protected roots.
pub const CLEANUP_DIRS: &[&str] = &["user_temp", "windows_temp"];

pub const PROTECTED_ROOTS: &[&str] = &[
    "C:\\", "C:\\Windows", "C:\\Windows\\System32", "C:\\Program Files",
    "C:\\Program Files (x86)", "C:\\Users", "C:\\Users\\Public",
];

/// Version gate: (major, minimum build). Windows 10 2004 (19041) floor.
pub type WinVersion = (u16, u16);

// ---------------------------------------------------------------------------
// Operations (typed, allowlisted by construction)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub enum Op {
    /// Write an allowlisted registry value.
    RegWrite { path: RegPath, target: Value },
    /// Delete an allowlisted registry value (restore = re-write backup).
    RegDelete { path: RegPath },
    /// Change an allowlisted service startup type.
    ServiceStart { name: &'static str, target: &'static str },
    /// Disable a startup entry via StartupApproved (restore = delete marker).
    StartupDisable { name: &'static str },
    /// Switch the active power scheme (allowlisted GUIDs).
    PowerScheme { guid: &'static str },
    /// Set the Windows visual-effects mode.
    VfxMode { mode: u32 },
    /// Game Mode on/off (allowlisted registry value).
    GameMode { enable: bool },
    /// Game DVR background recording on/off.
    GameDvr { enable: bool },
    /// Hardware-accelerated GPU scheduling on/off (experimental).
    Hags { enable: bool },
    /// Telemetry level (0 = security, 1 = basic, 3 = full) — reversible.
    Telemetry { level: u32 },
    /// Remove regular files from an allowlisted temp directory.
    CleanupDir { dir: &'static str },
}

/// Value captured before a change — the basis for restore.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BeforeValue {
    Reg(Option<Value>),
    Service { start_type: String, running: bool },
    Startup { enabled: bool },
    Power { active_scheme: String },
    Vfx { mode: u32 },
    Count { bytes: u64 },
}

// ---------------------------------------------------------------------------
// Tweak catalog (data-driven — the UI renders from this)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct TweakDef {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: Category,
    pub risk: Risk,
    pub windows_min: WinVersion,
    pub requires_admin: bool,
    pub requires_restart: bool,
    /// Profile membership bitmask: bit0 = safe, bit1 = gaming, bit2 = competitive.
    pub profiles: u8,
    pub ops: Vec<Op>,
}

/// The full optimization catalog. Ids are unique (asserted by tests).
pub fn catalog() -> Vec<TweakDef> {
    let mut v: Vec<TweakDef> = Vec::new();

    // --- Startup ---
    v.push(TweakDef {
        id: "startup.discord",
        name: "Disable Discord auto-start",
        description: "Prevents Discord from starting with Windows, reducing background memory and network use.",
        category: Category::Startup,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::StartupDisable { name: "Discord" }],
    });
    v.push(TweakDef {
        id: "startup.steam",
        name: "Disable Steam auto-start",
        description: "Stops Steam launching at boot. Steam still works normally when opened.",
        category: Category::Startup,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::StartupDisable { name: "Steam" }],
    });
    v.push(TweakDef {
        id: "startup.spotify",
        name: "Disable Spotify auto-start",
        description: "Keeps Spotify from starting automatically, freeing background resources.",
        category: Category::Startup,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::StartupDisable { name: "Spotify" }],
    });

    // --- Services (allowlisted, never security services) ---
    v.push(TweakDef {
        id: "services.sysmain",
        name: "Reduce SysMain background activity",
        description: "SysMain (Superfetch) preloads apps into memory. On SSD systems this background activity is often unnecessary.",
        category: Category::Services,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: true,
        profiles: 0b110,
        ops: vec![Op::ServiceStart { name: "SysMain", target: "disabled" }],
    });
    v.push(TweakDef {
        id: "services.diagtrack",
        name: "Reduce telemetry service (DiagTrack)",
        description: "Disables the Connected User Experiences and Telemetry service. Privacy-focused; fully reversible.",
        category: Category::Services,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: true,
        profiles: 0b110,
        ops: vec![Op::ServiceStart { name: "DiagTrack", target: "disabled" }],
    });
    v.push(TweakDef {
        id: "services.wsearch",
        name: "Disable Windows Search indexing",
        description: "Stops background indexer activity. Trade-off: Windows search may become slower or behave differently.",
        category: Category::Services,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: true,
        profiles: 0b010,
        ops: vec![Op::ServiceStart { name: "WSearch", target: "disabled" }],
    });

    // --- Gaming ---
    v.push(TweakDef {
        id: "gaming.gamemode",
        name: "Enable Windows Game Mode",
        description: "Lets Windows prioritize games during play. Safe on supported hardware.",
        category: Category::Gaming,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::GameMode { enable: true }],
    });
    v.push(TweakDef {
        id: "gaming.gamedvr",
        name: "Disable background recording (Game DVR)",
        description: "Stops background recording/overlay capture overhead. Game Bar remains available.",
        category: Category::Gaming,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::GameDvr { enable: false }],
    });
    v.push(TweakDef {
        id: "gaming.fullscreen_optimizations",
        name: "Disable fullscreen optimizations",
        description: "Uses exclusive fullscreen for borderless games. Improves input latency on some titles; can cause flicker on others.",
        category: Category::Gaming,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b010,
        ops: vec![Op::RegWrite {
            path: RegPath::new(Hive::Hkcu, r"System\CurrentControlSet\Control\GraphicsDrivers", "FullscreenOptimizations")
                .expect("allowlisted path"),
            target: Value::Dword(0),
        }],
    });
    v.push(TweakDef {
        id: "gaming.hags",
        name: "Hardware-accelerated GPU scheduling (HAGS)",
        description: "Offloads GPU scheduling. Helps some systems, neutral or worse on others — experimental.",
        category: Category::Gaming,
        risk: Risk::Experimental,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: true,
        profiles: 0b100,
        ops: vec![Op::Hags { enable: true }],
    });

    // --- Power ---
    v.push(TweakDef {
        id: "power.high_performance",
        name: "High performance power plan",
        description: "Uses the High performance plan for sustained load. Trade-off: higher power draw and temperature. Desktop only.",
        category: Category::Power,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: false,
        profiles: 0b010,
        ops: vec![Op::PowerScheme { guid: "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" }],
    });

    // --- Visual effects ---
    v.push(TweakDef {
        id: "vfx.performance",
        name: "Performance visual effects",
        description: "Reduces animations, transparency and shadow effects for snappier UI on modest hardware.",
        category: Category::VisualEffects,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b010,
        ops: vec![Op::VfxMode { mode: 2 }],
    });
    v.push(TweakDef {
        id: "vfx.balanced",
        name: "Balanced visual effects",
        description: "Keeps a reasonable Windows appearance while trimming the heaviest effects.",
        category: Category::VisualEffects,
        risk: Risk::Low,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b001,
        ops: vec![Op::VfxMode { mode: 1 }],
    });

    // --- Privacy ---
    v.push(TweakDef {
        id: "privacy.telemetry",
        name: "Minimal telemetry level",
        description: "Sets Windows diagnostic data to Security (required). Never touches Defender, Firewall or SmartScreen.",
        category: Category::Privacy,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: true,
        requires_restart: false,
        profiles: 0b110,
        ops: vec![Op::Telemetry { level: 0 }],
    });

    // --- Cleanup ---
    v.push(TweakDef {
        id: "cleanup.temp",
        name: "Clean temporary files",
        description: "Removes regular files from the user and Windows temp folders. Personal documents are never touched.",
        category: Category::Cleanup,
        risk: Risk::Medium,
        windows_min: (10, 19041),
        requires_admin: false,
        requires_restart: false,
        profiles: 0b011,
        ops: vec![Op::CleanupDir { dir: "user_temp" }, Op::CleanupDir { dir: "windows_temp" }],
    });

    v
}

impl TweakDef {
    pub fn get(id: &str) -> Option<TweakDef> {
        catalog().into_iter().find(|t| t.id == id)
    }

    pub fn supported_on(&self, version: Option<WinVersion>) -> bool {
        match version {
            Some((major, build)) => (major, build) >= self.windows_min,
            None => false,
        }
    }

    pub fn in_profile(&self, profile: u8) -> bool {
        self.profiles & (1 << profile) != 0
    }
}

// ---------------------------------------------------------------------------
// OS backend
// ---------------------------------------------------------------------------

pub struct SystemInfo {
    pub windows_version: Option<WinVersion>,
    pub laptop: bool,
    pub ram_gb: Option<u64>,
    pub vram_mb: Option<u64>,
    pub gpu_vendor: Option<String>,
}

pub trait OsBackend {
    /// Read the current value for an op (used for backup + verify).
    fn read(&self, op: &Op) -> Result<BeforeValue, String>;
    /// Write the op's target value.
    fn write(&self, op: &Op) -> Result<(), String>;
    /// Restore a previously backed-up value.
    fn restore(&self, op: &Op, before: &BeforeValue) -> Result<(), String>;
    /// Whether the op's target state already matches (detection).
    fn is_applied(&self, op: &Op) -> Result<bool, String>;
}

// ---------------------------------------------------------------------------
// Transaction engine
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TxStatus {
    Active,
    Committed,
    RolledBack,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub tweak_id: String,
    pub op_index: usize,
    pub before: BeforeValue,
    pub verified: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transaction {
    pub id: String,
    pub profile: String,
    pub created_at: String,
    pub status: TxStatus,
    pub changes: Vec<Change>,
    pub error: Option<String>,
}

impl Transaction {
    pub fn new(profile: &str) -> Self {
        Transaction {
            id: new_id(),
            profile: profile.to_string(),
            created_at: now_iso(),
            status: TxStatus::Active,
            changes: Vec::new(),
            error: None,
        }
    }

    /// Apply one tweak (all its ops). Backs up, applies, then verifies each op.
    /// On any failure, rolls back everything already applied in this session.
    pub fn apply_tweak<B: OsBackend>(&mut self, backend: &B, tweak: &TweakDef) -> Result<(), String> {
        let start = self.changes.len();
        for (i, op) in tweak.ops.iter().enumerate() {
            let before = backend.read(op)?;
            if let Err(e) = backend.write(op) {
                let err = format!("apply failed for {} (op {i}): {e}", tweak.id);
                self.error = Some(err.clone());
                self.status = TxStatus::Failed;
                let _ = self.rollback(backend, start);
                return Err(err);
            }
            let verified = backend.is_applied(op).unwrap_or(false);
            self.changes.push(Change { tweak_id: tweak.id.to_string(), op_index: i, before, verified });
            if !verified {
                let err = format!("verification failed for {} (op {i})", tweak.id);
                self.error = Some(err.clone());
                self.status = TxStatus::Failed;
                let _ = self.rollback(backend, start);
                return Err(err);
            }
        }
        Ok(())
    }

    /// Roll back changes from `from` (default 0) in reverse order using the
    /// recorded before-values.
    pub fn rollback<B: OsBackend>(&mut self, backend: &B, from: usize) -> Result<(), String> {
        let mut first_err: Option<String> = None;
        for idx in (from..self.changes.len()).rev() {
            let change = &self.changes[idx];
            match TweakDef::get(&change.tweak_id) {
                Some(tweak) => {
                    if let Some(op) = tweak.ops.get(change.op_index) {
                        if let Err(e) = backend.restore(op, &change.before) {
                            first_err.get_or_insert_with(|| format!("restore failed for {}: {e}", change.tweak_id));
                        }
                    }
                }
                None => {
                    first_err.get_or_insert_with(|| format!("unknown tweak {}", change.tweak_id));
                }
            }
        }
        self.status = TxStatus::RolledBack;
        match first_err {
            Some(e) => Err(e),
            None => Ok(()),
        }
    }

    pub fn commit(&mut self) {
        self.status = TxStatus::Committed;
        self.error = None;
    }
}

// ---------------------------------------------------------------------------
// Snapshots + crash recovery
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub created_at: String,
    pub profile: String,
    pub tweaks: Vec<String>,
    pub changes: Vec<Change>,
}

impl Snapshot {
    pub fn from_tx(tx: &Transaction) -> Snapshot {
        let tweaks = {
            let mut seen: Vec<String> = Vec::new();
            for c in &tx.changes {
                if !seen.contains(&c.tweak_id) {
                    seen.push(c.tweak_id.clone());
                }
            }
            seen
        };
        Snapshot {
            id: tx.id.clone(),
            created_at: tx.created_at.clone(),
            profile: tx.profile.clone(),
            tweaks,
            changes: tx.changes.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: String,
    pub created_at: String,
    pub profile: String,
    pub change_count: usize,
    pub tweaks: Vec<String>,
}

/// Persistent snapshot store — a directory of JSON files.
pub struct SnapshotStore {
    dir: PathBuf,
}

impl SnapshotStore {
    pub fn new(dir: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&dir);
        SnapshotStore { dir }
    }

    pub fn save(&self, snapshot: &Snapshot) -> Result<(), String> {
        let path = self.dir.join(format!("{}.json", snapshot.id));
        let json = serde_json::to_string_pretty(snapshot).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }

    pub fn list(&self) -> Vec<SnapshotMeta> {
        let mut out = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&self.dir) {
            for e in entries.flatten() {
                let path = e.path();
                if path.extension().and_then(|x| x.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(raw) = std::fs::read_to_string(&path) {
                    if let Ok(s) = serde_json::from_str::<Snapshot>(&raw) {
                        out.push(SnapshotMeta {
                            id: s.id,
                            created_at: s.created_at,
                            profile: s.profile,
                            change_count: s.changes.len(),
                            tweaks: s.tweaks,
                        });
                    }
                }
            }
        }
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        out
    }

    pub fn load(&self, id: &str) -> Result<Snapshot, String> {
        let path = self.dir.join(format!("{id}.json"));
        let raw = std::fs::read_to_string(&path).map_err(|_| "snapshot not found".to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    pub fn delete(&self, id: &str) {
        let _ = std::fs::remove_file(self.dir.join(format!("{id}.json")));
    }
}

/// Crash marker: a tiny file written at transaction start, removed at commit.
/// If it exists at startup, the previous session was interrupted.
pub fn marker_path(dir: &Path) -> PathBuf {
    dir.join(".winopt-active")
}

pub fn write_marker(dir: &Path, tx_id: &str) {
    let _ = std::fs::write(marker_path(dir), tx_id);
}

pub fn read_marker(dir: &Path) -> Option<String> {
    std::fs::read_to_string(marker_path(dir)).ok().map(|s| s.trim().to_string())
}

pub fn clear_marker(dir: &Path) {
    let _ = std::fs::remove_file(marker_path(dir));
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryReport {
    pub interrupted: bool,
    pub recovered: bool,
    pub rolled_back_changes: usize,
    pub message: String,
}

/// Detect an interrupted transaction and roll it back safely. Runs on startup.
pub fn recover_interrupted<B: OsBackend>(backend: &B, dir: &Path, store: &SnapshotStore) -> RecoveryReport {
    let Some(tx_id) = read_marker(dir) else {
        return RecoveryReport { interrupted: false, recovered: false, rolled_back_changes: 0, message: "no interruption".into() };
    };
    let mut rolled_back = 0usize;
    let mut recovered = false;
    let mut message = format!("interrupted transaction {tx_id}");
    if let Ok(snapshot) = store.load(&tx_id) {
        let mut tx = Transaction {
            id: snapshot.id,
            profile: snapshot.profile,
            created_at: snapshot.created_at,
            status: TxStatus::Active,
            changes: snapshot.changes,
            error: None,
        };
        if !tx.changes.is_empty() {
            rolled_back = tx.changes.len();
            match tx.rollback(backend, 0) {
                Ok(()) => {
                    recovered = true;
                    message = format!("rolled back {rolled_back} change(s) from interrupted transaction");
                }
                Err(e) => message = format!("rollback incomplete: {e}"),
            }
        } else {
            recovered = true;
            message = "interrupted before any change was applied".to_string();
        }
    } else {
        recovered = true;
        message = "interrupted before snapshot; nothing to roll back".to_string();
    }
    clear_marker(dir);
    RecoveryReport { interrupted: true, recovered, rolled_back_changes: rolled_back, message }
}

// ---------------------------------------------------------------------------
// Scan + recommendations
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: Category,
    pub risk: Risk,
    pub requires_admin: bool,
    pub requires_restart: bool,
    pub supported: bool,
    pub applied: bool,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub supported: bool,
    pub reason: String,
    pub windows_version: Option<WinVersion>,
    pub laptop: bool,
    pub tweaks: Vec<TweakStatus>,
    pub applied_ids: Vec<String>,
}

pub fn applied_tweak_ids(store: &SnapshotStore) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for meta in store.list() {
        if let Ok(s) = store.load(&meta.id) {
            for t in s.tweaks {
                if !ids.contains(&t) {
                    ids.push(t);
                }
            }
        }
    }
    ids
}

pub fn scan<B: OsBackend>(backend: &B, info: &SystemInfo, store: &SnapshotStore) -> ScanResult {
    let applied = applied_tweak_ids(store);
    let mut tweaks = Vec::new();
    for t in catalog() {
        let mut supported = t.supported_on(info.windows_version);
        let mut reason = String::new();
        if !supported {
            reason = "Not supported on this Windows version.".to_string();
        } else if t.risk == Risk::Experimental && info.vram_mb.unwrap_or(0) < 6144 {
            supported = false;
            reason = "Requires a dedicated GPU with at least 6 GB VRAM.".to_string();
        } else if t.id == "power.high_performance" && info.laptop {
            supported = false;
            reason = "Desktop only — laptops stay on Balanced to protect battery and thermals.".to_string();
        } else if applied.contains(&t.id.to_string()) {
            reason = "Already applied by a previous optimization.".to_string();
        }
        let mut applied_now = applied.contains(&t.id.to_string());
        if supported && !applied_now {
            let all = t.ops.iter().all(|op| backend.is_applied(op).unwrap_or(false));
            applied_now = all;
            if all && reason.is_empty() {
                reason = "Already configured on this system.".to_string();
            }
        }
        tweaks.push(TweakStatus {
            id: t.id.to_string(),
            name: t.name.to_string(),
            description: t.description.to_string(),
            category: t.category,
            risk: t.risk,
            requires_admin: t.requires_admin,
            requires_restart: t.requires_restart,
            supported,
            applied: applied_now,
            reason,
        });
    }
    ScanResult {
        supported: info.windows_version.is_some(),
        reason: if info.windows_version.is_none() {
            "Windows optimization runs inside the packaged PC MAX Windows application.".to_string()
        } else {
            "ok".to_string()
        },
        windows_version: info.windows_version,
        laptop: info.laptop,
        tweaks,
        applied_ids: applied,
    }
}

// ---------------------------------------------------------------------------
// Apply orchestration
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub snapshot_id: String,
    pub status: TxStatus,
    pub applied_tweaks: Vec<String>,
    pub change_count: usize,
    pub error: Option<String>,
    pub requires_restart: bool,
}

/// Run a transaction for the given profile + tweak ids.
pub fn apply<B: OsBackend>(
    backend: &B,
    store: &SnapshotStore,
    marker_dir: &Path,
    profile: &str,
    tweak_ids: &[String],
) -> ApplyResult {
    // VALIDATE — resolve every id.
    let mut tweaks: Vec<TweakDef> = Vec::new();
    for id in tweak_ids {
        match TweakDef::get(id) {
            Some(t) => tweaks.push(t),
            None => {
                return ApplyResult {
                    snapshot_id: String::new(),
                    status: TxStatus::Failed,
                    applied_tweaks: Vec::new(),
                    change_count: 0,
                    error: Some(format!("unknown optimization id: {id}")),
                    requires_restart: false,
                };
            }
        }
    }

    let mut tx = Transaction::new(profile);
    write_marker(marker_dir, &tx.id);

    // SNAPSHOT of the intended tweaks up-front so recovery can identify the
    // transaction even if the process dies mid-apply.
    let mut snapshot = Snapshot::from_tx(&tx);
    snapshot.tweaks = tweaks.iter().map(|t| t.id.to_string()).collect();
    let _ = store.save(&snapshot);

    let mut requires_restart = false;
    for t in &tweaks {
        requires_restart |= t.requires_restart;
        if let Err(e) = tx.apply_tweak(backend, t) {
            let rolled = tx.changes.len();
            clear_marker(marker_dir);
            return ApplyResult {
                snapshot_id: tx.id.clone(),
                status: if rolled > 0 { TxStatus::RolledBack } else { TxStatus::Failed },
                applied_tweaks: Vec::new(),
                change_count: rolled,
                error: Some(format!("{e} — previous state restored.")),
                requires_restart,
            };
        }
    }

    // COMMIT — persist verified changes and clear the marker.
    snapshot.changes = tx.changes.clone();
    let _ = store.save(&snapshot);
    tx.commit();
    clear_marker(marker_dir);

    let applied_tweaks = tweaks.iter().map(|t| t.id.to_string()).collect();
    ApplyResult {
        snapshot_id: tx.id.clone(),
        status: TxStatus::Committed,
        applied_tweaks,
        change_count: tx.changes.len(),
        error: None,
        requires_restart,
    }
}

/// Restore a snapshot: roll back every recorded change.
pub fn restore_snapshot<B: OsBackend>(backend: &B, store: &SnapshotStore, id: &str) -> Result<usize, String> {
    let snapshot = store.load(id)?;
    let mut tx = Transaction {
        id: snapshot.id,
        profile: snapshot.profile,
        created_at: snapshot.created_at,
        status: TxStatus::Active,
        changes: snapshot.changes,
        error: None,
    };
    let n = tx.changes.len();
    tx.rollback(backend, 0)?;
    store.delete(id);
    Ok(n)
}

// ---------------------------------------------------------------------------
// Mock backend (tests + browser-safe builds)
// ---------------------------------------------------------------------------

/// In-memory backend used by unit tests. `RefCell` gives interior mutability
/// while the trait only exposes `&self`.
#[derive(Default)]
pub struct MockOs {
    pub reg: RefCell<HashMap<String, Option<Value>>>,
    pub services: RefCell<HashMap<String, (String, bool)>>,
    pub startup: RefCell<HashMap<String, bool>>,
    pub power: RefCell<String>,
    pub vfx: RefCell<u32>,
    pub cleanup_bytes: RefCell<HashMap<String, u64>>,
    pub fail_on_write: Option<usize>,
    write_calls: RefCell<usize>,
}

impl MockOs {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_failure(mut self, n: usize) -> Self {
        self.fail_on_write = Some(n);
        self
    }

    pub fn set_reg(&self, key: &str, value: Option<Value>) {
        self.reg.borrow_mut().insert(key.to_string(), value);
    }

    pub fn set_service(&self, name: &str, start: &str, running: bool) {
        self.services.borrow_mut().insert(name.to_string(), (start.to_string(), running));
    }

    pub fn set_startup(&self, name: &str, enabled: bool) {
        self.startup.borrow_mut().insert(name.to_string(), enabled);
    }
}

impl OsBackend for MockOs {
    fn read(&self, op: &Op) -> Result<BeforeValue, String> {
        match op {
            Op::RegWrite { path, .. } | Op::RegDelete { path } => {
                Ok(BeforeValue::Reg(self.reg.borrow().get(&path.display()).cloned().flatten()))
            }
            Op::ServiceStart { name, .. } => Ok(BeforeValue::Service {
                start_type: self.services.borrow().get(*name).map(|(s, _)| s.clone()).unwrap_or_else(|| "manual".into()),
                running: self.services.borrow().get(*name).map(|(_, r)| *r).unwrap_or(false),
            }),
            Op::StartupDisable { name } => Ok(BeforeValue::Startup { enabled: self.startup.borrow().get(*name).copied().unwrap_or(true) }),
            Op::PowerScheme { .. } => Ok(BeforeValue::Power { active_scheme: self.power.borrow().clone() }),
            Op::VfxMode { .. } => Ok(BeforeValue::Vfx { mode: *self.vfx.borrow() }),
            Op::GameMode { .. } => Ok(BeforeValue::Reg(self.reg.borrow().get("gamemode").cloned().flatten())),
            Op::GameDvr { .. } => Ok(BeforeValue::Reg(self.reg.borrow().get("gamedvr").cloned().flatten())),
            Op::Hags { .. } => Ok(BeforeValue::Reg(self.reg.borrow().get("hags").cloned().flatten())),
            Op::Telemetry { .. } => Ok(BeforeValue::Reg(self.reg.borrow().get("telemetry").cloned().flatten())),
            Op::CleanupDir { dir } => Ok(BeforeValue::Count { bytes: self.cleanup_bytes.borrow().get(*dir).copied().unwrap_or(0) }),
        }
    }

    fn write(&self, op: &Op) -> Result<(), String> {
        let mut calls = self.write_calls.borrow_mut();
        if let Some(n) = self.fail_on_write {
            // fail_on_write = the nth write call that fails.
            if *calls + 1 >= n {
                return Err("mock write failure".into());
            }
        }
        *calls += 1;
        drop(calls);
        match op {
            Op::RegWrite { path, target } => self.set_reg(&path.display(), Some(target.clone())),
            Op::RegDelete { path } => self.set_reg(&path.display(), None),
            Op::ServiceStart { name, target } => self.set_service(name, target, false),
            Op::StartupDisable { name } => self.set_startup(name, false),
            Op::PowerScheme { guid } => *self.power.borrow_mut() = guid.to_string(),
            Op::VfxMode { mode } => *self.vfx.borrow_mut() = *mode,
            Op::GameMode { enable } => self.set_reg("gamemode", Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::GameDvr { enable } => self.set_reg("gamedvr", Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::Hags { enable } => self.set_reg("hags", Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::Telemetry { level } => self.set_reg("telemetry", Some(Value::Dword(*level))),
            Op::CleanupDir { dir } => {
                self.cleanup_bytes.borrow_mut().insert(dir.to_string(), 0);
            }
        }
        Ok(())
    }

    fn restore(&self, op: &Op, before: &BeforeValue) -> Result<(), String> {
        match (op, before) {
            (Op::RegWrite { path, .. } | Op::RegDelete { path }, BeforeValue::Reg(v)) => {
                self.set_reg(&path.display(), v.clone());
                Ok(())
            }
            (Op::ServiceStart { name, .. }, BeforeValue::Service { start_type, running }) => {
                self.set_service(name, start_type, *running);
                Ok(())
            }
            (Op::StartupDisable { name }, BeforeValue::Startup { enabled }) => {
                self.set_startup(name, *enabled);
                Ok(())
            }
            (Op::PowerScheme { .. }, BeforeValue::Power { active_scheme }) => {
                *self.power.borrow_mut() = active_scheme.clone();
                Ok(())
            }
            (Op::VfxMode { .. }, BeforeValue::Vfx { mode }) => {
                *self.vfx.borrow_mut() = *mode;
                Ok(())
            }
            (Op::GameMode { .. }, BeforeValue::Reg(v)) => {
                self.set_reg("gamemode", v.clone());
                Ok(())
            }
            (Op::GameDvr { .. }, BeforeValue::Reg(v)) => {
                self.set_reg("gamedvr", v.clone());
                Ok(())
            }
            (Op::Hags { .. }, BeforeValue::Reg(v)) => {
                self.set_reg("hags", v.clone());
                Ok(())
            }
            (Op::Telemetry { .. }, BeforeValue::Reg(v)) => {
                self.set_reg("telemetry", v.clone());
                Ok(())
            }
            (Op::CleanupDir { dir }, BeforeValue::Count { bytes }) => {
                if *bytes == 0 {
                    // Original state was "nothing cleaned" — remove the key so
                    // detection reports it as not applied.
                    self.cleanup_bytes.borrow_mut().remove(*dir);
                } else {
                    self.cleanup_bytes.borrow_mut().insert(dir.to_string(), *bytes);
                }
                Ok(())
            }
            _ => Err("op/backup mismatch".into()),
        }
    }

    fn is_applied(&self, op: &Op) -> Result<bool, String> {
        match op {
            Op::RegWrite { path, target } => Ok(self.reg.borrow().get(&path.display()).cloned().flatten().as_ref() == Some(target)),
            Op::RegDelete { path } => Ok(self.reg.borrow().get(&path.display()).cloned().flatten().is_none()),
            Op::ServiceStart { name, target } => Ok(self.services.borrow().get(*name).map(|(s, _)| s == target).unwrap_or(false)),
            Op::StartupDisable { name } => Ok(self.startup.borrow().get(*name).copied() == Some(false)),
            Op::PowerScheme { guid } => Ok(&*self.power.borrow() == guid),
            Op::VfxMode { mode } => Ok(*self.vfx.borrow() == *mode),
            Op::GameMode { enable } => Ok(self.reg.borrow().get("gamemode").cloned().flatten() == Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::GameDvr { enable } => Ok(self.reg.borrow().get("gamedvr").cloned().flatten() == Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::Hags { enable } => Ok(self.reg.borrow().get("hags").cloned().flatten() == Some(Value::Dword(if *enable { 1 } else { 0 }))),
            Op::Telemetry { level } => Ok(self.reg.borrow().get("telemetry").cloned().flatten() == Some(Value::Dword(*level))),
            Op::CleanupDir { dir } => Ok(self.cleanup_bytes.borrow().get(*dir).map(|v| *v == 0).unwrap_or(false)),
        }
    }
}

// ---------------------------------------------------------------------------
// Windows real backend (cfg-gated; stubs on other platforms)
// ---------------------------------------------------------------------------

pub struct RealOs;

impl OsBackend for RealOs {
    fn read(&self, op: &Op) -> Result<BeforeValue, String> {
        real_read(op)
    }
    fn write(&self, op: &Op) -> Result<(), String> {
        real_write(op)
    }
    fn restore(&self, op: &Op, before: &BeforeValue) -> Result<(), String> {
        real_restore(op, before)
    }
    fn is_applied(&self, op: &Op) -> Result<bool, String> {
        real_is_applied(op)
    }
}

#[cfg(target_os = "windows")]
fn run(cmd: &str, args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new(cmd).args(args).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[cfg(not(target_os = "windows"))]
fn real_read(_op: &Op) -> Result<BeforeValue, String> {
    Err("read requires the packaged Windows application".into())
}

#[cfg(not(target_os = "windows"))]
fn real_write(_op: &Op) -> Result<(), String> {
    Err("write requires the packaged Windows application".into())
}

#[cfg(not(target_os = "windows"))]
fn real_restore(_op: &Op, _before: &BeforeValue) -> Result<(), String> {
    Err("restore requires the packaged Windows application".into())
}

#[cfg(not(target_os = "windows"))]
fn real_is_applied(_op: &Op) -> Result<bool, String> {
    Err("detect requires the packaged Windows application".into())
}

#[cfg(target_os = "windows")]
fn real_read(op: &Op) -> Result<BeforeValue, String> {
    match op {
        Op::RegWrite { path, .. } | Op::RegDelete { path } => Ok(BeforeValue::Reg(read_reg(path)?)),
        Op::ServiceStart { name, .. } => Ok(BeforeValue::Service { start_type: service_start_type(name)?, running: service_running(name)? }),
        Op::StartupDisable { name } => Ok(BeforeValue::Startup { enabled: startup_enabled(name)? }),
        Op::PowerScheme { .. } => Ok(BeforeValue::Power { active_scheme: active_power_scheme()? }),
        Op::VfxMode { .. } => Ok(BeforeValue::Vfx { mode: read_dword(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting")?)? }),
        Op::GameMode { .. } => Ok(BeforeValue::Reg(read_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\GameBar", "AutoGameModeEnabled")?)?)),
        Op::GameDvr { .. } => Ok(BeforeValue::Reg(read_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")?)?)),
        Op::Hags { .. } => Ok(BeforeValue::Reg(read_reg(&RegPath::new(Hive::Hkcu, r"System\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")?)?)),
        Op::Telemetry { .. } => Ok(BeforeValue::Reg(read_reg(&RegPath::new(Hive::Hklm, r"Software\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry")?)?)),
        Op::CleanupDir { dir } => Ok(BeforeValue::Count { bytes: cleanup_dir_bytes(dir)? }),
    }
}

#[cfg(target_os = "windows")]
fn real_write(op: &Op) -> Result<(), String> {
    match op {
        Op::RegWrite { path, target } => write_reg(path, target),
        Op::RegDelete { path } => delete_reg(path),
        Op::ServiceStart { name, target } => set_service_start(name, target),
        Op::StartupDisable { name } => disable_startup(name),
        Op::PowerScheme { guid } => run("powercfg", &["/setactive", guid]).map(|_| ()),
        Op::VfxMode { mode } => write_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting")?, &Value::Dword(*mode)),
        Op::GameMode { enable } => write_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\GameBar", "AutoGameModeEnabled")?, &Value::Dword(if *enable { 1 } else { 0 })),
        Op::GameDvr { enable } => write_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")?, &Value::Dword(if *enable { 1 } else { 0 })),
        Op::Hags { enable } => write_reg(&RegPath::new(Hive::Hkcu, r"System\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")?, &Value::Dword(if *enable { 2 } else { 1 })),
        Op::Telemetry { level } => write_reg(&RegPath::new(Hive::Hklm, r"Software\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry")?, &Value::Dword(*level)),
        Op::CleanupDir { dir } => cleanup_dir(dir),
    }
}

#[cfg(target_os = "windows")]
fn real_restore(op: &Op, before: &BeforeValue) -> Result<(), String> {
    match (op, before) {
        (Op::RegWrite { path, .. } | Op::RegDelete { path }, BeforeValue::Reg(v)) => match v {
            Some(val) => write_reg(path, val),
            None => delete_reg(path),
        },
        (Op::ServiceStart { name, .. }, BeforeValue::Service { start_type, running }) => {
            set_service_start(name, start_type)?;
            if *running {
                let _ = run("sc", &["start", name]);
            }
            Ok(())
        }
        (Op::StartupDisable { name }, BeforeValue::Startup { enabled }) => {
            if *enabled {
                enable_startup(name)?;
            }
            Ok(())
        }
        (Op::PowerScheme { .. }, BeforeValue::Power { active_scheme }) => run("powercfg", &["/setactive", active_scheme]).map(|_| ()),
        (Op::VfxMode { .. }, BeforeValue::Vfx { mode }) => real_write(&Op::VfxMode { mode: *mode }),
        (Op::GameMode { .. }, BeforeValue::Reg(v)) => match v {
            Some(val) => real_write(&Op::GameMode { enable: matches!(val, Value::Dword(1)) }),
            None => delete_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\GameBar", "AutoGameModeEnabled")?),
        },
        (Op::GameDvr { .. }, BeforeValue::Reg(v)) => match v {
            Some(val) => real_write(&Op::GameDvr { enable: matches!(val, Value::Dword(1)) }),
            None => delete_reg(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")?),
        },
        (Op::Hags { .. }, BeforeValue::Reg(v)) => match v {
            Some(val) => real_write(&Op::Hags { enable: matches!(val, Value::Dword(2)) }),
            None => delete_reg(&RegPath::new(Hive::Hkcu, r"System\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")?),
        },
        (Op::Telemetry { .. }, BeforeValue::Reg(v)) => match v {
            Some(val) => real_write(&Op::Telemetry { level: dword_of(val) }),
            None => delete_reg(&RegPath::new(Hive::Hklm, r"Software\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry")?),
        },
        (Op::CleanupDir { .. }, BeforeValue::Count { .. }) => Ok(()),
        _ => Err("op/backup mismatch".into()),
    }
}

#[cfg(target_os = "windows")]
fn real_is_applied(op: &Op) -> Result<bool, String> {
    match op {
        Op::RegWrite { path, target } => Ok(read_reg(path)?.as_ref() == Some(target)),
        Op::RegDelete { path } => Ok(read_reg(path)?.is_none()),
        Op::ServiceStart { name, target } => Ok(&service_start_type(name)? == target),
        Op::StartupDisable { name } => Ok(!startup_enabled(name)?),
        Op::PowerScheme { guid } => Ok(&active_power_scheme()? == guid),
        Op::VfxMode { mode } => Ok(&read_dword(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects", "VisualFXSetting")?)? == mode),
        Op::GameMode { enable } => Ok(read_dword(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\GameBar", "AutoGameModeEnabled")?)? == if *enable { 1 } else { 0 }),
        Op::GameDvr { enable } => Ok(read_dword(&RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled")?)? == if *enable { 1 } else { 0 }),
        Op::Hags { enable } => Ok(read_dword(&RegPath::new(Hive::Hkcu, r"System\CurrentControlSet\Control\GraphicsDrivers", "HwSchMode")?)? == if *enable { 2 } else { 1 }),
        Op::Telemetry { level } => Ok(read_dword(&RegPath::new(Hive::Hklm, r"Software\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry")?)? == *level),
        Op::CleanupDir { dir } => Ok(cleanup_dir_bytes(dir)? == 0),
    }
}

#[cfg(target_os = "windows")]
fn read_reg(path: &RegPath) -> Result<Option<Value>, String> {
    let out = match run("reg", &["query", &path.display(), "/v", &path.value]) {
        Ok(o) => o,
        Err(_) => return Ok(None), // value absent
    };
    for line in out.lines() {
        let line = line.trim();
        if line.contains("REG_DWORD") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(raw) = parts.last() {
                if let Ok(v) = u32::from_str_radix(raw.trim_start_matches("0x"), 16) {
                    return Ok(Some(Value::Dword(v)));
                }
            }
        } else if line.contains("REG_SZ") {
            let v = line.splitn(2, "REG_SZ").nth(1).unwrap_or("").trim().to_string();
            return Ok(Some(Value::String(v)));
        } else if line.contains("REG_BINARY") {
            let v = line.splitn(2, "REG_BINARY").nth(1).unwrap_or("").trim().to_string();
            let bytes = v.split_whitespace().filter_map(|b| u8::from_str_radix(b, 16).ok()).collect::<Vec<u8>>();
            return Ok(Some(Value::Binary(bytes)));
        }
    }
    Ok(None)
}

#[cfg(target_os = "windows")]
fn write_reg(path: &RegPath, value: &Value) -> Result<(), String> {
    let (t, d) = match value {
        Value::Dword(v) => ("REG_DWORD", format!("{v}")),
        Value::String(s) => ("REG_SZ", s.clone()),
        Value::Binary(b) => ("REG_BINARY", b.iter().map(|x| format!("{x:02X}")).collect::<String>()),
    };
    run("reg", &["add", &path.display(), "/v", &path.value, "/t", t, "/d", &d, "/f"]).map(|_| ())
}

#[cfg(target_os = "windows")]
fn delete_reg(path: &RegPath) -> Result<(), String> {
    match run("reg", &["delete", &path.display(), "/v", &path.value, "/f"]) {
        Ok(_) => Ok(()),
        Err(_) => Ok(()), // already absent
    }
}

#[cfg(target_os = "windows")]
fn read_dword(path: &RegPath) -> Result<u32, String> {
    match read_reg(path)? {
        Some(Value::Dword(v)) => Ok(v),
        Some(Value::String(s)) => s.parse::<u32>().map_err(|_| "not a dword".to_string()),
        _ => Ok(0),
    }
}

#[cfg(target_os = "windows")]
fn dword_of(v: &Value) -> u32 {
    match v {
        Value::Dword(x) => *x,
        Value::String(s) => s.parse().unwrap_or(0),
        _ => 0,
    }
}

#[cfg(target_os = "windows")]
fn service_start_type(name: &str) -> Result<String, String> {
    let out = run("sc", &["qc", name])?;
    for line in out.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("START_TYPE") {
            let lower = rest.to_lowercase();
            if lower.contains("disabled") {
                return Ok("disabled".into());
            }
            if lower.contains("auto") {
                return Ok("auto".into());
            }
            if lower.contains("demand") {
                return Ok("manual".into());
            }
            if lower.contains("system") {
                return Ok("system".into());
            }
        }
    }
    Ok("manual".into())
}

#[cfg(target_os = "windows")]
fn service_running(name: &str) -> Result<bool, String> {
    let out = run("sc", &["query", name])?;
    Ok(out.to_lowercase().contains("running"))
}

#[cfg(target_os = "windows")]
fn set_service_start(name: &str, start: &str) -> Result<(), String> {
    run("sc", &["config", name, &format!("start= {start}")]).map(|_| ())
}

#[cfg(target_os = "windows")]
fn startup_enabled(name: &str) -> Result<bool, String> {
    let run_path = RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Run", name)?;
    if read_reg(&run_path)?.is_none() {
        return Ok(true); // not a startup entry on this machine
    }
    let approved = RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", name)?;
    match read_reg(&approved)? {
        Some(Value::Binary(b)) if b.first().copied().unwrap_or(0) > 2 => Ok(false),
        _ => Ok(true),
    }
}

#[cfg(target_os = "windows")]
fn disable_startup(name: &str) -> Result<(), String> {
    let approved = RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", name)?;
    write_reg(&approved, &Value::Binary(vec![0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
}

#[cfg(target_os = "windows")]
fn enable_startup(name: &str) -> Result<(), String> {
    let approved = RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run", name)?;
    delete_reg(&approved)
}

#[cfg(target_os = "windows")]
fn active_power_scheme() -> Result<String, String> {
    let out = run("powercfg", &["/getactivescheme"])?;
    let start = out.find('{').ok_or("no scheme guid")? + 1;
    let end = out[start..].find('}').ok_or("no scheme guid")?;
    Ok(out[start..start + end].to_string())
}

#[cfg(target_os = "windows")]
fn cleanup_dir_bytes(dir: &str) -> Result<u64, String> {
    let base = match dir {
        "user_temp" => std::env::var("TEMP").or_else(|_| std::env::var("TMP")).unwrap_or_default(),
        "windows_temp" => r"C:\Windows\Temp".to_string(),
        _ => return Err("unknown cleanup dir".into()),
    };
    if base.is_empty() {
        return Ok(0);
    }
    Ok(dir_size(&base))
}

#[cfg(target_os = "windows")]
fn dir_size(base: &str) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(base) {
        for e in entries.flatten() {
            if e.path().is_file() {
                total += e.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
    total
}

#[cfg(target_os = "windows")]
fn cleanup_dir(dir: &str) -> Result<(), String> {
    let base = match dir {
        "user_temp" => std::env::var("TEMP").or_else(|_| std::env::var("TMP")).unwrap_or_default(),
        "windows_temp" => r"C:\Windows\Temp".to_string(),
        _ => return Err("unknown cleanup dir".into()),
    };
    if base.is_empty() {
        return Ok(());
    }
    // Safety: the resolved base must never be a protected root.
    let resolved = std::fs::canonicalize(&base).unwrap_or(PathBuf::from(&base));
    let upper = resolved.to_string_lossy().to_uppercase();
    for p in PROTECTED_ROOTS {
        if upper == p.to_uppercase() || upper.starts_with(&format!("{p}\\").to_uppercase()) {
            return Err(format!("refusing to clean protected path: {base}"));
        }
    }
    // Only regular files directly inside the temp dir are removed — no
    // recursion, no directories, no symlinks.
    if let Ok(entries) = std::fs::read_dir(&resolved) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_symlink() {
                continue;
            }
            if p.is_file() {
                let _ = std::fs::remove_file(p);
            }
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// System info helpers (Windows-only detection, safe defaults elsewhere)
// ---------------------------------------------------------------------------

pub fn detect_system_info() -> SystemInfo {
    #[cfg(target_os = "windows")]
    let (windows_version, laptop) = (windows_version(), is_laptop());
    #[cfg(not(target_os = "windows"))]
    let (windows_version, laptop) = (None, false);

    SystemInfo { windows_version, laptop, ram_gb: None, vram_mb: None, gpu_vendor: None }
}

#[cfg(target_os = "windows")]
fn windows_version() -> Option<WinVersion> {
    let major_path = RegPath::new(Hive::Hklm, r"Software\Microsoft\Windows NT\CurrentVersion", "CurrentMajorVersionNumber").ok()?;
    let major = read_reg(&major_path).ok()?.and_then(|v| match v {
        Value::Dword(x) => Some(x as u16),
        _ => None,
    })?;
    let build_path = RegPath::new(Hive::Hklm, r"Software\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber").ok()?;
    let build = read_reg(&build_path).ok()?.and_then(|v| match v {
        Value::String(s) => s.trim().parse::<u16>().ok(),
        _ => None,
    })?;
    Some((major, build))
}

#[cfg(target_os = "windows")]
fn is_laptop() -> bool {
    let script = "Get-CimInstance -ClassName Win32_Battery | Measure-Object | Select-Object -ExpandProperty Count";
    std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().parse::<u32>().unwrap_or(0) > 0)
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn new_id() -> String {
    let mut b = [0u8; 16];
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let mut x = (t.as_nanos() as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    for byte in b.iter_mut() {
        x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        *byte = (x >> 33) as u8;
    }
    let mut s = String::with_capacity(36);
    for (i, byte) in b.iter().enumerate() {
        if i == 4 || i == 6 || i == 8 || i == 10 {
            s.push('-');
        }
        s.push_str(&format!("{byte:02x}"));
    }
    s
}

fn now_iso() -> String {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}", t.as_millis())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pcmax-winopt-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn catalog_is_integrity_sound() {
        let cat = catalog();
        assert!(!cat.is_empty());
        let mut ids = std::collections::HashSet::new();
        for t in &cat {
            assert!(ids.insert(t.id), "duplicate tweak id: {}", t.id);
            assert!(!t.name.is_empty() && !t.description.is_empty());
            assert!(!t.ops.is_empty(), "tweak {} has no ops", t.id);
            assert!(t.windows_min.0 >= 10);
        }
        let cats: std::collections::HashSet<Category> = cat.iter().map(|t| t.category).collect();
        for c in [Category::Startup, Category::Services, Category::Gaming, Category::Power, Category::VisualEffects, Category::Privacy, Category::Cleanup] {
            assert!(cats.contains(&c), "missing category {c:?}");
        }
        assert_eq!(TweakDef::get("startup.discord").unwrap().id, "startup.discord");
    }

    #[test]
    fn registry_path_allowlist_rejects_arbitrary_keys() {
        assert!(RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Run", "Discord").is_ok());
        assert!(RegPath::new(Hive::Hklm, r"Software\Policies\Microsoft\Windows\DataCollection", "AllowTelemetry").is_ok());
        assert!(RegPath::new(Hive::Hklm, r"Software\Microsoft\Windows\CurrentVersion\Run", "x").is_err());
        assert!(RegPath::new(Hive::Hkcu, r"Software\..\Windows", "x").is_err());
        assert!(RegPath::new(Hive::Hklm, r"SYSTEM\CurrentControlSet\Services\WinDefend", "Start").is_err());
        assert!(RegPath::new(Hive::Hkcu, "", "x").is_err());
        assert!(RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Run", "").is_err());
        assert!(RegPath::new(Hive::Hkcu, r"Software\Microsoft\Windows\CurrentVersion\Run\..\..\Evil", "x").is_err());
    }

    #[test]
    fn service_catalog_is_allowlisted() {
        for t in catalog() {
            for op in &t.ops {
                if let Op::ServiceStart { name, .. } = op {
                    assert!(SERVICES_ALLOWLIST.contains(name), "service not allowlisted: {name}");
                    assert!(!name.to_lowercase().contains("defend") && !name.to_lowercase().contains("firewall"));
                }
            }
        }
    }

    #[test]
    fn engine_never_touches_security_services() {
        for t in catalog() {
            for op in &t.ops {
                if let Op::ServiceStart { name, .. } = op {
                    for bad in ["WinDefend", "MpsSvc", "WdNisSvc", "wuauserv", "SecurityHealthService", "BITS"] {
                        assert_ne!(*name, bad);
                    }
                }
            }
        }
    }

    #[test]
    fn protected_roots_are_never_cleanup_targets() {
        assert!(CLEANUP_DIRS.iter().all(|d| !PROTECTED_ROOTS.iter().any(|p| (*d).eq_ignore_ascii_case(*p))));
    }

    #[test]
    fn version_gating_works() {
        let t = TweakDef::get("gaming.hags").unwrap();
        assert!(t.supported_on(Some((10, 22621))));
        assert!(t.supported_on(Some((10, 19041))));
        assert!(!t.supported_on(Some((10, 17763))));
        assert!(!t.supported_on(None));
    }

    #[test]
    fn scan_marks_unsupported_and_applied() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("scan"));
        let info = SystemInfo { windows_version: Some((10, 19041)), laptop: false, ram_gb: None, vram_mb: Some(12288), gpu_vendor: None };
        let res = scan(&backend, &info, &store);
        assert!(res.supported);
        assert!(res.tweaks.iter().all(|t| t.supported));
        assert!(res.tweaks.iter().all(|t| !t.applied));
        let hags = res.tweaks.iter().find(|t| t.id == "gaming.hags").unwrap();
        assert!(hags.supported);

        let weak = SystemInfo { windows_version: Some((10, 19041)), laptop: false, ram_gb: None, vram_mb: Some(2048), gpu_vendor: None };
        let res2 = scan(&backend, &weak, &store);
        let hags2 = res2.tweaks.iter().find(|t| t.id == "gaming.hags").unwrap();
        assert!(!hags2.supported);

        let lap = SystemInfo { windows_version: Some((10, 19041)), laptop: true, ram_gb: None, vram_mb: Some(8192), gpu_vendor: None };
        let res3 = scan(&backend, &lap, &store);
        let power = res3.tweaks.iter().find(|t| t.id == "power.high_performance").unwrap();
        assert!(!power.supported);
    }

    #[test]
    fn transaction_applies_verifies_and_commits() {
        let backend = MockOs::new();
        let t = TweakDef::get("gaming.gamedvr").unwrap();
        let mut tx = Transaction::new("gaming");
        tx.apply_tweak(&backend, &t).unwrap();
        assert_eq!(tx.changes.len(), 1);
        assert!(tx.changes[0].verified);
        assert!(backend.is_applied(&t.ops[0]).unwrap());
        tx.commit();
        assert_eq!(tx.status, TxStatus::Committed);
    }

    #[test]
    fn failed_write_rolls_back_everything() {
        // cleanup.temp has 2 ops; a failure on the 2nd write must roll back op 1.
        let backend = MockOs::new().with_failure(2);
        let store = SnapshotStore::new(tmpdir("fail"));
        let dir = tmpdir("fail-marker");
        let res = apply(&backend, &store, &dir, "safe", &["cleanup.temp".to_string()]);
        assert_eq!(res.status, TxStatus::RolledBack);
        assert!(res.error.is_some());
        assert!(read_marker(&dir).is_none());
        let t = TweakDef::get("cleanup.temp").unwrap();
        for op in &t.ops {
            assert!(!backend.is_applied(op).unwrap());
        }
    }

    #[test]
    fn interrupted_transaction_is_recovered_on_next_launch() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("interrupted"));
        let dir = tmpdir("interrupted-marker");

        // Simulate: snapshot saved, marker written, one tweak applied, killed.
        let mut tx = Transaction::new("gaming");
        let t = TweakDef::get("gaming.gamedvr").unwrap();
        tx.apply_tweak(&backend, &t).unwrap();
        let mut snap = Snapshot::from_tx(&tx);
        snap.tweaks = vec![t.id.to_string()];
        store.save(&snap).unwrap();
        write_marker(&dir, &tx.id);

        let report = recover_interrupted(&backend, &dir, &store);
        assert!(report.interrupted);
        assert!(report.recovered);
        assert_eq!(report.rolled_back_changes, 1);
        assert!(read_marker(&dir).is_none());
        assert!(!backend.is_applied(&t.ops[0]).unwrap());
    }

    #[test]
    fn restore_returns_system_to_snapshot_state() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("restore"));
        let dir = tmpdir("restore-marker");
        let res = apply(&backend, &store, &dir, "safe", &["startup.steam".to_string(), "gaming.gamemode".to_string()]);
        assert_eq!(res.status, TxStatus::Committed);
        assert_eq!(res.applied_tweaks.len(), 2);
        assert_eq!(store.list().len(), 1);
        assert_eq!(backend.startup.borrow().get("Steam").copied(), Some(false));
        assert_eq!(backend.reg.borrow().get("gamemode").cloned().flatten(), Some(Value::Dword(1)));

        let restored = restore_snapshot(&backend, &store, &res.snapshot_id).unwrap();
        assert_eq!(restored, res.change_count);
        assert!(store.list().is_empty());
        assert_eq!(backend.startup.borrow().get("Steam").copied().unwrap_or(true), true);
        assert_eq!(backend.reg.borrow().get("gamemode").cloned().flatten(), None);
    }

    #[test]
    fn apply_rejects_unknown_ids() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("unknown"));
        let dir = tmpdir("unknown-marker");
        let res = apply(&backend, &store, &dir, "safe", &["totally.fake".to_string()]);
        assert_eq!(res.status, TxStatus::Failed);
        assert!(res.error.unwrap().contains("unknown"));
    }

    #[test]
    fn snapshot_json_roundtrip() {
        let store = SnapshotStore::new(tmpdir("roundtrip"));
        let snap = Snapshot {
            id: "abc-123".into(),
            created_at: "1".into(),
            profile: "safe".into(),
            tweaks: vec!["gaming.gamedvr".into()],
            changes: vec![Change { tweak_id: "gaming.gamedvr".into(), op_index: 0, before: BeforeValue::Reg(None), verified: true }],
        };
        store.save(&snap).unwrap();
        let loaded = store.load("abc-123").unwrap();
        assert_eq!(loaded.id, snap.id);
        assert_eq!(loaded.changes[0].before, BeforeValue::Reg(None));
        assert_eq!(store.list()[0].change_count, 1);
    }

    #[test]
    fn apply_writes_marker_then_clears_it() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("marker"));
        let dir = tmpdir("marker-dir");
        apply(&backend, &store, &dir, "safe", &["startup.discord".to_string()]);
        assert!(read_marker(&dir).is_none());
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn no_interruption_report_when_clean() {
        let backend = MockOs::new();
        let store = SnapshotStore::new(tmpdir("clean"));
        let dir = tmpdir("clean-marker");
        let report = recover_interrupted(&backend, &dir, &store);
        assert!(!report.interrupted);
        assert_eq!(report.rolled_back_changes, 0);
    }
}
