use sqlx::MySqlPool;

use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: MySqlPool,
}

impl AppState {
    pub fn new(config: Config, db: MySqlPool) -> Self {
        Self { config, db }
    }
}
