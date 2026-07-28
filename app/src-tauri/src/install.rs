//! Platform facts for the About screen.
//!
//! Covers only what the frontend cannot get for itself: the target triple this
//! binary was built for and where its AppData lives. Which *build* is installed
//! (cpu / cuda / rocm / metal) is deliberately not here — the setup wizard
//! records that choice, so it is read back from AppData via `get_setup_paths`
//! rather than guessed at runtime.

use serde::Serialize;

use crate::hardware::current_os;
use crate::paths::resolve_data_dir;

#[derive(Serialize)]
pub struct InstallInfo {
    /// "windows" | "macos" | "linux" — same vocabulary as `HardwareInfo::os`.
    pub os: String,
    /// Target architecture of *this* binary ("x86_64", "aarch64"), which on
    /// macOS is the slice of the universal build actually running — worth
    /// reporting because an Intel slice on an Apple Silicon host explains a
    /// whole class of "why is it slow" reports.
    pub arch: String,
    pub data_dir: String,
}

#[tauri::command]
pub fn get_install_info(app_handle: tauri::AppHandle) -> Result<InstallInfo, String> {
    Ok(InstallInfo {
        os: current_os().into(),
        arch: std::env::consts::ARCH.into(),
        data_dir: resolve_data_dir(&app_handle)?
            .to_string_lossy()
            .into_owned(),
    })
}
