# Filtros de encabezados — General

Se añade un botón de filtro en las 43 columnas de datos A:AQ. Fila permanece como número de posición. El menú permite buscar valores, seleccionar varios, incluir Vacíos, aplicar y quitar el filtro. Las selecciones se combinan con OR dentro de una columna y AND entre columnas, sobre todos los registros antes de paginar. La búsqueda del menú encuentra opciones y, si se empieza con Todos, preselecciona los resultados. Al seleccionar manualmente casillas se conservan esas selecciones al buscar otros valores. No reemplaza la búsqueda global de documentos.

Los filtros generales existentes se conservan y se intersectan con las selecciones de columnas. Los nuevos filtros afectan únicamente a la tabla de General: KPI mantiene su población y controles actuales. Los chips de columnas muestran el total de documentos de la tabla y permiten quitar una columna o limpiar todas. Limpiar filtros global elimina también las selecciones de columnas. Un nuevo detalle KPI elimina las selecciones de columnas para conservar la población exacta del drilldown. Al cerrar sesión se eliminan selecciones y opciones cargadas.

Los encabezados descriptivos, las 43 columnas, edición, paginación, descarga completa y fórmulas permanecen disponibles. Descargar todo en Excel conserva su alcance completo e independiente de los filtros.

## Implementación y permisos

- `js/column-filters.js`: menú, selección de valores, búsqueda de opciones, chips, foco y estado de carga.
- `js/app.js`: integración de encabezados y selección del RPC de página cuando existen filtros de columnas; sin selecciones utiliza el RPC anterior.
- `index.html` y `css/product.css`: portal del menú, botones y estilos responsive.
- `supabase/migrations/20261012200819_general_column_filters.sql`: cuatro funciones nuevas, de validación y lectura. Esta versión corresponde a la migración aplicada y registrada por Supabase.

Los RPC nuevos se apoyan en `olt_metric_filtered_v1`, por lo que no duplican ni modifican reglas de negocio, homologación, calendario o cálculo de indicadores. El paginado conserva el orden fecha/id y la versión de gestión usada para edición concurrente. Los nombres de columnas permitidos se validan contra A:AQ; valores nulos o ausentes se presentan como Vacíos. No hay SQL dinámico.

Todas las funciones nuevas son SECURITY INVOKER, con `search_path=pg_catalog`, ejecución revocada a PUBLIC/anon y concedida a authenticated. Se conserva RLS y se usa el mismo acceso a la versión de gestión que el RPC existente. No se modificaron tablas, políticas, datos, funciones existentes ni fórmulas. La migración está aplicada.

## Validación

- 52 pruebas frontend aprobadas y build Vite correcto.
- Pruebas PostgreSQL locales: paginado completo, OR/AND, vacíos, identificadores exactos, selección vacía, filtros generales, opciones sin restringir su propia columna, versiones de edición, entradas inválidas, aislamiento por propietario y denegación a anon.
- Comprobación en Supabase bajo el rol authenticated y en transacciones de solo lectura revertidas: octubre 2026 conserva 1,316 documentos; la página sin restricciones adicionales coincide exactamente con el RPC anterior, incluyendo versiones de edición; una entrega tomada más allá de la fila 100 devuelve un resultado; cero valores seleccionados devuelve cero filas; las opciones de Línea incluyen las diez líneas actuales.
- Un identificador de otro usuario sin datos devuelve cero registros y cero opciones. Se verificaron los grants y SECURITY INVOKER de las cuatro funciones.
- Navegador Chromium, sesión simulada: búsqueda y selección de entrega fuera de la primera página, Vacíos, limpieza y menú en 360/768/1280/1440 px. Sin desbordamiento horizontal de página; menús dentro del viewport; cero infracciones WCAG A/AA automatizadas en los cuatro menús revisados.
- Las pruebas de escritura, parser, indicadores, exportación y SAP existentes siguen aprobadas. Los módulos de fórmulas, KPI, parser y exportación no cambiaron.

La consulta real medida para ELEA/BIOPAS en octubre tardó aproximadamente 2.4 segundos. El frontend muestra estados de consulta y carga; los valores se leen completos, pero el menú presenta bloques de 200 opciones para evitar miles de controles simultáneos. El motor de indicadores y las funciones existentes no se reescribieron como parte de esta mejora.

La verificación interactiva utilizó una sesión simulada; el backend y los permisos se verificaron directamente por SQL. El preview y su commit se confirman en Vercel tras publicar la rama, sin merge a main.
