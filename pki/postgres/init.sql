-- =============================================================
-- 360DigitalTrust — Initialisation PostgreSQL pour EJBCA
-- =============================================================

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Index de performance sur les tables EJBCA les plus sollicitées
-- (EJBCA crée lui-même le schéma au premier démarrage)

-- Configuration des paramètres de performance
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '512MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = '100';
ALTER SYSTEM SET log_min_duration_statement = '1000';

-- Accès restreint
REVOKE ALL ON DATABASE ejbca FROM PUBLIC;
GRANT CONNECT ON DATABASE ejbca TO ejbca;
GRANT ALL PRIVILEGES ON DATABASE ejbca TO ejbca;

SELECT pg_reload_conf();
