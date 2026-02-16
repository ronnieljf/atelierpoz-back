# Atelier Poz Backend

Backend API para Atelier Poz construido con Express.js y PostgreSQL (Neon).

## 🚀 Inicio Rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

El archivo `.env` ya está configurado con las credenciales de Neon PostgreSQL.

**Nota importante:** La URL de conexión usa `uselibpqcompat=true` para compatibilidad con las versiones futuras de pg. Si tienes problemas de conexión, verifica que la URL esté correcta.

### 3. Ejecutar migraciones

Crear las tablas en la base de datos:

```bash
npm run migrate
```

### 4. Crear usuario inicial

```bash
node src/db/seed.js
```

Esto creará un usuario con:
- Email: `admin@atelierpoz.com`
- Contraseña: `admin123`

### 5. Iniciar servidor

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3001`

## 📁 Estructura del Proyecto

```
atelierpoz-back/
├── src/
│   ├── config/
│   │   └── database.js      # Configuración de PostgreSQL
│   ├── controllers/
│   │   ├── authController.js # Controladores de autenticación
│   │   └── storeController.js # Controladores de tiendas
│   ├── db/
│   │   ├── schema.sql       # Schema de la base de datos
│   │   ├── migrate.js       # Script de migración
│   │   └── seed.js          # Script para crear usuario inicial
│   ├── middleware/
│   │   ├── auth.js          # Middleware de autenticación JWT
│   │   └── errorHandler.js  # Manejo de errores
│   ├── routes/
│   │   ├── authRoutes.js    # Rutas de autenticación
│   │   └── storeRoutes.js   # Rutas de tiendas
│   ├── services/
│   │   ├── authService.js   # Lógica de negocio de autenticación
│   │   └── storeService.js  # Lógica de negocio de tiendas
│   └── server.js            # Servidor Express principal
├── .env                     # Variables de entorno
├── .gitignore
├── package.json
└── README.md
```

## 🔌 Endpoints

### Autenticación

#### POST `/api/auth/login`

Login de usuario.

**Request:**
```json
{
  "email": "admin@atelierpoz.com",
  "password": "admin123"
}
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@atelierpoz.com",
    "name": "Administrador Principal",
    "role": "admin"
  },
  "token": "jwt-token-here"
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "Credenciales inválidas"
}
```

#### GET `/api/auth/verify`

Verificar si el token es válido (requiere autenticación).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@atelierpoz.com",
    "role": "admin"
  }
}
```

#### GET `/api/auth/me`

Obtener información completa del usuario actual (requiere autenticación).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "admin@atelierpoz.com",
    "name": "Administrador Principal",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "last_login": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "Token de autenticación requerido"
}
```

**Response (403):**
```json
{
  "success": false,
  "error": "Token inválido o expirado"
}
```

### Tiendas

#### GET `/api/stores`

Obtener todas las tiendas a las que pertenece el usuario actual (requiere autenticación).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "stores": [
    {
      "id": "uuid",
      "name": "Tienda Principal",
      "state": "active",
      "is_creator": true,
      "phone_number": "+1234567890",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "joined_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Response (401):**
```json
{
  "success": false,
  "error": "Token de autenticación requerido"
}
```

#### GET `/api/stores/:id`

Obtener una tienda específica del usuario actual (requiere autenticación).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "store": {
    "id": "uuid",
    "name": "Tienda Principal",
    "state": "active",
    "is_creator": true,
    "phone_number": "+1234567890",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z",
    "joined_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response (404):**
```json
{
  "success": false,
  "error": "Tienda no encontrada o no tienes acceso a ella"
}
```

## 🔐 Autenticación

El backend usa JWT (JSON Web Tokens) para autenticación.

- El token se envía en el header: `Authorization: Bearer <token>`
- El token expira en 7 días por defecto (configurable en `.env`)
- El token contiene: `id`, `email`, `role`

## 🗄️ Base de Datos

### Tablas

- **users**: Usuarios del sistema
- **sessions**: Sesiones de usuario (opcional)
- **stores**: Tiendas
- **store_users**: Relación entre tiendas y usuarios

### Migraciones

Para crear las tablas:

```bash
npm run migrate
```

## 🛠️ Scripts

- `npm run dev` - Iniciar servidor en modo desarrollo (con watch)
- `npm start` - Iniciar servidor en producción
- `npm run migrate` - Ejecutar migraciones

## 🔒 Seguridad

- Contraseñas hasheadas con bcrypt (10 salt rounds)
- JWT para autenticación
- CORS configurado
- Validación de inputs con express-validator

## 📝 Notas

- Asegúrate de cambiar `JWT_SECRET` en producción
- La base de datos usa SSL (requerido por Neon)
- El pool de conexiones está configurado para máximo 20 conexiones
