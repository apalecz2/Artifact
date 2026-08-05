//! Durable record of the user's acceptance of the Terms & Privacy Policy.
//!
//! The clickwrap itself lives in the frontend (`features/legal/eulaAcceptance.ts`), and
//! its fast path is `localStorage`. That alone is a weak place to keep the one artifact
//! that evidences consent: webview storage is per-origin, is wiped by "clear browsing
//! data" in the underlying WebView2/WKWebView profile, and does not survive a profile
//! being recreated. A user who lost it would be re-prompted — correct, but it also means
//! there is no record left of the acceptance that *did* happen.
//!
//! So acceptance is mirrored to `consent.json` in the app-data directory, alongside the
//! rest of the install. `localStorage` stays the synchronous read the gate renders from;
//! this file is what restores it, and what remains on disk as the record.
//!
//! It is deliberately *not* exempt from "Remove all downloaded data": `reset.rs` empties
//! the whole data directory, this file included, because that action promises to leave
//! nothing behind and a stray consent record would make that untrue. Clearing it also
//! re-prompts on next launch, which is the right outcome for a user who just asked to be
//! forgotten.

use std::fs;

use serde::{Deserialize, Serialize};

use crate::paths::resolve_data_dir;

const CONSENT_FILENAME: &str = "consent.json";

/// One acceptance: which version of the terms, and when it was accepted.
///
/// `version` is the EULA's effective date (`EULA_VERSION`, kept equal to the
/// `Effective date` line in EULA.md by `legalContent.test.ts`), so the record names the
/// document the user was actually shown rather than an opaque counter.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ConsentRecord {
    pub version: String,
    /// ISO-8601 timestamp, produced by the frontend at the moment of acceptance.
    pub accepted_at: String,
}

/// Read the stored acceptance, or `None` when there is no readable record.
///
/// A missing, unreadable, or malformed file is `None`, never an error: the caller's only
/// use for this is to decide whether the gate can be skipped, and every failure mode has
/// to fail closed to showing it. An error return would tempt a caller into treating
/// "couldn't read" as "already accepted".
#[tauri::command]
pub fn read_consent_record(app_handle: tauri::AppHandle) -> Option<ConsentRecord> {
    let path = resolve_data_dir(&app_handle).ok()?.join(CONSENT_FILENAME);
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

/// Persist an acceptance, creating the data directory if this is a first run.
///
/// Errors are returned rather than swallowed so the caller can log them, but the
/// frontend treats a failure as non-fatal: `localStorage` has already been written by
/// then, so a machine where this file cannot be created still works — it just loses the
/// durability this module adds.
#[tauri::command]
pub fn write_consent_record(
    app_handle: tauri::AppHandle,
    version: String,
    accepted_at: String,
) -> Result<(), String> {
    let dir = resolve_data_dir(&app_handle)?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create AppData directory: {error}"))?;

    let record = ConsentRecord {
        version,
        accepted_at,
    };
    let json = serde_json::to_string_pretty(&record)
        .map_err(|error| format!("failed to serialize consent record: {error}"))?;

    fs::write(dir.join(CONSENT_FILENAME), json)
        .map_err(|error| format!("failed to write consent record: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_json() {
        let record = ConsentRecord {
            version: "2026-08-04".into(),
            accepted_at: "2026-08-04T12:00:00.000Z".into(),
        };
        let json = serde_json::to_string(&record).unwrap();
        assert_eq!(
            serde_json::from_str::<ConsentRecord>(&json).unwrap(),
            record
        );
    }

    // The read path has to fail closed: anything it cannot parse is "no consent
    // recorded", so the gate shows rather than being skipped on a corrupt file.
    #[test]
    fn malformed_json_is_not_a_record() {
        for bad in ["", "{}", "not json", r#"{"version":"2026-08-04"}"#] {
            assert!(
                serde_json::from_str::<ConsentRecord>(bad).is_err(),
                "parsed: {bad}"
            );
        }
    }
}
