# Configuración de Cloudflare R2 para Subida de Archivos

## Requisitos

1. Tener un bucket de Cloudflare R2 creado
2. Tener las credenciales de acceso (Access Key ID y Secret Access Key)
3. Configurar el bucket como público (opcional, si quieres URLs públicas directas)

## Configuración

### 1. Obtener credenciales de R2

1. Ve a tu dashboard de Cloudflare
2. Navega a **R2** > **Manage R2 API Tokens**
3. Crea un nuevo token con permisos de lectura y escritura
4. Copia el **Access Key ID** y **Secret Access Key**

### 2. Configurar variables de entorno

Edita el archivo `.env` en el backend y agrega:

```env
# Cloudflare R2 (S3-compatible)
R2_ENDPOINT=https://054bdc8d8d0adab1c53fc077061dac39.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=tu_access_key_id_aqui
R2_SECRET_ACCESS_KEY=tu_secret_access_key_aqui
R2_BUCKET_NAME=atelierpoz
R2_PUBLIC_URL=https://atelierpoz.r2.dev
```

**Nota:** 
- `R2_ENDPOINT`: El endpoint de tu cuenta R2 (ya está configurado)
- `R2_ACCESS_KEY_ID`: Tu Access Key ID de R2
- `R2_SECRET_ACCESS_KEY`: Tu Secret Access Key de R2
- `R2_BUCKET_NAME`: El nombre de tu bucket (ya está configurado como `atelierpoz`)
- `R2_PUBLIC_URL`: La URL pública de tu bucket. Si tienes un dominio personalizado configurado, úsalo aquí. Si no, usa el formato: `https://<bucket-name>.r2.dev`

### 3. Configurar bucket como público (opcional)

Si quieres que las imágenes sean accesibles públicamente:

1. Ve a tu bucket en Cloudflare R2
2. Ve a **Settings** > **Public Access**
3. Habilita el acceso público
4. Configura un dominio personalizado si lo deseas (opcional)

## Uso del Endpoint

### POST `/api/upload`

Sube uno o varios archivos a Cloudflare R2.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Body:**
- `files`: uno o varios archivos (máximo 10 archivos, 10MB cada uno)

**Query params:**
- `folder`: (opcional) carpeta donde guardar los archivos (ej: `products`, `posts`)

**Ejemplo con cURL:**
```bash
curl -X POST \
  'http://localhost:3001/api/upload?folder=products' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'files=@image1.jpg' \
  -F 'files=@image2.jpg'
```

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "url": "https://atelierpoz.r2.dev/products/1234567890-uuid.jpg",
      "key": "products/1234567890-uuid.jpg"
    }
  ],
  "count": 1
}
```

## Tipos de archivo permitidos

- JPEG/JPG
- PNG
- WebP
- GIF
- SVG

## Límites

- Tamaño máximo por archivo: 10MB
- Máximo de archivos por petición: 10
- Todos los archivos se validan antes de subir

## Flujo en el Frontend

1. El usuario selecciona imágenes en el formulario
2. Las imágenes se suben inmediatamente a R2 cuando se seleccionan
3. Se obtienen las URLs de las imágenes subidas
4. Al guardar el producto/post, se usan las URLs de las imágenes (no base64)

## Notas importantes

- Las imágenes se guardan con nombres únicos (timestamp + UUID)
- Los archivos se organizan en carpetas según el parámetro `folder`
- El bucket debe estar configurado como público si quieres URLs públicas directas
- Si usas un dominio personalizado, actualiza `R2_PUBLIC_URL` en el `.env`
