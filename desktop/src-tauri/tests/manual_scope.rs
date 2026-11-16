use std::env;
use std::path::Path;

use frontdesk_lib::answer;
use frontdesk_lib::contracts::SourceGrant;

/// Manual smoke test against a real folder. It stays ignored so CI and
/// teammates never depend on a personal path.
///
/// ```bash
/// FRONTDESK_TEST_SCOPE="/path/to/folder" \
/// FRONTDESK_TEST_MODEL="model.gguf" \
/// FRONTDESK_TEST_MODE="chat" \
/// cargo test --test manual_scope -- --ignored --nocapture
/// ```
#[test]
#[ignore]
fn ask_a_real_folder() {
    let scope = env::var("FRONTDESK_TEST_SCOPE").expect("set FRONTDESK_TEST_SCOPE");
    let question =
        env::var("FRONTDESK_TEST_QUESTION").unwrap_or_else(|_| "Summarize the article".into());
    let mode = env::var("FRONTDESK_TEST_MODE").unwrap_or_else(|_| "chat".into());
    let model = env::var("FRONTDESK_TEST_MODEL").ok();

    let grants = vec![SourceGrant {
        id: "file:manual".into(),
        kind: "file".into(),
        scope,
        title: "Manual scope".into(),
        granted_at: "2026-11-14T00:00:00Z".into(),
    }];

    let models_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../models");
    let result = answer::ask(&question, &grants, model.as_deref(), &models_dir, &mode);

    println!("status: {}", result.answer.status);
    println!("basis: {}", result.answer.basis);
    println!("model: {}", result.answer.model);
    println!("text: {}", result.answer.text);
    println!("read: {:?}", result.read_sources);
    for citation in &result.answer.citations {
        println!(
            "citation: {} {} — {}",
            citation.title, citation.location, citation.excerpt
        );
    }

    assert!(
        result.answer.status != "error",
        "ask failed: {}",
        result.answer.text
    );
}
