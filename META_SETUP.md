# Configuración de Integración con Meta/Instagram

Esta guía explica cómo configurar la integración con Meta/Instagram para publicar posts automáticamente.

## Requisitos Previos

1. **App de Meta creada**: Necesitas tener una aplicación en [Meta for Developers](https://developers.facebook.com/)
2. **App ID**: Tu App ID es `898273202701987`
3. **App Secret**: `6c9b544adb2c30d0b33116c222337abc`
4. **Instagram App ID**: `1597597824718905`
5. **Instagram App Secret**: `cfbc640db9f458d1e1089e426149d375`
6. **Página de Facebook**: Debes tener una página de Facebook
7. **Cuenta de Instagram Business**: Tu página debe estar conectada a una cuenta de Instagram Business

## Configuración en Meta for Developers

1. Ve a [Meta for Developers](https://developers.facebook.com/apps/)
2. Selecciona tu app (ID: 898273202701987 - atelierapp-IG)
3. Ve a **Settings > Basic** y verifica tu **App Secret** (ya configurado)
4. Ve a **Products** y agrega **Instagram Graph API** si no está agregado
5. En **Instagram Graph API > Settings**, configura:
   - **Valid OAuth Redirect URIs**: Agrega `http://localhost:3001/api/meta/callback` (desarrollo) y tu URL de producción
   - **Deauthorize Callback URL**: Agrega la misma URL
6. Solicita los siguientes permisos:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`

## Variables de Entorno

Las siguientes variables ya están configuradas en tu archivo `.env`:

```env
# Meta/Instagram Configuration
META_APP_ID=898273202701987
META_APP_SECRET=6c9b544adb2c30d0b33116c222337abc
INSTAGRAM_APP_ID=1597597824718905
INSTAGRAM_APP_SECRET=cfbc640db9f458d1e1089e426149d375

# URLs (ajusta según tu entorno)
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
```

## Migración de Base de Datos

Ejecuta la migración para crear la tabla de integraciones:

```bash
npm run migrate:meta
```

## Flujo de Uso

### 1. Conectar cuenta de Instagram

1. En el frontend, cuando el usuario esté en la página de crear posts, debe haber un botón para "Conectar Instagram"
2. Al hacer clic, se llama a `GET /api/meta/auth/initiate` (requiere autenticación)
3. El backend retorna una URL de autorización
4. El frontend redirige al usuario a esa URL
5. El usuario autoriza la aplicación en Meta
6. Meta redirige de vuelta a `/api/meta/callback`
7. El backend guarda los tokens y redirige al frontend con un mensaje de éxito/error

### 2. Verificar estado de conexión

```javascript
GET /api/meta/status
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "connected": true,
    "integration": {
      "pageName": "Mi Página",
      "instagramUsername": "mi_cuenta",
      "expiresAt": "2024-03-15T10:00:00.000Z",
      "isExpired": false
    }
  }
}
```

### 3. Crear y publicar post

Cuando creas un post con `status: 'published'`, el sistema automáticamente:

1. Verifica si hay una integración de Instagram activa
2. Verifica que el token no esté expirado
3. Crea un contenedor de media en Instagram con la imagen
4. Publica el post en Instagram
5. Guarda el ID del post de Instagram (si es necesario)

**Ejemplo de creación de post:**

```javascript
POST /api/posts
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Nuevo Producto",
  "description": "Descripción del producto",
  "hashtags": ["#moda", "#estilo"],
  "images": ["https://example.com/image.jpg"],
  "selectedProducts": ["product-uuid"],
  "platform": "instagram",
  "status": "published"  // Esto activará la publicación automática
}
```

### 4. Desconectar cuenta

```javascript
DELETE /api/meta/disconnect
Authorization: Bearer <token>
```

## Notas Importantes

1. **Tokens de larga duración**: Los tokens de Instagram duran 60 días. Debes renovarlos antes de que expiren.

2. **Límites de publicación**: Instagram permite máximo 50 posts por día por cuenta.

3. **Imágenes públicas**: Las imágenes deben estar en URLs públicas y accesibles cuando se publique en Instagram.

4. **Cuenta Business**: Solo puedes publicar en cuentas de Instagram Business, no en cuentas personales.

5. **Errores comunes**:
   - Si el token expira, el post se guarda pero no se publica
   - Si no hay integración, el post se guarda pero no se publica
   - Los errores de publicación no impiden que el post se guarde en la base de datos

## Endpoints Disponibles

- `GET /api/meta/auth/initiate` - Iniciar flujo OAuth (requiere auth)
- `GET /api/meta/callback` - Callback de OAuth (público)
- `GET /api/meta/status` - Verificar estado de conexión (requiere auth)
- `DELETE /api/meta/disconnect` - Desconectar cuenta (requiere auth)
