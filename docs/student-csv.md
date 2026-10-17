# Importación y exportación de estudiantes

Las dos pantallas de estudiantes exportan el mismo formato, con una fila por persona:

```csv
externalId;email;fullname;firstname
prueba-001;ana@example.invalid;Pérez, Ana;Ana
prueba-002;luis@example.invalid;García, Luis;Luis
```

El archivo usa punto y coma, UTF-8 con BOM y valores escapados con comillas cuando
contienen punto y coma, comillas o saltos de línea. Puede volver a importarse en Sapin.
El diálogo de importación incluye una plantilla descargable con datos ficticios.

- `externalId` es el identificador externo usado en los enlaces de acceso. No es el
  identificador interno del usuario, que no se exporta en este formato.
- `email` identifica el correo del estudiante.
- `fullname` corresponde al nombre completo mostrado en Sapin.
- `firstname` es opcional y corresponde al alias guardado. No se deducen apellidos
  a partir del nombre completo; Sapin no los guarda en un campo separado.

El importador admite también separador coma y codificación Windows-1252. Se conserva
la compatibilidad con `id,email,firstname,lastname,fullname` de Moodle: `id` se interpreta
como `externalId` y `lastname` no se almacena. No se admiten `id` y `externalId` juntos.
Las exportaciones antiguas con cabeceras `ID,Username,Email` no son este formato.

Para crear un usuario son obligatorios externalId, email y fullname. Para reinscribir
uno existente, el identificador externo y el correo deben corresponder al mismo
usuario. Si externalId está vacío, se busca por correo; si no existe, la fila se rechaza.
La importación no actualiza nombres, correos ni identificadores existentes y no vincula
un identificador nuevo a una cuenta ya registrada. Los conflictos se muestran por fila.
Los errores de estructura del archivo se rechazan antes de importar ninguna fila;
las filas válidas pueden importarse aunque otras tengan errores de datos.

Para crear estudiantes ficticios, utiliza correos e identificadores nuevos, como los
de la plantilla. Reimportar sin cambiarlos reinscribe las mismas cuentas, no las duplica.
Consulta [enlaces Moodle](moodle-activity-links.md) para usar externalId en las actividades.
