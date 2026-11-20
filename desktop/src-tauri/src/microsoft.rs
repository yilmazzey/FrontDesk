use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use reqwest::{Client, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::State;
use tokio::sync::Semaphore;

pub(crate) const GRAPH_URL: &str = "https://graph.microsoft.com/v1.0";

fn tenant_url(tenant: &str, endpoint: &str) -> String {
    format!("https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{endpoint}")
}

fn log_sign_in(message: &str) {
    use std::io::Write;
    let line = format!(
        "{} {message}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    );
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/tmp/frontdesk-microsoft.log")
    {
        let _ = file.write_all(line.as_bytes());
    }
}

fn normalize_tenant(tenant: Option<&str>) -> String {
    tenant
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("common")
        .to_string()
}
// Keep this list to the scopes the app actually uses. Files.Read and
// Mail.Read.Shared are intentionally not requested yet: there is no OneDrive
// or shared-mailbox connector, and Mail.Read.Shared is work/school-only.
const SCOPES: &str = "offline_access User.Read Notes.Read Mail.Read Calendars.Read";

pub struct MicrosoftState {
    pub(crate) client: Client,
    flow: Mutex<Option<DeviceCodeFlow>>,
    tokens: Arc<Mutex<Option<AuthTokens>>>,
    browser: Arc<Mutex<BrowserSignIn>>,
    graph_requests: Semaphore,
}

#[derive(Default)]
struct BrowserSignIn {
    generation: u64,
    active: bool,
    connected: bool,
    error: Option<String>,
}

impl Default for MicrosoftState {
    fn default() -> Self {
        Self {
            client: Client::new(),
            flow: Mutex::new(None),
            tokens: Arc::new(Mutex::new(None)),
            browser: Arc::new(Mutex::new(BrowserSignIn::default())),
            graph_requests: Semaphore::new(2),
        }
    }
}

#[derive(Clone)]
struct DeviceCodeFlow {
    client_id: String,
    tenant: String,
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    expires_at: Instant,
    interval_seconds: u64,
    next_poll_at: Instant,
}

#[derive(Clone)]
struct AuthTokens {
    client_id: String,
    tenant: String,
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Instant,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    message: String,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize, Default)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize, Default)]
struct OAuthError {
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodePrompt {
    user_code: String,
    verification_uri: String,
    message: String,
    interval_seconds: u64,
    expires_in: u64,
}

#[tauri::command]
pub fn current_sign_in(
    state: State<'_, MicrosoftState>,
) -> Result<Option<DeviceCodePrompt>, String> {
    let flow = state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())?
        .clone();
    let Some(flow) = flow else {
        return Ok(None);
    };
    let remaining = flow
        .expires_at
        .saturating_duration_since(Instant::now())
        .as_secs();
    if remaining == 0 {
        clear_flow(&state)?;
        return Ok(None);
    }
    Ok(Some(DeviceCodePrompt {
        user_code: flow.user_code,
        verification_uri: flow.verification_uri,
        message: flow.message,
        interval_seconds: flow.interval_seconds,
        expires_in: remaining,
    }))
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DeviceCodePoll {
    Pending {
        #[serde(rename = "intervalSeconds")]
        interval_seconds: u64,
    },
    Connected,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GraphUser {
    display_name: Option<String>,
    mail: Option<String>,
    user_principal_name: Option<String>,
}

#[derive(Deserialize, Default)]
struct GraphErrorResponse {
    error: Option<GraphError>,
}

#[derive(Deserialize, Default)]
struct GraphError {
    code: Option<String>,
    message: Option<String>,
}

#[tauri::command]
pub async fn begin_sign_in(
    state: State<'_, MicrosoftState>,
    client_id: String,
    tenant: Option<String>,
) -> Result<DeviceCodePrompt, String> {
    let client_id = client_id.trim();
    let tenant = normalize_tenant(tenant.as_deref());
    if client_id.is_empty() {
        return Err("Set VITE_MICROSOFT_CLIENT_ID before signing in.".to_string());
    }

    let response = state
        .client
        .post(tenant_url(&tenant, "devicecode"))
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .await
        .map_err(|error| format!("Could not contact Microsoft sign-in: {error}"))?;
    let result: DeviceCodeResponse = parse_response(response).await?;
    log_sign_in(&format!(
        "begin tenant={tenant} client={client_id} user_code={} expires_in={} scopes={SCOPES}",
        result.user_code, result.expires_in
    ));
    let interval_seconds = result.interval.unwrap_or(5).max(1);
    let now = Instant::now();

    *state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())? =
        Some(DeviceCodeFlow {
            client_id: client_id.to_string(),
            tenant,
            device_code: result.device_code,
            user_code: result.user_code.clone(),
            verification_uri: result.verification_uri.clone(),
            message: result.message.clone(),
            expires_at: now + Duration::from_secs(result.expires_in),
            interval_seconds,
            next_poll_at: now + Duration::from_secs(interval_seconds),
        });

    Ok(DeviceCodePrompt {
        user_code: result.user_code,
        verification_uri: result.verification_uri,
        message: result.message,
        interval_seconds,
        expires_in: result.expires_in,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPrompt {
    pub url: String,
    pub expires_in: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserPoll {
    /// `pending`, `connected`, `error` or `idle`.
    pub status: String,
    pub error: Option<String>,
}

fn random_token(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buffer);
    URL_SAFE_NO_PAD.encode(buffer)
}

fn write_http(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn finish_browser(store: &Arc<Mutex<BrowserSignIn>>, generation: u64, result: Result<(), String>) {
    if let Ok(mut browser) = store.lock() {
        if browser.generation != generation {
            return;
        }
        browser.active = false;
        match result {
            Ok(()) => {
                browser.connected = true;
                browser.error = None;
            }
            Err(error) => {
                browser.error = Some(error);
            }
        }
    }
}

#[tauri::command]
pub fn begin_browser_sign_in(
    state: State<'_, MicrosoftState>,
    client_id: String,
    tenant: Option<String>,
) -> Result<BrowserPrompt, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Set VITE_MICROSOFT_CLIENT_ID before signing in.".into());
    }
    let tenant = normalize_tenant(tenant.as_deref());

    // Prefer the common desktop loopback port so app registrations that pin
    // http://localhost:53682 keep working. Fall back to any free port.
    let listener = match TcpListener::bind("127.0.0.1:53682") {
        Ok(listener) => listener,
        Err(_) => TcpListener::bind("127.0.0.1:0")
            .map_err(|error| format!("Could not start the local sign-in listener: {error}"))?,
    };
    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read the sign-in listener address: {error}"))?
        .port();
    let redirect = format!("http://localhost:{port}/");

    let verifier = random_token(48);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state_token = random_token(24);

    let mut url = reqwest::Url::parse(&tenant_url(&tenant, "authorize"))
        .map_err(|error| format!("Could not build the Microsoft sign-in URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_mode", "query")
        .append_pair("scope", SCOPES)
        .append_pair("state", &state_token)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    let generation = {
        let mut browser = state
            .browser
            .lock()
            .map_err(|_| "Microsoft browser sign-in state is unavailable.".to_string())?;
        browser.generation = browser.generation.wrapping_add(1);
        browser.active = true;
        browser.connected = false;
        browser.error = None;
        browser.generation
    };

    log_sign_in(&format!(
        "browser begin tenant={tenant} client={client_id} redirect={redirect} generation={generation}"
    ));

    let browser_store = Arc::clone(&state.browser);
    let tokens_store = Arc::clone(&state.tokens);
    std::thread::spawn(move || {
        if let Err(error) = listener.set_nonblocking(true) {
            finish_browser(
                &browser_store,
                generation,
                Err(format!("Listener setup failed: {error}")),
            );
            return;
        }
        let deadline = Instant::now() + Duration::from_secs(1800);
        loop {
            let still_active = browser_store
                .lock()
                .map(|browser| browser.active && browser.generation == generation)
                .unwrap_or(false);
            if !still_active || Instant::now() > deadline {
                return;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buffer = [0u8; 8192];
                    let read = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..read]);
                    let target = request
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("/");
                    let parsed = reqwest::Url::parse(&format!("http://localhost{target}")).ok();
                    let params: HashMap<String, String> = parsed
                        .map(|url| url.query_pairs().into_owned().collect())
                        .unwrap_or_default();

                    if params
                        .get("state")
                        .map(|value| value == &state_token)
                        .unwrap_or(false)
                    {
                        if let Some(error) = params.get("error") {
                            let description = params
                                .get("error_description")
                                .cloned()
                                .unwrap_or_else(|| error.clone());
                            write_http(
                                &mut stream,
                                "200 OK",
                                "<h1>Sign-in failed</h1><p>Return to FrontDesk and try again.</p>",
                            );
                            finish_browser(&browser_store, generation, Err(description));
                            return;
                        }
                        if let Some(code) = params.get("code") {
                            write_http(
                                &mut stream,
                                "200 OK",
                                "<h1>FrontDesk is connected</h1><p>You can close this window and return to FrontDesk.</p>",
                            );
                            let client = reqwest::blocking::Client::new();
                            let response = client
                                .post(tenant_url(&tenant, "token"))
                                .form(&[
                                    ("grant_type", "authorization_code"),
                                    ("client_id", client_id.as_str()),
                                    ("code", code.as_str()),
                                    ("redirect_uri", redirect.as_str()),
                                    ("code_verifier", verifier.as_str()),
                                    ("scope", SCOPES),
                                ])
                                .send();
                            let result = match response {
                                Ok(response) => {
                                    let status = response.status();
                                    let body = response.text().unwrap_or_default();
                                    match serde_json::from_str::<TokenResponse>(&body) {
                                        Ok(tokens) if status.is_success() => {
                                            if let Some(access_token) = tokens.access_token {
                                                let refreshed = AuthTokens {
                                                    client_id: client_id.clone(),
                                                    tenant: tenant.clone(),
                                                    access_token,
                                                    refresh_token: tokens.refresh_token,
                                                    expires_at: Instant::now()
                                                        + Duration::from_secs(
                                                            tokens.expires_in.unwrap_or(3600),
                                                        ),
                                                };
                                                if let Ok(mut store) = tokens_store.lock() {
                                                    *store = Some(refreshed);
                                                }
                                                finish_browser(&browser_store, generation, Ok(()));
                                                return;
                                            }
                                            Err("Microsoft did not return an access token.".into())
                                        }
                                        _ => Err(format!(
                                            "Microsoft rejected the sign-in code (HTTP {status})."
                                        )),
                                    }
                                }
                                Err(error) => Err(format!(
                                    "Could not exchange the Microsoft sign-in code: {error}"
                                )),
                            };
                            finish_browser(&browser_store, generation, result);
                            return;
                        }
                    }
                    write_http(&mut stream, "404 Not Found", "Not found");
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150));
                }
                Err(error) => {
                    finish_browser(
                        &browser_store,
                        generation,
                        Err(format!("Local sign-in listener failed: {error}")),
                    );
                    return;
                }
            }
        }
    });

    Ok(BrowserPrompt {
        url: url.to_string(),
        expires_in: 1800,
    })
}

