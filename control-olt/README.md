# Control OLT

Segundo entorno de OLT, aislado en `control-olt/`, rama `feature/olt-control`. La aplicación de recepción en la raíz y `main` permanecen sin cambios.

## Ejecutar

Node 24. `npm ci`, `npm test`, `npm run build`. Para desarrollo: `npm run dev`.

Las dependencias están fijadas y el lockfile se versiona. Supabase JS se empaqueta desde npm y SheetJS 0.20.3 desde su distribución oficial. No hay imports CDN en tiempo de ejecución.

## General

43 columnas A:AQ, encabezados y número de fila sticky, scroll horizontal y páginas de 100 filas consultadas al servidor. Filtros de periodo, línea, transporte, Lima/Provincia y búsqueda con debounce. Solo A:B, Y:AB y AL:AM son editables por `olt_save_cell`; los meses cerrados son lectura. F:X siguen proviniendo de `recepcion_olt`.

La vista `olt_control_rows` calcula los indicadores en Supabase y conserva los cierres. El frontend descarta coincidencias recuperadas de una carga distinta a la activa y recalcula esas filas con el calendario consultado. Esto protege la hoja durante la transición; no reemplaza aplicar la corrección SQL pendiente.

## Centro SAP

Navegación General/SAP, versión activa, historial de 30 cargas, actualización por etapas y confirmación explícita. La lectura ocurre en un Web Worker. Detecta ZIP XLSX, OLE XLS y texto SAP tabulado Windows-1252/UTF-8/UTF-16LE por contenido. Soporta Entrega/Columna1 y conserva el primer Nombre 1.

Selección: Entrega, InActTrans DATE descendente, HrAITr TIME descendente, primera fila física. Rechaza fechas/horas imposibles. Los campos SAP vacíos se mantienen como información incompleta. Límite actual: 40 MB y 250.000 filas; bloquea cargas con más de 10% de filas inválidas.

Flujo: parser → `olt_sap_start` → lotes de 400 por `olt_sap_append` → `olt_sap_summary` y análisis → revisión → `olt_sap_publish`. El backend existente crea snapshot y cambia puntero en una transacción; verifica cantidad de filas y detecta una publicación concurrente. No hay service_role en frontend ni escrituras directas al snapshot.

## Activación pendiente de aprobación

`supabase/migrations/20261008170707_sap_exact_active_analytics.sql` está preparada, pero **no aplicada**: la revisión automática rechazó la mutación de la base compartida. Corrige la unión al snapshot activo exacto y la comparación contra la carga base exacta. Añade vistas/RPC de lectura para KPIs, cobertura, diferencias y observaciones.

Hasta aplicarla, la interfaz muestra un aviso y **bloquea publicar SAP si el análisis completo no está disponible**. La hoja y el historial existente siguen accesibles. No se debe presentar este preview como plataforma completamente activada.

La migración no borra tablas ni datos legacy, no modifica `recepcion_olt` ni cambia el modelo de propiedad por usuario. Sus consultas se validaron con EXPLAIN de solo lectura. Tras aprobar: aplicar, ejecutar pruebas reales con sesión autenticada y verificar publicación fallida/concurrente y el puntero anterior.

## Documentación

- `docs/AUDITORIA_ARQUITECTURA.md`: auditoría, límites y decisiones.
- `docs/REGLAS_NEGOCIO.md`: indicadores, calendario y reporting.
- `docs/VALIDACION.md`: evidencia y pruebas pendientes.
- `supabase/core-schema.sql`: inventario del esquema canónico observado; no es un instalador.
