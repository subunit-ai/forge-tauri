mod bridge_client;
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let supervisor = sidecar::BridgeSupervisor::new()
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(supervisor.clone());
            supervisor.start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![bridge_status])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
            app_handle.state::<sidecar::BridgeSupervisor>().stop();
        }
        _ => {}
    });
}