#[tauri::command]
pub fn poll_browser_sign_in(state: State<'_, MicrosoftState>) -> Result<BrowserPoll, String> {
    let browser = state
        .browser
        .lock()
        .map_err(|_| "Microsoft browser sign-in state is unavailable.".to_string())?;
    let status = if browser.active {
        "pending"
    } else if browser.connected {
        "connected"
    } else if browser.error.is_some() {
        "error"
    } else {
        "idle"
    };
    Ok(BrowserPoll {
        status: status.into(),
        error: browser.error.clone(),
    })
}

#[tauri::command]
pub fn cancel_browser_sign_in(state: State<'_, MicrosoftState>) -> Result<(), String> {
    let mut browser = state
        .browser
        .lock()
        .map_err(|_| "Microsoft browser sign-in state is unavailable.".to_string())?;
    browser.generation = browser.generation.wrapping_add(1);
    browser.active = false;
    browser.connected = false;
    browser.error = None;
    Ok(())
}

#[tauri::command]
pub async fn poll_sign_in(state: State<'_, MicrosoftState>) -> Result<DeviceCodePoll, String> {
    let flow = state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())?
        .clone()
        .ok_or_else(|| "No Microsoft sign-in is in progress.".to_string())?;

    if Instant::now() >= flow.expires_at {
        log_sign_in(&format!(
            "expired tenant={} device_code_prefix={} at poll",
            flow.tenant,
            &flow.device_code[..flow.device_code.len().min(12)]
        ));
        clear_flow(&state)?;
        return Err("The sign-in code expired. Start the connection again.".to_string());
    }

    if Instant::now() < flow.next_poll_at {
        return Ok(DeviceCodePoll::Pending {
            interval_seconds: flow.interval_seconds,
        });
    }

    let response = state
        .client
        .post(tenant_url(&flow.tenant, "token"))
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("client_id", flow.client_id.as_str()),
            ("device_code", flow.device_code.as_str()),
        ])
        .send()
        .await
        .map_err(|error| format!("Could not contact Microsoft sign-in: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read Microsoft sign-in response: {error}"))?;
    let result: TokenResponse = serde_json::from_str(&body)
        .map_err(|_| format!("Microsoft returned an invalid sign-in response ({status})."))?;

    if !status.is_success() {
        log_sign_in(&format!(
            "poll tenant={} status={status} error={:?}",
            flow.tenant, result.error
        ));
        match result.error.as_deref() {
            Some("authorization_pending") => {
                schedule_next_poll(&state, flow.interval_seconds)?;
                return Ok(DeviceCodePoll::Pending {
                    interval_seconds: flow.interval_seconds,
                });
            }
            Some("slow_down") => {
                let interval_seconds = flow.interval_seconds.saturating_add(5);
                schedule_next_poll(&state, interval_seconds)?;
                return Ok(DeviceCodePoll::Pending { interval_seconds });
            }
            _ => {
                clear_flow(&state)?;
                return Err(result
                    .error_description
                    .or(result.error)
                    .unwrap_or_else(|| format!("Microsoft sign-in failed ({status}).")));
            }
        }
    }

    let access_token = result
        .access_token
        .ok_or_else(|| "Microsoft sign-in did not return an access token.".to_string())?;
    let expires_in = result.expires_in.unwrap_or(3600);
    *state
        .tokens
        .lock()
        .map_err(|_| "Microsoft authentication state is unavailable.".to_string())? =
        Some(AuthTokens {
            client_id: flow.client_id,
            tenant: flow.tenant.clone(),
            access_token,
            refresh_token: result.refresh_token,
            expires_at: Instant::now() + Duration::from_secs(expires_in),
        });
    log_sign_in(&format!("connected tenant={}", flow.tenant));
    clear_flow(&state)?;

    Ok(DeviceCodePoll::Connected)
}

