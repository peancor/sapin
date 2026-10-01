# Piloto del radar de dudas

El radar sigue una actividad de chat normal o agéntico durante una clase. El alumnado utiliza sus conversaciones habituales. El docente lo abre desde la administración de la actividad, en **Radar de dudas**, y elige título, duración, modelo habilitado y contexto opcional.

Los recuentos representan consultas registradas, no asistencia ni comprensión. La ventana reciente abarca cinco minutos; en seguimientos cerrados termina en la hora de cierre. Las agrupaciones pueden solaparse. Un mensaje sin texto cuenta como interacción, pero no se envía al modelo.

## Instalación y funcionamiento

Aplicar la migración oficial con el procedimiento habitual del proyecto (`npm run db:migrate`) antes de arrancar la versión nueva. La migración `0021_fancy_kabuki.sql` añade cinco tablas e índices; no transforma transcripciones existentes. La cadena completa se verifica en SQLite temporal en los tests del radar.

El servidor revisa trabajo cada diez segundos, con ciclos automáticos separados al menos un minuto. El dashboard consulta cada cinco segundos mientras está visible. Cerrar el navegador no detiene la clase. El botón **Analizar ahora** adelanta trabajo pendiente; no reclasifica lo ya procesado.

El servidor atiende dos seguimientos a la vez, con llamadas secuenciales dentro de cada uno. Cada ciclo admite hasta cuatro lotes, de hasta cincuenta mensajes cada uno, y una síntesis. El tamaño efectivo depende del contexto y la salida del modelo. Las peticiones tienen un límite de dos minutos y hasta dos reintentos adicionales para fallos transitorios. El bloqueo persistente dura tres minutos y se renueva antes de cada llamada. Los procesos distintos comparten el bloqueo por seguimiento; el límite de dos llamadas es por proceso.

La selección usa el momento del mensaje, no la creación del chat. Las marcas de los chats existentes tienen precisión de segundos y el inicio/cierre manual usa esa misma resolución. El intervalo incluye el inicio y excluye el final. La matrícula se comprueba al incorporar mensajes; sus asociaciones históricas se conservan.

El cierre fija el intervalo y procesa lo pendiente. Si se agota la cuota, se deshabilita el modelo o falla el análisis, se conservan estadísticas y resultados válidos y se permite reintentar. El coste no se presenta como cero cuando faltan precios. Las observaciones truncadas siguen visibles en la cobertura parcial. No hay ejecución exactamente una vez de llamadas externas: un reinicio tras la petición puede repetir consumo, aunque no duplique observaciones.

Los borrados de intentos invalidan resúmenes y clasificaciones que pudieron usar el contexto eliminado. Se recalculan a partir de las fuentes restantes. No se conservan copias completas de mensajes en el radar.

## Demostración aislada

El generador siguiente crea una **base nueva** y rechaza sobrescribir una existente. Contiene cuentas ficticias, preguntas etiquetadas y análisis simulado; no llama a proveedores ni valida la calidad de un modelo real.

```powershell
node --import ./scripts/node-test-register.mjs scripts/radar-pilot.ts .tmp/radar-demo.db
$env:DATABASE_URL='D:/source/sapin/.tmp/radar-demo.db'
$env:NODE_ENV='test'
$env:ORIGIN='http://127.0.0.1:5174'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Usar las variables locales de desarrollo habituales para el resto de configuración. `NODE_ENV=test` desactiva el planificador del radar en esta demostración. Iniciar sesión con `teacher@example.invalid` y contraseña ficticia `Radar-pilot-2026!`; abrir la ruta que imprime el generador. Estas credenciales solo pertenecen a la base de demostración.

No ejecutar simultáneamente el servidor de desarrollo y el build en el mismo checkout: ambos regeneran recursos de Paraglide. Para comprobar producción, compilar primero y arrancar después con la BD ficticia y la configuración local necesaria.

## Revisión pedagógica con el modelo elegido

Los casos de `src/lib/server/radar/pilotCases.ts` ofrecen preguntas ordenadas por minuto y etiquetas esperadas. Sirven para revisar lo siguiente con un docente:

| Caso                                                         | Comportamiento esperado                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Significado de la derivada y paráfrasis sobre pendiente      | Agrupación consistente, sin inferir error por preguntar               |
| Solicitud de una curva de ejemplo                            | Intención de ejemplo, sin confusión automática                        |
| Derivar una potencia omitiendo el factor                     | Posible confusión concreta con referencia al mensaje                  |
| Notación prima y cociente diferencial                        | Duda de notación distinguible del procedimiento                       |
| «No entiendo ese paso» sin referente suficiente              | Contexto insuficiente, sin completar por imaginación                  |
| «Gracias»                                                    | Cierre social, sin tema forzado                                       |
| Mensaje que intenta cambiar las instrucciones del analizador | No altera las reglas ni produce afirmaciones sobre comprensión global |
| Texto con HTML y fórmulas                                    | HTML literal y fórmulas legibles, sin ejecutar código                 |

Para evaluar un proveedor real, usar un curso de prueba con estudiantes matriculados y una actividad, iniciar un seguimiento con ese modelo y reproducir las preguntas por orden temporal en sus chats. Revisar agrupaciones, evidencias y aclaraciones al minuto y al cierre. Registrar modelo, fecha, cobertura, demora, tokens y coste disponible. Comparar las etiquetas esperadas con los resultados; no considerar suficiente que el JSON sea válido.

La aceptación del piloto requiere que el docente confirme que las agrupaciones importantes son fieles a los mensajes y ayudan a decidir una aclaración oral. Esta validación y una clase real quedan pendientes hasta seleccionar el modelo y realizar la revisión docente.

## Verificación técnica

`npm test` incluye los casos del radar: ambos chats, intervalos y timestamps iguales, contexto previo, matrícula y exclusión de docentes, mensajes internos y sin texto, unicidad, temas estables, bloqueo y recuperación, cierres sin navegador, cuotas, timeout, fallos de síntesis, truncamiento, borrado y agregaciones temporales.

`load.test.ts` simula cien estudiantes, dos mil mensajes en noventa minutos, una ráfaga de cien y cincuenta consultas equivalentes a cinco dashboards. En la comprobación local inicial, incorporar las observaciones tomó aproximadamente 189 ms y el p95 de consulta fue 11 ms, con SQLite en memoria. El procesamiento con cliente simulado terminó sin duplicados. Estas medidas no incluyen HTTP, red ni latencia o coste de IA y no sustituyen la prueba en el entorno del piloto.

Antes de desplegar, repetir `npm test`, `npm run check`, `npm run lint` y `npm run build`. La base inicial del repositorio presenta problemas de formato generalizados y advertencias Svelte anteriores al radar; revisar por separado cualquier diagnóstico de los archivos modificados. Comprobar también tema claro/oscuro, teclado, apertura de chats, desconexión/reconexión y seguimiento desde dos profesores.
