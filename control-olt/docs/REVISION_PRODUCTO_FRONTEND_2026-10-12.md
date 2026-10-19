# Revisión de producto del frontend — 12/10/2026

## Alcance y diagnóstico inicial

Repositorio `luigigicam-bot/OLT`, rama `feature/olt-control`, aplicación `control-olt/`, proyecto Vercel `controlt`. Base auditada: `afd554aa2767fa79c4239e86760f900693c96bc4`. Se creó un checkpoint local antes de editar y un checkpoint equivalente en GitHub: `7c63ff71e8bc94623be53b708fc4897eb96fbc9d`.

La base ya contenía calendario por rango, AÑO/MES OLT, homologación de incidencias, análisis por Línea, informes SAP, exportación completa y tokens de diseño. Se conservaron esas implementaciones. El frontend tenía una capa visual acumulada, cabecera y resúmenes grandes, filtros activos como texto corrido y KPIs con jerarquía insuficiente. La política CSP impedía cargar la fuente Inter ya declarada en el HTML.

La comprobación real de dos clics detectó además un fallo previo: al regenerarse los botones del calendario, el botón pulsado quedaba separado del DOM; el detector de clic externo cerraba el calendario después del primer clic. El adaptador de presentación ahora mantiene ese clic dentro del calendario, sin cambiar sus fechas ni su aplicación.

## Mejoras

- Tokens centrales para color, tipografía, espaciado, radios, controles y movimiento. Preparación de tokens de tema oscuro sin activar un nuevo modo.
- Cabecera empresarial compacta con entorno, SAP y usuario; navegación sticky con indicador inferior de sección activa.
- Barra de herramientas coherente: búsqueda dominante, filtros como acción principal y acciones secundarias discretas.
- Chips que representan filtros activos y búsqueda. Limpiar todos invoca el botón de limpieza existente. Los chips son indicadores; no se presenta un cierre individual que no exista.
- General: resumen compacto, identificación de grupos de columnas, zebra suave, hover, foco de celda, nombres accesibles de edición y alineación numérica. Mantiene las 43 columnas A:AQ y un encabezado descriptivo.
- General en escritorio congela Fila, Nro. Cargo y Fec.Cargo. Se conservó el orden de las columnas: Fec.Despacho y Entrega no se movieron para intentar congelar columnas no consecutivas. En móvil se conserva Fila y se libera el resto para que quede espacio para los datos.
- KPI: cuatro métricas uniformes — Documentos, En Fecha, Fuera de Fecha y Efectividad — usando el total y la función de porcentaje existentes. Comparación Lima/Provincia, líneas con affordance de detalle, tablas numéricas legibles y barras más finas.
- Línea seleccionada: contexto encima de incidencias/transportistas con métricas del conjunto devuelto por el backend. Volver a todas las líneas despacha el evento original del selector Línea y conserva los demás filtros.
- SAP: versión activa destacada, resumen principal a todo el ancho y programados/comparación en un segundo nivel. Análisis adicionales e historial siguen disponibles y plegables.
- Estados vacíos, carga, errores, botones, login y modales con un lenguaje visual común.
- Semántica accesible del calendario como grupo de botones, etiquetas completas de fechas, nombres de edición, foco visible y reducción de movimiento.
- CSP ajustada únicamente para permitir la hoja de Google Fonts y su servidor de fuentes ya utilizados.

## Archivos

| Archivo | Cambio |
| --- | --- |
| `control-olt/css/app.css` | Retirada de la capa empresarial anterior, conservando los estilos base y las clases funcionales |
| `control-olt/css/product.css` | Tokens y nueva presentación de General, KPI, SAP, filtros, estados y responsive |
| `control-olt/index.html` | Wrappers y elementos visuales; metadatos regionales y accesibilidad |
| `control-olt/js/kpi.js` | Plantillas de presentación del resumen y contexto de Línea |
| `control-olt/js/presentation.js` | Adaptadores visuales que reutilizan eventos existentes |
| `control-olt/tests/ui.test.js` | Regresión de chips, Línea, login/logout y calendario de dos clics |
| `control-olt/vercel.json` | Permisos de fuente limitados a los hosts utilizados |
| Este informe | Evidencia, alcance y límites |

## Conservación de lógica

