use crate::bridge_client::{BridgeClient, BridgeClientError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    sync::{Arc, Mutex, MutexGuard},
};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{interval, sleep, Duration, MissedTickBehavior};

const CONSENT_REQUEST_EVENT: &str = "consent://request";
const CONSENT_STATE_EVENT: &str = "consent://state";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ConsentRequest {
    pub id: String,
    #[serde(default)]
    pub operator_id: Option<String>,
    #[serde(default)]
    pub cmd: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub scope: Option<Value>,
    #[serde(default)]
    pub expires_at: Option<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ConsentState {
    #[serde(default = "default_remote_access")]
    pub remote_access: String,
    #[serde(default)]
    pub session_grant: Option<Value>,
    #[serde(default)]
    pub pending_count: u64,
    #[serde(default)]
    pub last_session_active_at: Option<Value>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone)]
pub struct ConsentController {
    client: BridgeClient,
    seen_pending: Arc<Mutex<HashSet<String>>>,
}

#[derive(Serialize)]
struct AllowBody {
    #[serde(skip_serializing_if = "Option::is_none")]
    remember_for_seconds: Option<u64>,
}

impl ConsentController {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            client: BridgeClient::new()?,
            seen_pending: Arc::new(Mutex::new(HashSet::new())),
        })
    }

    pub fn start<R>(&self, app: AppHandle<R>)
    where
        R: Runtime,
    {
        let controller = self.clone();
        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_secs(1)).await;

            let mut ticker = interval(Duration::from_secs(1));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

            loop {
                ticker.tick().await;
                controller.poll_once(&app).await;
            }
        });
    }

    pub async fn state(&self) -> Result<ConsentState, BridgeClientError> {
        self.client.get_authed_json("/consent/state").await
    }

    pub async fn allow(
        &self,
        id: &str,
        remember_for_seconds: Option<u64>,
    ) -> Result<(), BridgeClientError> {
        self.client
            .post_authed_json(
                &format!("/consent/{id}/allow"),
                &AllowBody {
                    remember_for_seconds,
                },
            )
            .await
    }

    pub async fn deny(&self, id: &str) -> Result<(), BridgeClientError> {
        self.client
            .post_authed_json(&format!("/consent/{id}/deny"), &serde_json::json!({}))
            .await
    }

    pub async fn revoke(&self) -> Result<(), BridgeClientError> {
        self.client
            .post_authed_json("/consent/revoke", &serde_json::json!({}))
            .await
    }

    pub async fn resume(&self) -> Result<(), BridgeClientError> {
        self.client
            .post_authed_json("/consent/resume", &serde_json::json!({}))
            .await
    }

    async fn pending(&self) -> Result<Vec<ConsentRequest>, BridgeClientError> {
        self.client.get_authed_json("/consent/pending").await
    }

    async fn poll_once<R>(&self, app: &AppHandle<R>)
    where
        R: Runtime,
    {
        match self.state().await {
            Ok(state) => {
                if let Err(error) = app.emit(CONSENT_STATE_EVENT, state) {
                    eprintln!("failed to emit consent state: {error}");
                }
            }
            Err(error) => eprintln!("failed to poll consent state: {error}"),
        }

        let pending = match self.pending().await {
            Ok(pending) => pending,
            Err(error) => {
                eprintln!("failed to poll pending consent requests: {error}");
                return;
            }
        };

        let new_rows = self.record_new_pending(&pending);
        for row in new_rows {
            if let Err(error) = app.emit(CONSENT_REQUEST_EVENT, &row) {
                eprintln!("failed to emit consent request {}: {error}", row.id);
            }
            raise_main_window(app);
            show_notification(app, &row);
        }
    }

    fn record_new_pending(&self, pending: &[ConsentRequest]) -> Vec<ConsentRequest> {
        let current_ids = pending
            .iter()
            .map(|row| row.id.clone())
            .collect::<HashSet<_>>();
        let mut seen_pending = self.lock_seen_pending();
        let mut new_rows = Vec::new();

        for row in pending {
            if seen_pending.insert(row.id.clone()) {
                new_rows.push(row.clone());
            }
        }

        seen_pending.retain(|id| current_ids.contains(id));
        new_rows
    }

    fn lock_seen_pending(&self) -> MutexGuard<'_, HashSet<String>> {
        self.seen_pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[tauri::command]
pub async fn consent_allow(
    controller: tauri::State<'_, ConsentController>,
    id: String,
    remember_for_seconds: Option<u64>,
) -> Result<(), String> {
    controller
        .allow(&id, remember_for_seconds)
        .await
        .map_err(error_to_string)
}

#[tauri::command]
pub async fn consent_deny(
    controller: tauri::State<'_, ConsentController>,
    id: String,
) -> Result<(), String> {
    controller.deny(&id).await.map_err(error_to_string)
}

#[tauri::command]
pub async fn consent_revoke(controller: tauri::State<'_, ConsentController>) -> Result<(), String> {
    controller.revoke().await.map_err(error_to_string)
}

#[tauri::command]
pub async fn consent_resume(controller: tauri::State<'_, ConsentController>) -> Result<(), String> {
    controller.resume().await.map_err(error_to_string)
}

#[tauri::command]
pub async fn consent_state(
    controller: tauri::State<'_, ConsentController>,
) -> Result<ConsentState, String> {
    controller.state().await.map_err(error_to_string)
}

fn raise_main_window<R>(app: &AppHandle<R>)
where
    R: Runtime,
{
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_notification<R>(app: &AppHandle<R>, row: &ConsentRequest)
where
    R: Runtime,
{
    let operator = row.operator_id.as_deref().unwrap_or("Unbekannter Operator");
    let command = if row.cmd.is_empty() {
        "Remote-Befehl wartet auf Freigabe".to_string()
    } else {
        truncate(&row.cmd.join(" "), 140)
    };
    let body = format!("{operator}: {command}");

    if let Err(error) = app
        .notification()
        .builder()
        .title("Forge-Freigabe erforderlich")
        .body(body)
        .show()
    {
        eprintln!("failed to show consent notification: {error}");
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    let mut chars = value.chars();
    let mut truncated = chars.by_ref().take(max_chars).collect::<String>();
    if chars.next().is_some() {
        truncated.push_str("...");
    }
    truncated
}

fn default_remote_access() -> String {
    "active".to_string()
}

fn error_to_string(error: BridgeClientError) -> String {
    error.to_string()
}
