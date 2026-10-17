<script lang="ts">
	import { buildStudentCsvTemplate } from '$lib/utils/studentCsv';
</script>

<div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">
	<p>Columnas: <strong>externalId, email, fullname, firstname</strong>. firstname es opcional.</p>
	<p>
		externalId es el identificador externo utilizado en los enlaces de acceso, no el ID interno de
		Sapin. Para crear estudiantes nuevos, completa externalId, email y fullname.
	</p>
	<p>
		Los usuarios existentes sin externalId se reconocen por su email. La importación inscribe en el
		curso, sin modificar nombres, correos ni identificadores existentes.
	</p>
	<p>
		Se admiten coma o punto y coma, UTF-8 o Windows-1252, y el formato antiguo de Moodle con id,
		email, firstname, lastname, fullname.
	</p>
	<a
		class="text-primary-700 dark:text-primary-400 font-medium underline"
		href={`data:text/csv;charset=utf-8,${encodeURIComponent(buildStudentCsvTemplate())}`}
		download="plantilla-estudiantes.csv">Descargar plantilla de ejemplo</a
	>
	<p class="text-xs">
		La plantilla contiene estudiantes ficticios. Usa identificadores y correos nuevos para crear tus
		propios estudiantes de prueba.
	</p>
</div>
