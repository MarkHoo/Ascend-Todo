mod commands;
mod db;
mod error;
mod models;
mod sync_engine;

use std::sync::Mutex;

use tauri::Manager;

use crate::db::DbState;

pub fn run() {
    let _ = env_logger::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("ascend-todo"));
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("ascend.db");
            let conn = db::open(&db_path).expect("failed to open db");
            db::migrate(&conn).expect("failed to migrate db");
            app.manage(DbState {
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // boards
            commands::boards::list_boards,
            commands::boards::create_board,
            commands::boards::update_board,
            commands::boards::toggle_pin_board,
            commands::boards::delete_board,
            commands::boards::list_lists,
            commands::boards::create_list,
            commands::boards::rename_list,
            commands::boards::delete_list,
            commands::boards::reorder_lists,
            commands::boards::list_tasks,
            commands::boards::list_all_tasks,
            commands::boards::create_task,
            commands::boards::update_task,
            commands::boards::toggle_task,
            commands::boards::delete_task,
            commands::boards::move_task,
            commands::boards::reorder_tasks,
            commands::boards::create_subtask,
            commands::boards::toggle_subtask,
            commands::boards::delete_subtask,
            commands::boards::get_board_with_structure,
            // goals
            commands::goals::list_goals,
            commands::goals::get_goal,
            commands::goals::create_goal,
            commands::goals::update_goal,
            commands::goals::delete_goal,
            commands::goals::list_milestones,
            commands::goals::create_milestone,
            commands::goals::toggle_milestone,
            commands::goals::delete_milestone,
            commands::goals::reorder_milestones,
            commands::goals::goal_progress,
            // calendar
            commands::calendar::calendar_range,
            // pomodoro
            commands::pomodoro::start_pomodoro,
            commands::pomodoro::end_pomodoro,
            commands::pomodoro::list_pomodoros,
            commands::pomodoro::delete_pomodoro,
            commands::pomodoro::pomodoro_stats,
            // check-ins
            commands::checkins::check_in_today,
            commands::checkins::list_check_ins,
            commands::checkins::check_in_summary,
            commands::checkins::upsert_check_in,
            // settings
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::save_settings,
            // profile
            commands::profile::get_profile,
            commands::profile::save_profile,
            // auth
            commands::auth::register,
            commands::auth::login,
            commands::auth::logout,
            commands::auth::current_session,
            // sync
            commands::sync::sync_status,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_snapshot,
            // reminders
            commands::reminders::pending_reminders,
            commands::reminders::upcoming_reminders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
