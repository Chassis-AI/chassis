// CHASSIS — coque desktop. Toute la logique vit dans le web (TypeScript).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erreur au lancement du cockpit CHASSIS");
}
