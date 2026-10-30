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

1. Crea el proyecto en Supabase y ejecuta el script SQL (guárdalo en `docs/`).
2. Copia `js/config.example.js` como `js/config.js` y completa:
   - `SUPABASE_URL` y `SUPABASE_ANON_KEY` (Supabase > Project Settings > API)
   - `ADMIN_PASSWORD`, `WHATSAPP` y `TELEFONO`
3. Sirve la carpeta con un servidor estático (no abras el archivo con doble clic):
   - VS Code: extensión **Live Server**, o
   - Terminal: `npx serve .`
4. Abre `http://localhost:3000` (cliente) y `/admin.html` (administrador).

`js/config.js` está en `.gitignore`: no se sube a GitHub.

## Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: **Add New > Project**, importa el repositorio (Framework: *Other*).
3. En **Settings > Environment Variables** agrega:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ADMIN_PASSWORD` y, opcionalmente, `WHATSAPP` y `TELEFONO`.
4. Despliega. Vercel ejecuta `node build.js`, que crea `dist/` con `js/config.js` generado desde esas variables.
   Cada `git push` a `main` vuelve a desplegar automáticamente.
5. El panel queda en `https://TU-APP.vercel.app/admin`.

## Seguridad (limitaciones conocidas)

- La **anon key** es pública por diseño; los datos se protegen con **Row Level Security** en Supabase.
- La **service_role key** nunca debe usarse en el front-end ni subirse al repositorio.
- La contraseña del panel se valida en el navegador: es una barrera básica para el proyecto
  académico, no seguridad real. Para producción usa **Supabase Auth** y políticas RLS solo para `authenticated`.
- Contra la doble reserva, la app verifica el horario justo antes de guardar y la base de datos
  rechaza duplicados con un índice único y una restricción de solapamiento.

## Compatibilidad

Chrome, Firefox, Edge y Safari actuales.
