# Histórico de General y resumen mensual

## Fuente y prioridad

Se incorporó General de `KPI OLT 061026.xlsx`, SHA-256 `817778261f40be5dd6160297705e9777e34ac25390221cb643be9af9184268fb`.

- Filas de origen con entrega: 39.717.
- Omitidas por coincidir con una entrega de General actual: 4.722. Los datos actuales tienen prioridad, incluso si el archivo antiguo contiene otros valores.
- Repeticiones idénticas del histórico omitidas: 41.
- Nuevos registros históricos: 34.954, de enero a agosto de 2026.
- Registros actuales preservados: 6.764.
- Total en General: 41.718.
- Las 34.954 filas tienen 19 campos de negocio distintos entre sí. Se conservaron varias filas de una misma entrega cuando los datos de negocio eran diferentes.
- Los 25 valores no numéricos encontrados en Bultos, Volumen o Peso se conservaron en `bd_import_rows.raw_data.source_anomalies`; el valor tipado quedó NULL.

La importación 3, pestaña General, conserva todas las filas nuevas de origen en `bd_import_rows`. Las importaciones General no sustituyen la instantánea BD que define el alcance operativo actual.

## Conservación de resultados

Los registros históricos usan `cierre_mensual.snapshot`, con `historico_consolidado: true` y referencia a importación, archivo y fila original. Se conservan cargo, vencimiento, indicador, estado de cargo, DT, ET, fechas SAP, responsables y motivos. Los campos derivados que no estaban presentes en General no se inventaron.

Los históricos no se recalculan con la fecha actual ni se sustituyen por SAP activo. Se muestran como cerrados, sin edición operativa de celdas. El histórico contiene exactamente 33.091 indicadores En Fecha y 1.863 Fuera de Fecha, iguales a los valores del archivo después de las exclusiones y deduplicación.

La activación se hizo en una transacción con comprobaciones que abortan si una fila actual cambia, si hay una coincidencia nueva con datos actuales o si algún indicador, cargo, DT o motivo histórico difiere del origen. Las comprobaciones pasaron antes del COMMIT.

## Resumen en KPI

KPI tiene las pestañas Indicadores y Resumen histórico. La segunda agrupa por año y mes de Fec. Despacho, con cantidades y cumplimiento Lima/Provincia, acumulado, promedio mensual e incidencias por responsable y motivo. Usa los filtros compartidos. Las discrepancias de los cuadros Excel se resuelven desde General conciliado, no copiando totales estáticos.

El cumplimiento acumulado usa suma En Fecha / suma documentos. Promedio mensual es la media simple de los porcentajes de meses con documentos. Los meses vacíos no se presentan como 0 %. La meta 96 % se limita a TECNOFARMA, la línea para la que está definida en Resumen. Sin zona se incluye en el total y se informa expresamente.

## Lectura y validación

Los objetos conservan SECURITY INVOKER y RLS. El archivo congelado evita cruces SAP y cálculos actuales. Los cálculos de indicador de filas actuales se comparten por sus seis entradas exactas: fecha, salida SAP, fecha de cargo, línea, departamento y despacho. La función de negocio no cambió.

Se agregaron índices para el alcance de importación y cierres históricos/actuales. Se comprobó el acceso authenticated bajo el límite de 8 segundos: General 4,4 s, KPI 5,2 s y resumen 4,3 s en las mediciones de verificación. Los tiempos dependen de carga y caché del servidor.

La descarga de General consulta lotes de hasta 1.000 filas por cursor ID descendente y genera un solo Excel con las 43 columnas, ignorando filtros y página visible. Cada lote respeta el límite de consulta; el progreso muestra los registros recopilados. Un lote de registros actuales se verificó en 5,9 segundos bajo el límite de 8 segundos. El cursor evita repetir filas e incorporar altas posteriores al inicio de la descarga. La exportación completa puede demorar varios minutos por su volumen.

Validaciones: 55 pruebas frontend; compilación Vite; comprobación de cantidades, valores congelados, filtros y prioridad de los registros actuales. El resumen se probó con el rol authenticated del propietario. Un usuario ajeno obtuvo cero registros en General, resumen y exportación. Las pruebas de interfaz verifican la concatenación de todos los lotes en un único Excel.