#[tauri::command]
pub fn cancel_sign_in(state: State<'_, MicrosoftState>) -> Result<(), String> {
    clear_flow(&state)
}

#[tauri::command]
pub fn disconnect(state: State<'_, MicrosoftState>) -> Result<(), String> {
    clear_auth(&state)
}

pub(crate) fn clear_auth(state: &MicrosoftState) -> Result<(), String> {
    clear_flow(state)?;
    *state
        .tokens
        .lock()
        .map_err(|_| "Microsoft authentication state is unavailable.".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub async fn get_profile(state: State<'_, MicrosoftState>) -> Result<Option<GraphUser>, String> {
    let Some(token) = get_access_token(&state).await? else {
        return Ok(None);
    };

    let profile = graph_get(&state, &token, "/me", &[]).await?;
    Ok(Some(profile))
}

pub(crate) async fn get_access_token(state: &MicrosoftState) -> Result<Option<String>, String> {
    let tokens = state
        .tokens
        .lock()
        .map_err(|_| "Microsoft authentication state is unavailable.".to_string())?
        .clone();
    let Some(tokens) = tokens else {
        return Ok(None);
    };

    if Instant::now() + Duration::from_secs(60) < tokens.expires_at {
        return Ok(Some(tokens.access_token));
    }

    let Some(refresh_token) = tokens.refresh_token else {
        *state
            .tokens
            .lock()
            .map_err(|_| "Microsoft authentication state is unavailable.".to_string())? = None;
        return Err("Microsoft sign-in expired. Connect the account again.".to_string());
    };

    let response = state
        .client
        .post(tenant_url(&tokens.tenant, "token"))
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", tokens.client_id.as_str()),
            ("refresh_token", refresh_token.as_str()),
            ("scope", SCOPES),
        ])
        .send()
        .await
        .map_err(|error| format!("Could not refresh Microsoft sign-in: {error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read token refresh response: {error}"))?;
    let result: TokenResponse = serde_json::from_str(&body)
        .map_err(|_| format!("Microsoft returned an invalid token response ({status})."))?;

    if !status.is_success() {
        *state
            .tokens
            .lock()
            .map_err(|_| "Microsoft authentication state is unavailable.".to_string())? = None;
        return Err(result
            .error_description
            .or(result.error)
            .unwrap_or_else(|| format!("Microsoft sign-in refresh failed ({status}).")));
    }

    let access_token = result
        .access_token
        .ok_or_else(|| "Microsoft refresh did not return an access token.".to_string())?;
    let refreshed_tokens = AuthTokens {
        client_id: tokens.client_id,
        tenant: tokens.tenant,
        access_token: access_token.clone(),
        refresh_token: result.refresh_token.or(Some(refresh_token)),
        expires_at: Instant::now() + Duration::from_secs(result.expires_in.unwrap_or(3600)),
    };
    *state
        .tokens
        .lock()
        .map_err(|_| "Microsoft authentication state is unavailable.".to_string())? =
        Some(refreshed_tokens);

    Ok(Some(access_token))
}

