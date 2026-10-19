# Selección uniforme de registros SAP

La misma prioridad se aplica al preparar una carga, comparar y publicar sus entregas, consolidar DT, resumir estados y transportes y descargar su detalle:

1. InActTrans más reciente; una fecha real precede a un valor vacío.
2. Para la misma fecha, HrAITr más reciente; una hora real precede a un valor vacío.
3. En empate exacto, primera fila física del archivo.

El estado numérico no decide qué fila gana. Un estado 7 no reemplaza por sí solo a otro registro con fecha posterior. Se mantienen las advertencias existentes sobre fechas futuras, entregas con varios DT y campos incompletos.

## Unidad y alcance

- General y el snapshot SAP seleccionan por **entrega**, como antes. El parser, resumen, análisis y publicador ya aplicaban esta prioridad.
- Resumen SAP, estados 1/6/7, reporte DT y detalle de estado 1 seleccionan por **DT** dentro de la carga elegida, mediante `olt_control.sap_latest_dt_v1`. Se sustituyó la selección incondicional de la primera fila elegible.
- El análisis local de archivo usa el mismo comparador JavaScript `isNewerSap` que el lector por entrega.
- Elegir por entrega y elegir por DT son agrupaciones diferentes; la prioridad es idéntica, pero no implican el mismo número de registros. No se eliminan DT del archivo porque una entrega también aparezca en otro DT.
- Las exclusiones de factura/devolución y referencias 500 se aplican antes de seleccionar el representante de cada DT, como antes.

## Campos y fechas

Estado, transportista, placa, InActTrans y HrAITr proceden de la misma fila elegida. La fecha alternativa del reporte auxiliar solo puede proceder de las columnas auxiliares de esa fila; ya no se toma una alternativa de otra fila o de una fila excluida.

El resumen mensual sigue usando **Fec. Despacho**, tomada de la fila elegida. Si falta, se muestra **Sin fecha**, sin completarla con InActTrans ni con la alternativa. La selección por recencia no cambia el significado de cada fecha.

Los cierres históricos de General conservan sus snapshots. No se cambia la carga activa, no se publica una carga pendiente ni se reescriben documentos para aplicar esta regla de lectura de reportes.

## Verificación

- 59 pruebas JavaScript aprobadas y compilación Vite correcta.
- Pruebas de filas desordenadas, prioridad de fecha sobre hora, hora sobre primera fila, empate exacto, campos vacíos y exclusiones. Se comprueba que los campos y la alternativa correspondan al registro elegido.
- `tests/sap-selection-regression.sql` clona en tablas temporales la definición de selección instalada y comprueba cuatro ganadores, incluyendo aislamiento entre cargas. La transacción revierte todos sus objetos temporales; no escribe datos operativos.
- En la carga publicada existente, ambos reportes devuelven **1.902 DT** y la misma firma de DT, estado, transportista, salida, hora y fila de origen. En ese archivo la primera fila ya coincidía con la más reciente: no cambiaron sus representantes.
- La lectura optimizada de DT de General se comparó para **41.718 registros**, con cero diferencias respecto de la fuente oficial. Se usa exclusivamente para comparar presencia de DT sin construir el JSON completo de General.
- Un usuario autenticado ajeno recibe cero filas en ambos reportes. Se conservan RLS, vistas `security_invoker` y permisos restringidos; no se agrega ningún `SECURITY DEFINER`.
