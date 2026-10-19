# Auditoría de carga de Control OLT — 19/10/2026

El aviso de indicadores correspondía a una cancelación real de PostgreSQL (`57014`): algunas consultas superaban los ocho segundos permitidos para el usuario autenticado. Una respuesta aislada de 6–7 segundos no daba margen suficiente. Las comprobaciones anteriores de HTML y compilación tampoco demostraban que las consultas completas respondieran.

## Causas comprobadas

1. El plan de cruce SAP estimaba una sola fila actual, pero recibía 6.764. En un plan real recorría unas 5.495 filas SAP por cada fila actual. La búsqueda por entrega quedaba como filtro posterior y producía millones de comparaciones.
2. Los indicadores y el resumen dependían de la construcción del JSON completo de General, aunque necesitaban pocos campos. Esa dependencia multiplicaba el trabajo al incorporar el histórico.
3. El respaldo SAP de BD podía recorrer también el importado General histórico. Se restringió a los importados de la pestaña BD antes de leer sus filas.
4. Las políticas de lectura de gestión y cierres repetían búsquedas del registro padre. Se conserva exactamente la restricción por propietario, expresada como un conjunto de IDs del usuario.
5. El exportador ordenaba/procesaba filas completas antes de acotar el lote. Un plan anidado del cursor volvía a comparar 41.718 filas por cada registro seleccionado.
6. El mensaje de interfaz no distinguía tiempo agotado, sesión vencida, permisos o conexión. Se agregó una explicación breve de estas causas sin mostrar SQL ni mensajes internos.

## Correcciones

- Cruce SAP parametrizado por usuario, carga activa y referencia mediante búsqueda lateral e índices existentes. Se conserva la misma prioridad SAP/BD y los valores en blanco.
- Vista `olt_reporting_rows_v1` con campos específicos para indicadores, filtros generales y resumen; conserva las reglas existentes de `olt_indicators` y los valores congelados de los cierres.
- Lectura de BD mediante índice de cobertura y restricción previa a importados BD. El histórico General nunca sustituye la BD operativa vigente.
- Indicador de histórico leído desde la proyección generada del cierre, con índice parcial; estadísticas y visibilidad de índices actualizadas con mantenimiento de tablas.
- KPI, resumen y opciones usan la lectura específica de reportes. La preferencia de joins para estos recorridos masivos se limita a sus funciones, sin modificar la configuración global de PostgreSQL.
- Exportación por cursor: primero selecciona IDs del lote; después construye únicamente sus filas completas. Mantiene 1.000 filas por lote y exporta todo General, sin aplicar filtros visibles.
- Se mantienen la carga secuencial de General/KPI/opciones, el descarte de respuestas obsoletas y el vaciado de datos al cerrar sesión.

## Verificación en la base real

Se ejecutaron las funciones como `authenticated`, con el usuario propietario y `statement_timeout = 8s`. Son tiempos de ejecución de PostgreSQL, sin incluir red ni renderizado. Varían según carga y filtros.

| Recorrido | Resultado observado |
| --- | --- |
| KPI sin filtros | 1,69 s |
| KPI filtrado por TECNOFARMA/Lima/año | 0,85 s |
| Resumen histórico | 0,98 s |
| Primera página General | 0,86 s |
| Página histórica General | 0,79 s |
| General filtrado por línea/año | 1,96 s |
| Opciones de filtros generales | 0,86 s |
| Opciones de columna Entrega | 2,81 s |
| Página con filtro de columna Línea | 2,36 s |
| Panel SAP | 2,67 s |
| Lote de exportación de 1.000 filas, después del ajuste | 1,08 s |

Además se recorrió la exportación completa mediante las mismas llamadas por cursor: **42 lotes, 41.718 filas, 41.718 IDs distintos**, sin errores ni retroceso del cursor. Se verificó el recorrido de datos del servidor; no se descargó manualmente el Excel desde una sesión real de navegador.

### Integridad y permisos

- Comparación de los 41.718 registros entre la lectura anterior y la nueva proyección: **cero diferencias** en ID, propietario, fechas, referencia, razón social, distrito, provincia, cierre, inclusión, zona, línea, transporte, responsable, motivo, indicador y marca histórica.
- General conserva 41.718 registros. KPI cuenta 41.628: excluye 90 registros `RECOGE CLIENTE` según la regla ya existente. Esta diferencia no significa pérdida de filas.
- La entrega `4036803721` devuelve **En Fecha**; fecha SAP y despacho: 12/10/2026.
- Un UUID autenticado ajeno obtiene KPI total cero y cero filas exportables. Se conserva RLS y las vistas usan `security_invoker`; no se incorporó `SECURITY DEFINER`.
- Asesor de seguridad: ningún aviso nuevo. Permanece el aviso previo de protección de contraseñas filtradas desactivada; no se cambió configuración de autenticación.
- Los históricos continúan congelados. Los documentos abiertos siguen calculándose con los datos actuales y la fecha de consulta, sin caché persistente de indicadores.

## Interfaz, sesión y carga SAP

- **56 pruebas automatizadas aprobadas**, incluida la continuidad de General si falla KPI, orden de cargas, mensajes de tiempo agotado, filtros, cierre de sesión, exportación total y las reglas de indicadores.
- Compilación Vite aprobada. El ingreso público abre correctamente en navegador.
- La sesión del navegador de comprobación no tenía una cuenta iniciada. No se cambió ninguna contraseña ni se solicitó una clave en el chat. Por tanto, no se afirma una prueba visual autenticada en ese navegador.
- Carga SAP revisada en código y pruebas existentes: análisis local, staging, revisión, publicación explícita, manejo de errores y cancelación. No se publicó un archivo ficticio sobre los datos de producción para probarla.
- Las mejoras son de lectura y planificación: no se reimportó, eliminó ni sobrescribió la información de negocio.

## Límites y seguimiento

No se amplió el límite global de consultas: se mantiene en ocho segundos. Los tiempos son mediciones, no una garantía permanente ante cualquier carga o filtro. Las referencias históricas genéricas pendientes de conciliación (`RECOJO`/`-`) son un asunto de integridad separado de esta corrección de carga y no se incorporaron aquí.
