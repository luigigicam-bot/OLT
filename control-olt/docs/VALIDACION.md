# Evidencia de validación — 8 octubre 2026

## Ejecutado

- 26 tests Node: 10 parser, 7 indicadores, 4 KPI, 5 integración DOM con Supabase/Worker simulados. Incluyen XLSX ZIP, XLS OLE, SAP texto Windows-1252, aliases, encabezados duplicados, fechas/horas inválidas, desempates, vencimientos, AP, AQ, navegación, edición RPC, confirmación de publicación, falla y migración ausente.
- Archivo real 20.XLS (no incorporado al repositorio público): 5.504.712 bytes, cabecera fila 4, 9.094 filas válidas, 8.256 entregas únicas, 0 inválidas; parsing observado 133 ms en este entorno.
- Build Vite correcto. Dependencias npm fijadas; SheetJS 0.20.3 oficial; Vite actualizado de 7.1.7 a 7.3.7 tras advisory alto. Auditoría npm final: 0 vulnerabilidades.
- Las tres consultas de la migración pendiente se validaron con EXPLAIN de solo lectura sobre el esquema real. Esto comprueba SQL y referencias de columnas; no demuestra aplicación de DDL ni resultados con fixtures nuevos.
- SQL de indicadores: fila Lima 08/10/2026, hoy 09/10/2026 → vencimiento 09/10/2026, En Fecha, Vencen Hoy, Vence hoy 0 días.
- RLS: rol authenticated sin JWT ve 0 filas de olt_control_rows. Catálogo: INSERT snapshot=false, UPDATE puntero=false, anon EXECUTE publish=false, authenticated EXECUTE publish=true.
- Security advisor: único WARN de contraseñas filtradas desactivadas. Performance advisor: 33 índices sin uso observado; ninguno eliminado.

## KPI operativo y filtros nuevos

- Migración aditiva de lectura `20261008175823_operational_kpi_readonly.sql` aplicada correctamente, sin modificar objetos preexistentes ni escribir datos de negocio.
- SQL real con rol authenticated y claim del propietario: 16 documentos KPI, 8 En Fecha y 8 Fuera de Fecha. Conteo de detalle igual al total, rango inclusivo de SAP y filtro mes igual a su predicado de referencia, todos los conteos por zona/línea/indicador iguales al detalle.
- Claim de usuario ajeno sintético: total 0, página vacía y opciones vacías. Comprueba aislamiento de consultas, sin iniciar sesión ni alterar registros.
- Tests KPI: caso 1/2 = 50%, base vacía sin inventar 0%, agregado ET ponderado 1/10 = 10%, escape de etiquetas y documentos sin indicador dentro de la base.
- Test DOM: navegación KPI, dos fechas InActTrans simultáneas con mes Fec.Despacho independiente, bloqueo de fechas invertidas, detalle preserva fechas/mes/zona/indicador y exclusión de RECOGE CLIENTE; limpiar filtros restablece el conjunto.
- Consultas sucesivas capturan filtros y paginación al inicio; respuestas anteriores no reemplazan la vista de una consulta más reciente.

## Pendiente / límites de la evidencia

- Migración no aplicada: rechazo de revisión automática por mutación de base compartida y cambios de permisos. La comparación completa SAP sigue bloqueada cuando falta su RPC analítica. El KPI operativo utiliza una migración independiente aplicada y está disponible.
- No se publicó el archivo real ni se alteró recepción OLT. La publicación/falla se probó en DOM con servicios simulados; falta prueba transaccional real con fixtures y sesión autenticada.
- No se realizó prueba entre dos usuarios reales ni de carrera entre dos sesiones.
- La descarga de Chromium falló en este entorno. No se afirma inspección visual real ni flujo autenticado de navegador; el test DOM no sustituye esas pruebas.
- Verificación Vercel y commit se documentan en el informe de entrega una vez completados. READY indica build/deploy, no validación funcional autenticada completa.
