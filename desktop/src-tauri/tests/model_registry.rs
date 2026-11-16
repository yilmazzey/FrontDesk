use std::path::Path;

/// The model folder is the plug-in surface: every GGUF file is a selectable
/// adapter, and the first model is expected to be present in development.
#[test]
fn registry_finds_the_selected_gguf() {
    let models_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../models");
    let models = frontdesk_lib::model::list(&models_dir);

    assert!(
        !models.is_empty(),
        "expected at least one .gguf in {}",
        models_dir.display()
    );

    let first = &models[0];
    assert!(first.id.ends_with(".gguf"));
    assert!(first.size_bytes > 0);
    assert!(frontdesk_lib::model::path_for(&models_dir, &first.id).is_some());
}