La comparación de Git contra la base confirma que `app.js`, `indicators.js`, parsers, dashboard SAP, exportadores, workers y toda la carpeta `supabase/` permanecen idénticos. En `kpi.js` se cambiaron exclusivamente plantillas HTML; porcentaje, ordenación, agrupación, valores y contratos de drilldown permanecen iguales. Se conservaron todos los IDs existentes.

No se cambiaron SQL, autenticación, RLS, deduplicación, publicación SAP, reglas de calendario, fórmulas, homologación ni la exclusión de RECOGE CLIENTE de KPI. No se escribieron datos operativos ni se ejecutaron migraciones.

## Validación

- Base: 40 pruebas existentes aprobadas y build correcto antes de editar.
- Resultado: **44/44 pruebas aprobadas**, build Vite correcto y `git diff --check` limpio.
- Las pruebas cubren login/logout simulados, General/SAP/KPI, búsquedas/filtros, año/mes, fechas inclusivas, limpieza, paginación, historial, edición por RPC, navegación, Línea y sus paneles, parsers, Excel y flujo SAP de staging/revisión/publicación/cancelación simulados.
- Navegador Chromium con sesión y llamadas de prueba: navegación, filtros, rango con dos clics, limpieza, regreso desde Línea, login/logout, geometría, scroll y congelación de columnas. Sin errores JavaScript en el recorrido verificado.
- Revisión visual de capturas General, KPI, SAP, filtros y login.
- Axe, reglas WCAG 2 A/AA y 2.1 AA: **0 infracciones detectadas** en General, KPI y SAP a 1440 px, y filtros con calendario abierto y login a 360 px. Es una auditoría automatizada de esas pantallas, no una certificación completa de accesibilidad.

| Ancho | General/KPI/SAP | KPI | Scroll horizontal de página |
| --- | --- | --- | --- |
| 360 px | Revisados | Una columna; paneles apilados; filtros a pantalla completa | Ninguno |
| 768 px | Revisados | Dos columnas como máximo; análisis apilable | Ninguno |
| 1280 px | Revisados | Cuatro métricas; uso del ancho operativo | Ninguno |
| 1440 px | Revisados | Cuatro métricas; analítica y SAP distribuidos por jerarquía | Ninguno |

Las filas de General midieron **34 px**. La posición horizontal de Nro. Cargo permaneció en **73 px** antes y después de desplazar la tabla 700 px horizontalmente.

## Datos reales de octubre

Consulta de solo lectura en Supabase, 12/10/2026 a las 14:09 de Lima, usando la vista existente y el RPC `olt_metric_kpi_v1` con año 2026 y mes 10:

| Documentos | En Fecha | Fuera de Fecha | Incidencias | Efectividad |
| --- | --- | --- | --- | --- |
| 1,316 | 1,316 | 0 | 0 | 100% |

Lima: 1,097 documentos. Provincia: 219. No se alteraron datos o cálculos para obtener el resultado. Las verificaciones de geometría usaron una sesión simulada; el conjunto agregado de octubre se reprodujo en ese entorno para revisar su representación. Las filas de General y la carga SAP de las capturas son datos de prueba.

## Límites y siguiente etapa

La sesión autenticada real de un usuario y una publicación real de SAP no se ejecutaron: la regresión de esas acciones se hizo con simulaciones y el backend se verificó mediante lectura. Esto evita modificar la operación durante una revisión visual y delimita la evidencia de validación.

Inter conserva el respaldo de fuentes del sistema si Google Fonts no está disponible. No se añadieron dependencias de producción ni frameworks de UI. El bundle final local de JavaScript es aproximadamente 184.7 kB (53.5 kB gzip) y CSS 48.1 kB (9.5 kB gzip); los workers Excel/SAP no cambiaron.

Siguiente etapa recomendada: recorrido de aceptación con una sesión operativa real y un archivo SAP de prueba autorizado; pruebas manuales con lector de pantalla; evaluar densidad analítica configurable y modo oscuro como mejoras independientes.

## Publicación

Los commits de esta revisión se publican exclusivamente en `feature/olt-control`, sin merge a `main`. El SHA final, URL exacta y estado del preview se entregan después de comprobarlos directamente en Vercel; no se fija aquí una URL provisional.
