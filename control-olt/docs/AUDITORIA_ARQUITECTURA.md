# Auditoría Control OLT — 8 octubre 2026

## Estado y separación

GitHub: `luigigicam-bot/OLT`, rama `feature/olt-control`, módulo `control-olt/`. Vercel: proyecto independiente `controlt`; original `olt_programacion` sin cambios. Supabase OLT: `vuoqmesrwgkkdqrecxnc`, PostgreSQL 17.11, ACTIVE_HEALTHY.

El frontend anterior usaba tablas públicas legacy y publicación en varios pasos desde el navegador. El backend observado ya contiene un modelo canónico en `olt_control`, RLS y RPC transaccionales. Esta entrega conecta ambos; no creó esos RPC existentes.

## Fuentes de verdad

| Datos | Fuente |
|---|---|
| Programación F:X | public.recepcion_olt |
| Gestión A:B / Y:AB / AL:AM | olt_control.gestion_olt |
| Archivo, conteos y estados | olt_control.sap_cargas |
| Filas físicas temporales | olt_control.sap_staging |
| Versiones consolidadas | olt_control.sap_snapshot |
| Puntero explícito | olt_control.sap_estado_usuario.carga_activa_id |
| Histórico operativo congelado | olt_control.cierre_mensual |
| Calendario activo | public.calendario_feriados |
| Reportería excluyendo RECOGE CLIENTE | public.olt_reporting |

Las tablas antiguas public.sap_actual, sap_historial y demás legacy no se borran. El frontend nuevo deja de escribirlas.

## Integridad y seguridad observadas

- RLS activo en las seis tablas canónicas y calendario. Ownership por auth.uid(); cada usuario conserva datos propios. No se migra a equipos sin decisión de negocio.
- Vistas públicas de control con security_invoker=true.
- authenticated no tiene INSERT directo a snapshot ni UPDATE directo al puntero. anon no puede ejecutar olt_sap_publish.
- RPC públicos invoker delegan escrituras a funciones privadas existentes SECURITY DEFINER. Su uso está justificado por la inmutabilidad de snapshots y la prohibición de DML directo; validan autenticación, propiedad y estado, con search_path fijo. No se añadió SECURITY DEFINER para resolver RLS.
- Publicación existente usa bloqueo por usuario, verifica base_carga_id y número de filas, crea el snapshot completo y cambia el puntero dentro de la misma transacción.
- La UI espera confirmación después de staging/análisis y consulta el estado si hay una respuesta de red ambigua tras publicar.
- Datos Excel escapados antes de renderizar HTML. Columna editable restringida también por RPC. Sin claves secretas; la clave incluida es publishable.
- Advisor de seguridad: aviso de protección contra contraseñas filtradas desactivada. No se cambió Auth. Ver [recomendación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Advisor de rendimiento: 33 índices sin uso observado en este proyecto reciente. Se conservan; no es evidencia suficiente para eliminarlos.

## Corrección SQL pendiente

Las vistas actuales recuperan una referencia del último snapshot que la contenga, hasta el puntero activo. Esto mezcla fotografías completas y puede mantener referencias desaparecidas. La migración preparada cambia a igualdad con carga_activa_id y hace lo mismo al comparar contra base_carga_id.

Además agrega análisis server-side con RLS: KPIs, cobertura por zona/línea/transporte/área, nuevas/modificadas/desaparecidas, cambios DT/placa/ET/estados, fechas futuras, incompletos, múltiples DT y empates. El detalle está limitado a 100 cambios y 100 pendientes por consulta. El resumen narrativo es determinístico.

**No aplicada:** revisión automática rechazó el cambio remoto de vistas, funciones y grants/revokes por exigir aprobación del cambio concreto a la base compartida. No se intentó otra vía. El preview identifica la dependencia y bloquea publicar si falta el análisis.

## Rendimiento y crecimiento

General consulta 101 filas y monta máximo 100; filtros de servidor, orden fecha/id y debounce. SAP se analiza en un worker; staging usa lotes de 400. No se descarga el snapshot anterior completo para comparar: la migración calcula diferencias en SQL.

Límite backend existente: 250.000 filas por carga. 500k+ requiere un pipeline de ingesta con almacenamiento de archivo, procesamiento en backend, streaming y pruebas de carga; no está implementado. Las agregaciones server-side evitan un DOM masivo, pero necesitan mediciones reales antes de prometer escala. Evaluar índice compuesto carga_id/referencia/inacttrans/hraitr/fila_origen y búsqueda trigram según EXPLAIN y volumen; no añadir índices indiscriminadamente.

## Riesgos y próximos pasos

1. Aprobar y aplicar la migración preparada; verificar indicadores/diferencias con datos reales y roles cruzados.
2. Ejecutar una carga autenticada completa y una falla transaccional controlada; no se usaron credenciales del usuario ni se publicó el archivo real durante esta entrega.
3. Definir calendario completo y versionamiento de reglas: los cierres congelados no cambian, los meses abiertos consultan el calendario vigente.
4. Acordar si futuros operadores compartirán datos; por ahora siguen aislados por usuario.
5. Añadir auditoría de cambios de gestión y retención de staging; el backend existente no constituye un registro completo de cambios por celda.
6. Activar protección de contraseñas filtradas si el plan lo permite y medir cargas reales antes de retirar el modelo legacy.
