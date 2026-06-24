mod commands;
mod db;
mod error;
mod models;
mod sync_engine;

use std::sync::Mutex;

use tauri::{Emitter, Manager};
use tauri_plugin_autostart::MacosLauncher;

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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
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

            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon(),
            ) {
                window.set_icon(icon.clone())?;
            }

            // Setup system tray icon with context menu
            use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
            let show_item = MenuItemBuilder::new("显示主窗口 / Show").id("show").build(app)?;
            let pomodoro_item = MenuItemBuilder::new("开始番茄钟 / Start Pomodoro").id("pomodoro").build(app)?;
            let overview_item = MenuItemBuilder::new("总览 / Overview").id("overview").build(app)?;
            let boards_item = MenuItemBuilder::new("任务看板 / Boards").id("boards").build(app)?;
            let goals_item = MenuItemBuilder::new("目标 / Goals").id("goals").build(app)?;
            let calendar_item = MenuItemBuilder::new("日历 / Calendar").id("calendar").build(app)?;
            let settings_item = MenuItemBuilder::new("设置 / Settings").id("settings").build(app)?;
            let quit_item = MenuItemBuilder::new("退出 / Quit").id("quit").build(app)?;

            let nav_menu = SubmenuBuilder::new(app, "导航 / Navigate")
                .item(&overview_item)
                .item(&boards_item)
                .item(&goals_item)
                .item(&calendar_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&pomodoro_item)
                .item(&nav_menu)
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("光阶Todo / Ascend Todo")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let id = event.id().as_ref();
                    match id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.set_focus();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "pomodoro" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", "/pomodoro");
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", "/settings");
                            }
                        }
                        "overview" | "boards" | "goals" | "calendar" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("navigate", format!("/{}", id));
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Check if minimize-to-tray is enabled
                let should_minimize = {
                    let state = window.state::<DbState>();
                    let c = state.conn.lock().expect("db lock");
                    c.query_row(
                        "SELECT value FROM settings WHERE key = 'minimize_to_tray'",
                        [],
                        |r| r.get::<_, String>(0),
                    )
                    .map(|v| v == "1")
                    .unwrap_or(true) // default: minimize to tray
                };
                if should_minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
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
            commands::boards::get_task,
            commands::boards::update_task,
            commands::boards::toggle_task,
            commands::boards::delete_task,
            commands::boards::move_task,
            commands::boards::reorder_tasks,
            commands::boards::get_board_with_structure,
            // goals
            commands::goals::list_goals,
            commands::goals::get_goal,
            commands::goals::create_goal,
            commands::goals::update_goal,
            commands::goals::delete_goal,
            commands::goals::list_deleted_goals,
            commands::goals::permanently_delete_goals,
            commands::goals::empty_goal_trash,
            commands::goals::restore_deleted_goals,
            commands::goals::archive_goal,
            commands::goals::save_review,
            commands::goals::list_milestones,
            commands::goals::create_milestone,
            commands::goals::toggle_milestone,
            commands::goals::delete_milestone,
            commands::goals::reorder_milestones,
            commands::goals::goal_progress,
            commands::goals::link_task_to_kr,
            commands::goals::unlink_task_from_kr,
            // key results
            commands::key_results::list_key_results,
            commands::key_results::create_key_result,
            commands::key_results::update_key_result,
            commands::key_results::check_in_kr,
            commands::key_results::toggle_kr_completed,
            commands::key_results::delete_key_result,
            commands::key_results::reorder_key_results,
            commands::key_results::kr_progress_history,
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
            // period reviews
            commands::reviews::get_review_report,
            commands::reviews::list_review_reports,
            commands::reviews::save_review_report,
            // settings
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::settings::has_setting,
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
            commands::reminders::mark_reminder_sent,
            commands::reminders::upcoming_reminders,
            commands::reminders::get_task_reminder_settings,
            commands::reminders::update_task_reminder_settings,
            commands::reminders::snooze_task_reminder,
            commands::reminders::silence_task_reminder_today,
            commands::reminders::show_reminder_popup,
            commands::reminders::open_reminder_task,
            // updates
            commands::updates::install_update_package,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
