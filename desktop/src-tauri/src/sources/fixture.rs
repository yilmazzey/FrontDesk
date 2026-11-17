use crate::contracts::{SourceGrant, SourceRef};

const NOTES: &[(&str, &str, &str)] = &[
    (
        "welcome",
        "Welcome to FrontDesk",
        "FrontDesk is a local-first workspace. Nothing is copied. The assistant reads only the sources you currently allow, on the fly. Knowledge stays where it was saved, and the original file remains the source of truth. Honest by design: if an answer is not in the allowed notes, FrontDesk says so plainly and does not guess. Every claim must be tied to a source. You can revoke access at any time from the Access page. The local model runs on this machine and no note content is uploaded.",
    ),
    (
        "protocol",
        "Study protocol — working notes",
        "The protocol review is scheduled for Friday at 09:30. The consent wording needs a second pass before the site sync. The retention window for scanned documents is seven years. The second site does not need its own approval, but the local ethics contact must be notified. Scanned patient pages are processed with OCR and the text is kept only for the duration of the answer. The original scan stays in the study folder and is cited by page and region.",
    ),
    (
        "citations",
        "Citations that hold up",
        "Every answer should point at a paragraph, not a whole document. Show the quote inline and let the reader jump to it. A citation stores the exact fetched excerpt, never a paraphrase. If the model adds a claim without a citation, the verifier drops the claim. When the evidence is thin, the correct response is to say that the allowed sources do not contain the answer.",
    ),
];

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn list(grant: &SourceGrant) -> Vec<SourceRef> {
    NOTES
        .iter()
        .map(|(id, title, body)| SourceRef {
            id: format!("fixture:{id}"),
            grant_id: grant.id.clone(),
            kind: "file".into(),
            title: (*title).into(),
            location: format!("fixture://{id}"),
            modified: now(),
            hash: super::sha256_hex(body.as_bytes()),
            people: Vec::new(),
        })
        .collect()
}

pub fn read(id: &str) -> Result<String, String> {
    let key = id.trim_start_matches("fixture:");
    NOTES
        .iter()
        .find(|(note_id, _, _)| *note_id == key)
        .map(|(_, _, body)| (*body).to_string())
        .ok_or_else(|| format!("Unknown fixture source: {id}"))
}
