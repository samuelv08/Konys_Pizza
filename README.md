# Konys Pizza · Reservas de mesas

Aplicación web para reservar mesas en **Konys Pizza** (Cra. 36 con calle 41, Bucaramanga).
El cliente ve la disponibilidad en tiempo real, elige mesa, fecha y hora, y confirma sin llamar.
El administrador gestiona mesas, horarios, reservas y la carta desde `/admin`.

- **App desplegada:** _pendiente (enlace de Vercel)_
- **Video de presentación:** _pendiente_

## Tecnologías

| Capa | Tecnología |
|------|-----------|
| Presentación | HTML5, CSS3 (Flexbox/Grid, mobile first) |
| Lógica | JavaScript ES6+ vanilla (sin frameworks) |
| Datos | Supabase (PostgreSQL) con `@supabase/supabase-js` por CDN |
| Control de versiones | Git + GitHub |
| Despliegue | Vercel |

## Estructura

```
konys-reservas-app/
├── index.html            # Página principal (cliente)
├── admin.html            # Panel de administración (/admin)
├── css/styles.css
├── js/
│   ├── config.example.js # Plantilla de configuración (copiar a config.js)
│   ├── supabase.js       # Conexión + utilidades compartidas
│   ├── cliente.js        # Lógica del módulo cliente
│   └── admin.js          # Lógica del módulo administrador
├── docs/                 # Documento del proyecto, mockups y script SQL
├── build.js              # Genera dist/ con las variables de entorno (Vercel)
├── vercel.json
└── package.json
```

## Ejecutar en local

1. Crea el proyecto en Supabase y ejecuta `docs/security-levels.sql`.
2. Copia `js/config.example.js` como `js/config.js` y completa:
   - `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Supabase > Project Settings > API)
   - `WHATSAPP` y `TELEFONO`
3. Crea las cuentas del personal en **Authentication > Users** y asígnales un nivel
   siguiendo las instrucciones de seguridad de abajo.
4. Sirve la carpeta con un servidor estático (no abras el archivo con doble clic):
   - VS Code: extensión **Live Server**, o
   - Terminal: `npx serve .`
5. Abre `http://localhost:3000` (cliente) y `/admin.html` (administrador).

`js/config.js` está en `.gitignore`: no se sube a GitHub.

## Pruebas funcionales con Selenium

Se requiere Node.js 18 o superior y Microsoft Edge instalado. Instala las dependencias
con `npm install` y ejecuta `npm run test:functional` o `npm run test:selenium`.
Selenium Manager obtiene el controlador de Edge si no está disponible localmente;
la primera ejecución puede requerir conexión a internet.

La suite comprueba la página pública, el menú móvil, el flujo de reserva (validaciones
y confirmación), el acceso administrativo, los cuatro niveles de permisos, los formularios de mesas y carta, los
filtros y estados de reservas, altas/ediciones/ocultamiento/eliminación en el panel,
horarios y cierre de sesión. También comprueba límites de campos, que la reserva
requiera nombre y apellido, y que el teléfono admita solo números.
Usa un Supabase simulado con datos ficticios; no crea ni modifica datos reales.

`npm run selenium:demo` solo abre la página de Selenium como prueba básica del
controlador; no prueba la aplicación.

## Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New > Project**, importa el repositorio (Framework: *Other*).
3. En **Settings > Environment Variables** agrega:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` y, opcionalmente, `WHATSAPP` y `TELEFONO`.
4. Despliega. Vercel ejecuta `node build.js`, que crea `dist/` con `js/config.js` generado desde esas variables. Al compilar localmente, el script puede usar `js/config.js`; las variables de entorno, cuando están definidas, tienen prioridad.
   Cada `git push` a `main` vuelve a desplegar automáticamente.
5. El panel queda en `https://TU-APP.vercel.app/admin`.

## Seguridad y niveles de acceso

El panel usa cuatro niveles, aplicados en la interfaz y en las políticas RLS de Supabase:

| Nivel | Permisos |
|---|---|
| `consulta` | Lectura de mesas, horarios y carta; no ve datos de reservas. |
| `operador` | Lo anterior y consulta/actualización del estado de reservas. |
| `gestor` | Lo anterior y creación/edición de mesas, horarios y carta. |
| `administrador` | Acceso completo, incluidos borrados. |

Para activar los niveles:

1. Ejecuta `docs/security-levels.sql` en Supabase SQL Editor. El script crea la tabla de
   niveles y limita las operaciones mediante RLS; ocultar botones en el navegador no basta.
2. Crea cada cuenta en **Authentication > Users** con correo y contraseña. Asigna el nivel
   desde SQL Editor (reemplaza el correo y el nivel):

   ```sql
   INSERT INTO public.admin_roles (user_id, security_level)
   SELECT id, 'administrador'
   FROM auth.users
   WHERE email = 'admin@tu-dominio.com'
   ON CONFLICT (user_id) DO UPDATE
   SET security_level = EXCLUDED.security_level;
   ```

3. La aplicación cierra la sesión tras 10 minutos de inactividad. Configura también la
   caducidad de sesiones y las reglas de contraseña en Supabase **Authentication > Settings**.
4. `vercel.json` establece cabeceras de seguridad, incluida una Content Security Policy.

La clave **anon/publishable** de Supabase es pública por diseño y debe estar protegida por
RLS. Nunca pongas la clave `service_role` en el navegador. El inicio de sesión antiguo por
`ADMIN_PASSWORD` ya no se utiliza: elimina esa variable de Vercel y cambia la contraseña
anterior, pues una contraseña distribuida en JavaScript no puede considerarse secreta.

La vista `reservas_ocupadas` debe seguir exponiendo únicamente mesa, fecha e intervalo
horario a los clientes; no debe incluir datos personales. Conserva también en la base de
datos las restricciones que validan las reservas, incluidas las solicitudes directas.

## Compatibilidad

Chrome, Firefox, Edge y Safari actuales.
