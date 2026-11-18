pub mod fixture;
pub mod local_fs;
pub mod m365;
pub mod web;

use sha2::{Digest, Sha256};

use crate::contracts::{SourceGrant, SourceRef};

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// Every readable item that is currently allowed. This is computed on demand;
/// nothing about a source's body is stored here.
pub fn list_all(grants: &[SourceGrant]) -> Vec<SourceRef> {
    let mut out = Vec::new();
    for grant in grants {
        match grant.kind.as_str() {
            "file" if grant.scope == "fixture" => out.extend(fixture::list(grant)),
            "file" => out.extend(local_fs::scan(grant)),
            _ => {}
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// Read the original at query time. The result lives in the caller's memory
/// and is dropped after the answer is built.
pub fn read_text(source: &SourceRef) -> Result<String, String> {
    if source.id.starts_with("fixture:") {
        fixture::read(&source.id)
    } else if source.kind == "file" || source.kind == "ocr" {
        local_fs::read_text(&source.location)
    } else {
        Err("This connector is not configured yet.".into())
    }
}
