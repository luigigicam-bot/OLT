create index if not exists cierre_historical_olt_idx on olt_control.cierre_mensual(olt_id) where snapshot->>'historico_consolidado'='true';
