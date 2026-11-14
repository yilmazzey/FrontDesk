use std::path::{Path, PathBuf};

use frontdesk_lib::answer;
use frontdesk_lib::contracts::SourceGrant;

#[derive(Clone, Copy, PartialEq)]
enum Expect {
    Answered,
    Insufficient,
    Clarify,
}

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/notes")
}

fn grants() -> Vec<SourceGrant> {
    vec![SourceGrant {
        id: "file:fixtures".into(),
        kind: "file".into(),
        scope: fixtures().to_string_lossy().to_string(),
        title: "Eval fixtures".into(),
        granted_at: "2026-11-14T00:00:00Z".into(),
    }]
}

/// 25 questions: 17 answerable, 3 ambiguous, 5 unanswerable. The check is the
/// contract, not the exact wording: every answered item must carry at least one
/// non-empty citation, and an unanswerable item must carry none.
#[test]
fn eval_set_has_no_uncited_answers() {
    let cases: Vec<(&str, Expect)> = vec![
        ("When is the protocol review?", Expect::Answered),
        (
            "What needs a second pass before the site sync?",
            Expect::Answered,
        ),
        (
            "Does the second site need its own approval?",
            Expect::Answered,
        ),
        ("How is scanned patient text handled?", Expect::Answered),
        ("What should every answer point at?", Expect::Answered),
        ("What does a citation store?", Expect::Answered),
        (
            "What happens to a claim without a citation?",
            Expect::Answered,
        ),
        (
            "What is the correct response when evidence is thin?",
            Expect::Answered,
        ),
        ("Where does knowledge stay?", Expect::Answered),
        ("What does the assistant read?", Expect::Answered),
        ("Can access be revoked?", Expect::Answered),
        ("Is note content uploaded?", Expect::Answered),
        (
            "What happens when an answer is not in the allowed notes?",
            Expect::Answered,
        ),
        (
            "Is the original file the source of truth?",
            Expect::Answered,
        ),
        ("What is used to read scanned pages?", Expect::Answered),
        ("Should a quote be shown inline?", Expect::Answered),
        ("Does FrontDesk keep a copy of notes?", Expect::Answered),
        ("What is the retention window?", Expect::Clarify),
        ("Tell me about retention.", Expect::Clarify),
        ("Retention policy for scanned documents?", Expect::Clarify),
        ("What is the capital of France?", Expect::Insufficient),
        ("Who won the 2018 World Cup?", Expect::Insufficient),
        (
            "What is the price of the Studio plan?",
            Expect::Insufficient,
        ),
        ("What did the CEO say about layoffs?", Expect::Insufficient),
        (
            "What is the weather in Berlin tomorrow?",
            Expect::Insufficient,
        ),
    ];

    assert_eq!(cases.len(), 25);

    let grants = grants();
    let mut answered = 0;
    let mut insufficient = 0;
    let mut clarified = 0;

    for (question, expect) in cases {
        let result = answer::ask(question, &grants, None, Path::new("."));
        let answer = result.answer;

        match expect {
            Expect::Answered => {
                assert_eq!(
                    answer.status, "answered",
                    "expected an answer for: {question}"
                );
                assert!(
                    !answer.citations.is_empty(),
                    "answered without a citation: {question}"
                );
                for citation in &answer.citations {
                    assert!(
                        !citation.excerpt.trim().is_empty(),
                        "empty citation excerpt: {question}"
                    );
                }
                answered += 1;
            }
            Expect::Insufficient => {
                assert_eq!(
                    answer.status, "insufficient",
                    "expected an honest refusal for: {question}"
                );
                assert!(
                    answer.citations.is_empty(),
                    "refusal must not carry citations: {question}"
                );
                insufficient += 1;
            }
            Expect::Clarify => {
                assert_eq!(
                    answer.status, "needs_clarification",
                    "expected one clarifying question for: {question}"
                );
                let clarification = answer
                    .clarification
                    .expect("a clarification response needs options");
                assert!(
                    clarification.options.len() >= 2,
                    "clarification needs at least two options: {question}"
                );
                clarified += 1;
            }
        }
    }

    assert_eq!(answered, 17);
    assert_eq!(insufficient, 5);
    assert_eq!(clarified, 3);
}
