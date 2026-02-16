# Cómo Obtener las Credenciales de Cloudflare R2

## Paso a Paso para Obtener R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY

### 1. Acceder al Dashboard de Cloudflare

1. Ve a [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Inicia sesión con tu cuenta de Cloudflare

### 2. Navegar a R2

1. En el menú lateral, busca y haz clic en **R2** (Object Storage)
2. Si no tienes R2 habilitado, necesitarás activarlo primero (puede tener un costo)

### 3. Crear API Token

1. En la página de R2, busca la opción **"Manage R2 API Tokens"** o **"API Tokens"**
   - Puede estar en la parte superior derecha o en la configuración del bucket
   - También puedes ir directamente a: **R2** > **Manage R2 API Tokens**

2. Haz clic en **"Create API Token"** o **"Create Token"**

3. Configura el token:
   - **Token Name**: Dale un nombre descriptivo (ej: "Atelier Poz Backend")
   - **Permissions**: Selecciona **"Admin Read & Write"** o **"Object Read & Write"** según tus necesidades
   - **TTL**: Opcional, puedes dejarlo sin expiración o configurar una fecha

4. Haz clic en **"Create API Token"**

### 4. Copiar las Credenciales

**⚠️ IMPORTANTE**: Solo verás el **Secret Access Key** una vez. ¡Cópialo inmediatamente!

Después de crear el token, verás:
- **Access Key ID**: Cópialo (ej: `a1b2c3d4e5f6g7h8i9j0`)
- **Secret Access Key**: Cópialo inmediatamente (ej: `xYz123AbC456DeF789...`)

### 5. Configurar en el .env

Agrega estas credenciales a tu archivo `.env`:

```env
R2_ACCESS_KEY_ID=a1b2c3d4e5f6g7h8i9j0
R2_SECRET_ACCESS_KEY=xYz123AbC456DeF789...
```

## Configuración de R2_PUBLIC_URL

### Opción 1: Habilitar Public URL (Recomendado para desarrollo)

Si quieres URLs públicas directas:

1. Ve a tu bucket en R2
2. Ve a **Settings** > **Public Access**
3. Habilita **"Public Access"**
4. Si tienes un dominio personalizado, configúralo aquí
5. Si no, Cloudflare te dará una URL como: `https://<bucket-name>.r2.dev`

Luego en tu `.env`:
```env
R2_PUBLIC_URL=https://atelierpoz.r2.dev
```

### Opción 2: Usar Signed URLs (Recomendado para producción)

Si prefieres mantener el bucket privado (más seguro):

1. **NO** habilites Public Access
2. En tu `.env`, **NO** configures `R2_PUBLIC_URL` o déjalo vacío:
```env
# R2_PUBLIC_URL=  # Dejar vacío o comentado
```

El sistema automáticamente usará **Signed URLs** (URLs firmadas con expiración).

Puedes configurar el tiempo de expiración (opcional):
```env
R2_SIGNED_URL_EXPIRES_IN=31536000  # Segundos (1 año por defecto)
```

## Configuración Completa del .env

```env
# Cloudflare R2 (S3-compatible)
R2_ENDPOINT=https://054bdc8d8d0adab1c53fc077061dac39.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=tu_access_key_id_aqui
R2_SECRET_ACCESS_KEY=tu_secret_access_key_aqui
R2_BUCKET_NAME=atelierpoz

# Opción 1: Si tienes Public URL habilitado
R2_PUBLIC_URL=https://atelierpoz.r2.dev

# Opción 2: Si NO tienes Public URL (usar signed URLs)
# R2_PUBLIC_URL=  # Dejar vacío o comentar
# R2_SIGNED_URL_EXPIRES_IN=31536000  # Opcional: tiempo de expiración en segundos (1 año)
```

## Verificar la Configuración

Para verificar que todo está correcto:

1. Asegúrate de que las credenciales estén correctas en el `.env`
2. Reinicia el servidor backend
3. Intenta subir un archivo usando el endpoint `/api/upload`
4. Si hay errores, revisa los logs del servidor

## Troubleshooting

### Error: "InvalidAccessKeyId"
- Verifica que `R2_ACCESS_KEY_ID` esté correcto
- Asegúrate de no tener espacios extra

### Error: "SignatureDoesNotMatch"
- Verifica que `R2_SECRET_ACCESS_KEY` esté correcto
- Asegúrate de copiar el secret completo (puede ser muy largo)

### Error: "NoSuchBucket"
- Verifica que `R2_BUCKET_NAME` sea correcto
- Asegúrate de que el bucket exista en tu cuenta de Cloudflare

### Error: "Access Denied"
- Verifica que el token tenga permisos de "Read & Write"
- Asegúrate de que el token no haya expirado

## Seguridad

- **Nunca** commits las credenciales al repositorio
- Usa variables de entorno siempre
- Rota las credenciales periódicamente
- Si una credencial se compromete, elimínala y crea una nueva inmediatamente
