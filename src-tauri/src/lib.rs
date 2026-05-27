mod bridge_client;
mod consent;
mod sidecar;
mod supply_chain;

use tauri::Manager;

#[tauri::command]
fn bridge_status(supervisor: tauri::State<'_, sidecar::BridgeSupervisor>) -> sidecar::BridgeStatus {
    supervisor.status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let supervisor = sidecar::BridgeSupervisor::new()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            let consent_controller = consent::ConsentController::new()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(supervisor.clone());
            app.manage(consent_controller.clone());
            supervisor.start(app.handle().clone());
            consent_controller.start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            consent::consent_allow,
            consent::consent_deny,
            consent::consent_revoke,
            consent::consent_resume,
            consent::consent_state
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            app_handle.state::<sidecar::BridgeSupervisor>().stop();
        }
        _ => {}
    });
}
