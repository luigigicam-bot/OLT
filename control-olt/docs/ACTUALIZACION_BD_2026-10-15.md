# Actualización de BD del 15/10/2026

Se reconcilió la hoja BD del archivo proporcionado por el usuario, conservando la importación anterior y el historial de gestión.

- SHA-256: `21eaeb24da86314057558c078a2c93e12afcc7d66aa07697597e47d18014dedf`.
- Nueva importación: 2. Filas fuente: 6.764. Filas con número y fecha de cargo: 6.197.
- Coincidencias exactas en los 19 campos F:X: 5.972.
- Versiones de registros nuevas en recepción: 792. Los registros anteriores se conservaron.
- Registros con número o fecha de cargo incorporados/corregidos: 604, incluidos los registros nuevos.
- Sin duplicados exactos de negocio en la nueva fuente. Las entregas repetidas se conciliaron por sus 19 campos, sin deduplicar por entrega sola.
- Los blancos del archivo no borraron valores de gestión existentes. Los cierres mensuales no se modificaron.
- El volumen no numérico de la fila 4843 se dejó NULL, conservando `LIMA` en `raw_data.source_anomalies`.

La preparación mantuvo los vínculos OLT vacíos y la fecha de la importación en 1970 para evitar su activación parcial. La conciliación, gestión y activación final se ejecutaron en una transacción, primero con ROLLBACK de prueba y después con COMMIT. Se comprobaron 6.764 vínculos completos y el caso reportado por el usuario.

La migración `latest_bd_snapshot_precedence` corrige el respaldo de SAP histórico: el import más reciente tiene prioridad sobre el número de fila de imports anteriores. Conserva `security_invoker`, permisos y la prioridad del SAP activo.

Resultado verificado en la base: General 6.764 registros. KPI: 6.737 documentos incluidos, 6.503 En Fecha y 234 Fuera de Fecha. Los otros 27 registros están excluidos por la regla existente de RECOGE CLIENTE. De los 234 fuera de fecha, 208 tienen fecha de cargo posterior al vencimiento y 26 no tienen fecha de cargo.

No cambió la fórmula del indicador ni el frontend. Los datos y KPI se actualizan al recargar Control OLT; no se requiere un despliegue de Vercel para esta actualización de datos.
