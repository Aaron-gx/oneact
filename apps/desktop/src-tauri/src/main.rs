// 一幕 OneAct 桌面端：Tauri 2 加载完整 web 编辑器（apps/web/dist）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    oneact_lib::run();
}
