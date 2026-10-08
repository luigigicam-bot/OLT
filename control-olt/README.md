# OLT Control

Segundo módulo del sistema OLT, separado del proyecto actual de recepción.

## Objetivo
Construir una vista operativa tipo hoja de cálculo que consolide:

- A:B — gestión manual de cargo.
- C:E — indicadores calculados.
- F:X — programación OLT desde Supabase `recepcion_olt`.
- Y:AB — programación de transporte.
- AC:AK — información SAP usando la referencia más reciente según `InActTrans`.
- AL:AM — responsable y motivo.
- AN:AQ — indicadores derivados y cierre mensual.

## Reglas base
1. El proyecto actual en la raíz del repositorio no se modifica.
2. Este módulo vive dentro de `/control-olt`.
3. F:X será lectura automática desde Supabase.
4. SAP se cargará manualmente mediante botón, se validará antes de publicar y se seleccionará por Referencia + `InActTrans` más reciente.
5. Si una carga SAP falla, se conserva la última versión válida.
6. Los meses cerrados se congelan como foto operativa y no cambian con cargas SAP posteriores.
