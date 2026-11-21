//! Repeatable local performance measurements for the presentation deck.
//!
//! Run with:
//! `cargo test --release --test perf -- --ignored --nocapture`

use std::path::Path;
use std::time::Instant;

use frontdesk_lib::answer;
use frontdesk_lib::contracts::SourceGrant;

fn grants() -> Vec<SourceGrant> {
    vec![SourceGrant {
        id: "file:fixtures".into(),
        kind: "file".into(),
        scope: Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/notes")
            .to_string_lossy()
            .to_string(),
        title: "Eval fixtures".into(),
        granted_at: "2026-11-14T00:00:00Z".into(),
    }]
}

#[test]
#[ignore]
fn measure_extractive_latency() {
    let grants = grants();
    let questions = [
        "When is the protocol review?",
        "What is the retention window?",
        "What does a citation store?",
        "Does the second site need its own approval?",
        "Where does knowledge stay?",
    ];

    // Warm the file cache and the in-memory index path.
    let _ = answer::ask(questions[0], &grants, None, Path::new("."), "grounded");

    let iterations = 200;
    let started = Instant::now();
    for index in 0..iterations {
        let _ = answer::ask(
            questions[index % questions.len()],
            &grants,
            None,
            Path::new("."),
            "grounded",
        );
    }
    let elapsed = started.elapsed();
    println!(
        "extractive end-to-end: {} queries in {:?} ({:.2} ms/query)",
        iterations,
        elapsed,
        elapsed.as_secs_f64() * 1000.0 / iterations as f64
    );
}