pub(crate) async fn graph_get<T: DeserializeOwned>(
    state: &MicrosoftState,
    token: &str,
    path: &str,
    query: &[(&str, &str)],
) -> Result<T, String> {
    let response = graph_send(
        state,
        state
            .client
            .get(format!("{GRAPH_URL}{path}"))
            .bearer_auth(token)
            .query(query),
        "Could not contact Microsoft Graph",
    )
    .await?;
    parse_graph_response(response).await
}

pub(crate) async fn graph_send(
    state: &MicrosoftState,
    request: RequestBuilder,
    context: &str,
) -> Result<Response, String> {
    for attempt in 0..3 {
        let request = request
            .try_clone()
            .ok_or_else(|| "Could not retry the Microsoft Graph request.".to_string())?;
        let permit = state
            .graph_requests
            .acquire()
            .await
            .map_err(|_| "Microsoft Graph request queue is unavailable.".to_string())?;
        let response = request
            .send()
            .await
            .map_err(|error| format!("{context}: {error}"))?;
        if attempt < 2 && matches!(response.status().as_u16(), 429 | 503) {
            let delay = response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .map(|seconds| Duration::from_secs(seconds.clamp(1, 30)))
                .unwrap_or_else(|| Duration::from_secs(1 << attempt));
            drop(permit);
            tokio::time::sleep(delay).await;
            continue;
        }
        return Ok(response);
    }
    unreachable!("the retry loop always returns or continues")
}

