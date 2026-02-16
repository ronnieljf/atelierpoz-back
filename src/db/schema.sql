-- Schema de base de datos para Atelier Poz
-- PostgreSQL (Neon)

-- Habilitar UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin' NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- Índice para búsquedas rápidas por email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Tabla de sesiones (opcional, para manejo de sesiones)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para sesiones
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Tabla de tiendas
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id TEXT UNIQUE,
  name VARCHAR(255) NOT NULL,
  state VARCHAR(50) DEFAULT 'active' NOT NULL,
  logo TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para stores
CREATE INDEX IF NOT EXISTS idx_stores_created_by ON stores(created_by);
CREATE INDEX IF NOT EXISTS idx_stores_state ON stores(state);

-- Tabla de relación entre tiendas y usuarios
CREATE TABLE IF NOT EXISTS store_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_creator BOOLEAN DEFAULT false NOT NULL,
  phone_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, user_id)
);

-- Índices para store_users
CREATE INDEX IF NOT EXISTS idx_store_users_store_id ON store_users(store_id);
CREATE INDEX IF NOT EXISTS idx_store_users_user_id ON store_users(user_id);
CREATE INDEX IF NOT EXISTS idx_store_users_is_creator ON store_users(is_creator);

-- Tabla de categorías
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, slug)
);

-- Índices para categories
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_by ON categories(created_by);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD' NOT NULL,
  stock INTEGER DEFAULT 0 NOT NULL,
  sku VARCHAR(100),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  images JSONB DEFAULT '[]'::jsonb,
  attributes JSONB DEFAULT '[]'::jsonb,
  combinations JSONB DEFAULT '[]'::jsonb,
  rating DECIMAL(3, 2),
  review_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, sku)
);

-- Índices para products
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);

-- Tabla receivables (cuentas por cobrar). Requiere tabla requests (migración 006).
-- Creada por migración 013_create_receivables.js
