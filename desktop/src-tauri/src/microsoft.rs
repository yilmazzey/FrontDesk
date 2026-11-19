use reqwest::{Client, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;
use tokio::sync::Semaphore;

const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
pub(crate) const GRAPH_URL: &str = "https://graph.microsoft.com/v1.0";
const SCOPES: &str =
    "offline_access User.Read Files.Read Notes.Read Mail.Read Mail.Read.Shared Calendars.Read";

pub struct MicrosoftState {
    pub(crate) client: Client,
    flow: Mutex<Option<DeviceCodeFlow>>,
    tokens: Mutex<Option<AuthTokens>>,
    graph_requests: Semaphore,
}

impl Default for MicrosoftState {
    fn default() -> Self {
        Self {
            client: Client::new(),
            flow: Mutex::new(None),
            tokens: Mutex::new(None),
            graph_requests: Semaphore::new(2),
        }
    }
}

#[derive(Clone)]
struct DeviceCodeFlow {
    client_id: String,
    device_code: String,
    expires_at: Instant,
    interval_seconds: u64,
    next_poll_at: Instant,
}

#[derive(Clone)]
struct AuthTokens {
    client_id: String,
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

#[derive(Deserialize)]
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
) -> Result<DeviceCodePrompt, String> {
    let client_id = client_id.trim();
    if client_id.is_empty() {
        return Err("Set VITE_MICROSOFT_CLIENT_ID before signing in.".to_string());
    }

    let response = state
        .client
        .post(DEVICE_CODE_URL)
        .form(&[("client_id", client_id), ("scope", SCOPES)])
        .send()
        .await
        .map_err(|error| format!("Could not contact Microsoft sign-in: {error}"))?;
    let result: DeviceCodeResponse = parse_response(response).await?;
    let interval_seconds = result.interval.unwrap_or(5).max(1);
    let now = Instant::now();

    *state
        .flow
        .lock()
        .map_err(|_| "Microsoft sign-in state is unavailable.".to_string())? =
        Some(DeviceCodeFlow {
            client_id: client_id.to_string(),
            device_code: result.device_code,
            expires_at: now + Duration::from_secs(result.expires_in),
            interval_seconds,
            next_poll_at: now + Duration::from_secs(interval_seconds),
        });

    Ok(DeviceCodePrompt {
        user_code: result.user_code,
        verification_uri: result.verification_uri,
        message: result.message,
        interval_seconds,
    })
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
        .post(TOKEN_URL)
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
            access_token,
            refresh_token: result.refresh_token,
            expires_at: Instant::now() + Duration::from_secs(expires_in),
        });
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
        .post(TOKEN_URL)
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