async fn parse_response<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read Microsoft response: {error}"))?;
    if !status.is_success() {
        let error = serde_json::from_str::<OAuthError>(&body).unwrap_or_default();
        return Err(error
            .error_description
            .or(error.error)
            .unwrap_or_else(|| format!("Microsoft request failed ({status}).")));
    }
    serde_json::from_str(&body)
        .map_err(|_| format!("Microsoft returned an invalid response ({status})."))
}

pub(crate) async fn parse_graph_response<T: DeserializeOwned>(
    response: Response,
) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read Microsoft Graph response: {error}"))?;
    if !status.is_success() {
        let error = serde_json::from_str::<GraphErrorResponse>(&body).unwrap_or_default();
        let details = error
            .error
            .and_then(|error| match (error.code, error.message) {
                (Some(code), Some(message)) => Some(format!("{code}: {message}")),
                (Some(code), None) => Some(code),
                (None, Some(message)) => Some(message),
                (None, None) => None,
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("Microsoft Graph request failed: {details}"));
    }
    serde_json::from_str(&body)
        .map_err(|_| format!("Microsoft Graph returned an invalid response ({status})."))
}

pub(crate) async fn parse_graph_text(response: Response) -> Result<String, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("Could not read Microsoft OneNote response: {error}"))?;
    if !status.is_success() {
        let error = serde_json::from_str::<GraphErrorResponse>(&body).unwrap_or_default();
        let details = error
            .error
            .and_then(|error| match (error.code, error.message) {
                (Some(code), Some(message)) => Some(format!("{code}: {message}")),
                (Some(code), None) => Some(code),
                (None, Some(message)) => Some(message),
                (None, None) => None,
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("Microsoft OneNote request failed: {details}"));
    }
    Ok(body)
}

fn clear_flow(state: &MicrosoftState) -> Result<(), String> {
    *state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())? = None;
    Ok(())
}

fn schedule_next_poll(state: &MicrosoftState, interval_seconds: u64) -> Result<(), String> {
    let mut flow = state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())?;
    if let Some(flow) = flow.as_mut() {
        flow.interval_seconds = interval_seconds;
        flow.next_poll_at = Instant::now() + Duration::from_secs(interval_seconds);
    }
    Ok(())
}
