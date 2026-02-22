<div align="center">

# 🌲 Sapin

**Sistema de Aprendizaje e Innovación Interactiva**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-FF3E00?style=flat&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat&logo=sqlite&logoColor=white)](https://www.sqlite.org/)

<img src="static/images/sapin-magic_128.webp" alt="Sapin Logo" width="128" style="margin-top: 20px; border-radius: 20px;" />

<p style="margin-top: 20px;">
  <em>Plataforma de innovación docente diseñada para enriquecer la experiencia educativa mediante el uso de Inteligencia Artificial Generativa. Permite a los educadores crear cursos interactivos donde los estudiantes pueden interactuar con "roles" de IA (tutores, expertos, pacientes simulados, etc.) para practicar habilidades, recibir feedback inmediato y profundizar en su aprendizaje.</em>
</p>

</div>

---

## 🚀 Características Principales

*   **🤖 Integración Profunda de IA**: Utiliza modelos de lenguaje (LLMs) mediante Vercel AI SDK para dar vida a personajes y tutores virtuales usando OpenAI u OpenRouter.
*   **📚 Gestión de Cursos y Roles**: Profesores pueden diseñar cursos y definir roles específicos con instrucciones personalizadas ("system prompts").
*   **💬 Chats Interactivos**: Interfaz de chat moderna orientada al aprendizaje para la interacción estudiante-IA.
*   **📊 Análisis e Insights**: Herramientas para que los docentes analicen las interacciones y el progreso de los estudiantes.
*   **🌍 Multidioma**: Soporte nativo para Español e Inglés (utilizando inlang Paraglide JS).
*   **👥 Gestión de Usuarios**: Roles diferenciados y seguros para Administradores, Profesores y Estudiantes.
*   **🔐 Seguridad y Privacidad**: Autenticación robusta (Lucia Auth, Argon2) y manejo seguro de datos locales o autohospedados.

---

## 🛠️ Stack Tecnológico

El proyecto está construido sobre tecnologías modernas y eficientes enfocadas en rendimiento y experiencia de usuario:

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend/Framework** | [SvelteKit](https://kit.svelte.dev/) (Fullstack), TypeScript |
| **Estilos y UI** | [Tailwind CSS v4](https://tailwindcss.com/), [Flowbite Svelte](https://flowbite-svelte.com/) |
| **BBDD y ORM** | SQLite (`better-sqlite3`), [Drizzle ORM](https://orm.drizzle.team/) |
| **Inteligencia Artificial** | [Vercel AI SDK](https://sdk.vercel.ai/), OpenAI API / OpenRouter, Qdrant (Vector DB) |
| **Autenticación** | Lucia Auth (custom con `@node-rs/argon2`) |
| **Internacionalización** | [Inlang Paraglide JS](https://inlang.com/) |

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu entorno:
*   **Node.js**: Versión `22.14.0` o superior.
*   **Gestor de Paquetes**: `npm`, `pnpm` o `yarn`.
*   **Docker** (Opcional, pero recomendado para despliegues y servicios auxiliares como Qdrant).

---

## ⚡ Comencemos (Desarrollo Local)

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd sapin
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo `.env.example` a `.env` e introduce tus credenciales:

```bash
cp .env.example .env     # Linux / macOS
copy .env.example .env   # Windows
```

> **Aviso:** Como mínimo deberás configurar `DATABASE_URL` (por defecto `local.db`) y las API keys necesarias para los proveedores de IA (OpenAI, OpenRouter, etc.).

### 4. Configurar la Base de Datos

Ejecuta las migraciones de Drizzle para crear e inicializar la base de datos SQLite:

```bash
npm run db:push
```

### 5. Iniciar el servidor

Arranca el servidor de desarrollo con Hot Module Replacement (HMR):

```bash
npm run dev
```

La plataforma estará disponible por defecto en `http://localhost:5173`.

---

## 🐳 Despliegue con Docker

Sapin incluye una configuración robusta de Docker orientada tanto a entornos locales como productivos.

### 🚀 Instalación Rápida

La forma más sencilla de instalar y probar Sapin en tu propio servidor es usar nuestra imagen oficial precompilada en Docker Hub junto con Docker Compose.

1.  **Crea una carpeta nueva** en tu máquina (por ejemplo, `sapin`) y entra en ella.
2.  **Descarga el archivo Compose de producción** y guárdalo como `docker-compose.yml`:
    ```bash
    curl -o docker-compose.yml https://raw.githubusercontent.com/peancor/sapin/main/docker-compose.prod.yml
    ```
    *(Si no tienes `curl`, puedes descargar el archivo manualmente y guardarlo con ese nombre).*
3.  **Crea un archivo de entorno `.env`** en la misma carpeta e incluye solo la configuración imprescindible:
    ```env
    # SECRET_KEY obligatoria de 64 caracteres. (Puedes generar una al azar).
    SECRET_KEY=INTRODUCE_AQUI_UNA_CLAVE_SECRETA_ALEATORIA_DE_64_CARACTERES_HEXA
    
    # ORIGIN es tu URL base. Ej: http://localhost:3000 si pruebas en local,
    # o https://tu-sitio.com si es en un servidor público.
    ORIGIN=http://localhost:3000
    ```
4.  **Descarga y arranca la aplicación**:
    ```bash
    docker compose pull
    docker compose up -d
    ```

¡Listo! ✨ Ahora tendrás Sapin disponible en la dirección de la variable `ORIGIN` configurada (por defecto en `http://localhost:3000`).

---

### Arquitectura de la Imagen
- **Base de Datos Persistente**: Volumen en `/data/sapin.db`
- **Subidas y Archivos**: Volumen en `/data/files/uploads`
- **Qdrant**: Integrado por defecto vía Docker Compose (`http://qdrant:6333`)
- **Migraciones Automáticas**: Se ejecutan `npm run db:migrate` en el arranque del contenedor.

### Variables Requeridas para Docker
Solo necesitas definir obligatoriamente tu clave secreta (64 caracteres hexadecimales):
```bash
SECRET_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

Para entornos expuestos a internet, es **obligatorio** configurar la variable `ORIGIN` para evitar bloqueos por CORS (`403 Cross-site POST form submissions are forbidden`):
```bash
ORIGIN=https://sapin.tu-dominio.com
```

### Levantar los contenedores

```bash
# Construir y arrancar servicios en segundo plano
docker compose up -d --build

# Revisar logs y estado
docker compose logs -f sapin
docker compose ps
```

La aplicación se publicará en `http://localhost:3000`.

---

## 🏗️ Comandos Disponibles

El proyecto expone varios scripts útiles en el `package.json`:

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo de Vite. |
| `npm run build` | Construye la aplicación optimizada para producción. |
| `npm run check` | Ejecuta `svelte-check` para validación estricta de tipos e inconsistencias. |
| `npm run lint` | Ejecuta Prettier y ESLint para mantener el estilo de código. |
| `npm run format` | Auto-formatea el código utilizando Prettier. |
| `npm run db:push` | Sincroniza el código del esquema con la estructura real de la base de datos (ideal para prototipado). |
| `npm run db:studio` | Levanta Drizzle Studio, una interfaz web para inspeccionar la base de datos local. |
| `npm run docker:up` | Levanta todo el stack localizado en `docker-compose.yml`. |

---

## 📂 Estructura del Proyecto

El código fuente principal reside en `src/`:

*   **`src/lib/`**: Lógica de núcleo compartida.
    *   `server/db/`: Configuración, esquemas y consultas a la base de datos.
    *   `server/ai/`: Lógica central y configuración del SDK para la IA generativa.
    *   `components/`: Componentes web reusables (Svelte).
*   **`src/routes/`**: Rutas de la aplicación (basadas en SvelteKit Routing).
    *   `(app)/`: Grupo de rutas protegidas y lógica del dashboard.
    *   `api/`: Endpoints integrados para consumo externo o backend de componentes.
*   **`drizzle/`**: Historial de migraciones SQL gestionadas por Drizzle Kit.
*   **`messages/`**: Ficheros de traducciones nativos e integrados en i18n_paraglide.

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **Apache License 2.0**.
Consulta el archivo [LICENSE](LICENSE) para más información.
