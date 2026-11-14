use crate::contracts::{SourceGrant, SourceRef};

/// Phase 5 placeholder. When Graph consent is ready this returns mailbox
/// candidates from `$search`; the body is fetched only for a citation.
pub fn list_outlook(_grant: &SourceGrant) -> Vec<SourceRef> {
    Vec::new()
}

/// Phase 5 placeholder. OneNote pages will be listed with their
/// `lastModifiedDateTime` and `etag`, then read only on demand.
pub fn list_onenote(_grant: &SourceGrant) -> Vec<SourceRef> {
    Vec::new()
}
