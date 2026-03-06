use eframe::egui;

enum AppState {
    Started,
    Stopped,
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions::default();
    let mut app_state = AppState::Stopped;

    eframe::run_simple_native("AZOR", options, move |ctx, _frame| {
        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("AZOR Service Connector");
            if ui.button(
                match app_state {
                    AppState::Stopped => "Start Service Connection",
                    AppState::Started => "Stop Service Connection",
                }
            ).clicked() {
                match app_state {
                    AppState::Stopped => {
                        // Start the service connection logic here
                        println!("Starting AZOR service connection...");
                        app_state = AppState::Started;
                    }
                    AppState::Started => {
                        // Stop the service connection logic here
                        println!("Stopping AZOR service connection...");
                        app_state = AppState::Stopped;
                    }
                }  
            }
        });
    })
}