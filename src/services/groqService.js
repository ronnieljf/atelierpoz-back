/**
 * Servicio de Groq AI para WhatsApp conversacional.
 * Maneja conversaciones inteligentes y ejecuta acciones en el sistema.
 */

import Groq from 'groq-sdk';
import { getStoresWithUserIdByPhoneNumber } from './storeService.js';
import { getRequestsByStore, updateRequestStatus, getRequestByStoreAndOrderNumber, getRequestById } from './requestService.js';
import { 
  getReceivablesByStoreWithPayments, 
  createReceivableFromRequest,
  createReceivable,
  createReceivablePayment,
  updateReceivable,
  getReceivableByStoreAndReceivableNumber,
  getPaymentsByReceivableId,
} from './receivableService.js';
import { getProductsByStore } from './productService.js';
import { getClientsByStore, createClient } from './clientService.js';
import { getCategoriesByStoreId, createCategory } from './categoryService.js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

// Almacenamiento temporal de conversaciones (en producción usar Redis o DB)
const conversationHistory = new Map();

/**
 * Obtiene el historial de conversación para un número de teléfono
 */
function getConversationHistory(phone) {
  if (!conversationHistory.has(phone)) {
    conversationHistory.set(phone, []);
  }
  return conversationHistory.get(phone);
}

/**
 * Guarda un mensaje en el historial de conversación
 */
function addToHistory(phone, role, content) {
  const history = getConversationHistory(phone);
  history.push({ role, content });
  
  // Limitar historial a últimos 20 mensajes para no exceder límites
  if (history.length > 20) {
    history.shift();
  }
}

/**
 * Limpia el historial de conversación de un número
 */
function clearHistory(phone) {
  conversationHistory.delete(phone);
}

/**
 * Define las funciones disponibles para Groq (function calling)
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'consultar_pedidos',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera ver/consultar/listar pedidos. Retorna los pedidos de la tienda con detalles completos. Puede filtrar por estado.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          status: {
            type: 'string',
            description: 'Estado de los pedidos (opcional): pending, processing, completed, cancelled',
            enum: ['pending', 'processing', 'completed', 'cancelled'],
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_cuentas_por_cobrar',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera ver/consultar cuentas por cobrar o saber cuánto le deben. Retorna todas las cuentas con montos pendientes y pagados.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          status: {
            type: 'string',
            description: 'Estado de las cuentas (opcional): pending, paid, cancelled',
            enum: ['pending', 'paid', 'cancelled'],
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convertir_pedido_a_cuenta',
      description: 'Convierte un pedido en cuenta por cobrar. REQUIERE el número del pedido.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          orderNumber: {
            type: 'number',
            description: 'Número del pedido a convertir',
          },
        },
        required: ['storeId', 'orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_cuenta_manual',
      description: 'Crea una cuenta por cobrar manual (sin pedido asociado). REQUIERE todos los datos del cliente y el monto.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          customerName: {
            type: 'string',
            description: 'Nombre del cliente',
          },
          customerPhone: {
            type: 'string',
            description: 'Teléfono del cliente (con código de país)',
          },
          amount: {
            type: 'number',
            description: 'Monto a cobrar',
          },
          currency: {
            type: 'string',
            description: 'Moneda (USD o EUR)',
            enum: ['USD', 'EUR'],
          },
          description: {
            type: 'string',
            description: 'Descripción o concepto de la cuenta por cobrar',
          },
        },
        required: ['storeId', 'customerName', 'customerPhone', 'amount', 'currency', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'registrar_abono',
      description: 'Registra un abono/pago en una cuenta por cobrar.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          receivableNumber: {
            type: 'number',
            description: 'Número de la cuenta por cobrar',
          },
          amount: {
            type: 'number',
            description: 'Monto del abono',
          },
          notes: {
            type: 'string',
            description: 'Notas adicionales del pago (opcional)',
          },
        },
        required: ['storeId', 'receivableNumber', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marcar_cuenta_cobrada',
      description: 'Marca una cuenta por cobrar como cobrada (completa).',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          receivableNumber: {
            type: 'number',
            description: 'Número de la cuenta por cobrar',
          },
        },
        required: ['storeId', 'receivableNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancelar_cuenta',
      description: 'Cancela una cuenta por cobrar.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          receivableNumber: {
            type: 'number',
            description: 'Número de la cuenta por cobrar',
          },
        },
        required: ['storeId', 'receivableNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cambiar_estado_pedido',
      description: 'Cambia el estado de un pedido (processing, completed, cancelled).',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          orderNumber: {
            type: 'number',
            description: 'Número del pedido',
          },
          newStatus: {
            type: 'string',
            description: 'Nuevo estado del pedido',
            enum: ['processing', 'completed', 'cancelled'],
          },
        },
        required: ['storeId', 'orderNumber', 'newStatus'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_productos',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera ver/consultar el catálogo de productos. Retorna lista de productos con precios, stock y detalles.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          search: {
            type: 'string',
            description: 'Término de búsqueda (opcional)',
          },
          limit: {
            type: 'number',
            description: 'Número máximo de productos a devolver (por defecto 10)',
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_clientes',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera ver/consultar/listar clientes. Retorna la lista de clientes de la tienda con nombre, teléfono y email.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          search: {
            type: 'string',
            description: 'Término de búsqueda para filtrar clientes por nombre, teléfono o email (opcional)',
          },
          limit: {
            type: 'number',
            description: 'Número máximo de clientes a devolver (por defecto 20)',
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_cliente',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera crear/agregar un nuevo cliente. Requiere al menos nombre o teléfono.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          name: {
            type: 'string',
            description: 'Nombre del cliente',
          },
          phone: {
            type: 'string',
            description: 'Teléfono del cliente (con código de país, ej: +584121234567)',
          },
          email: {
            type: 'string',
            description: 'Email del cliente (opcional)',
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_categorias',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera ver/consultar/listar categorías de productos. Retorna todas las categorías de la tienda.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'crear_categoria',
      description: 'USA ESTA FUNCIÓN cuando el usuario quiera crear/agregar una nueva categoría de productos. Requiere el nombre de la categoría.',
      parameters: {
        type: 'object',
        properties: {
          storeId: {
            type: 'string',
            description: 'ID de la tienda',
          },
          name: {
            type: 'string',
            description: 'Nombre de la categoría (ej: "Camisas", "Zapatos", "Accesorios")',
          },
        },
        required: ['storeId', 'name'],
      },
    },
  },
];

/** Herramientas permitidas solo para dueños de tienda: únicamente consultas de cuentas por cobrar */
const toolsReceivablesOnly = [
  {
    type: 'function',
    function: {
      name: 'consultar_cuentas_por_cobrar',
      description: 'Lista las cuentas por cobrar de la tienda. Usar cuando pidan ver cuentas, quién les debe, cuánto les deben, listado de cuentas pendientes.',
      parameters: {
        type: 'object',
        properties: {
          storeId: { type: 'string', description: 'ID de la tienda' },
          status: {
            type: 'string',
            description: 'Estado opcional: pending, paid, cancelled',
            enum: ['pending', 'paid', 'cancelled'],
          },
        },
        required: ['storeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_detalle_cuenta',
      description: 'Muestra el detalle de una cuenta por cobrar por su número: cliente, monto, abonos, pendiente y si viene de un pedido los productos con precios.',
      parameters: {
        type: 'object',
        properties: {
          storeId: { type: 'string', description: 'ID de la tienda' },
          receivableNumber: { type: 'number', description: 'Número de la cuenta por cobrar (ej: 3 para cuenta #3)' },
        },
        required: ['storeId', 'receivableNumber'],
      },
    },
  },
];

/**
 * Ejecuta una función llamada por Groq
 */
async function executeFunction(functionName, args, userStores) {
  console.log(`[Groq] Ejecutando función: ${functionName}`, args);
  
  try {
    switch (functionName) {
      case 'consultar_pedidos': {
        const { storeId, status } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const { requests, total } = await getRequestsByStore(storeId, { status });
        return {
          success: true,
          storeName: store.storeName,
          total,
          pedidos: (requests || []).map(r => ({
            numero: r.order_number,
            cliente: r.customer_name || 'Sin nombre',
            telefono: r.customer_phone,
            total: parseFloat(r.total),
            moneda: r.currency || 'USD',
            estado: r.status,
            tieneCuenta: r.has_receivable || false,
            fecha: new Date(r.created_at).toLocaleDateString('es-ES'),
            items: r.items?.length || 0,
          })),
        };
      }
      
      case 'consultar_cuentas_por_cobrar': {
        const { storeId, status } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const all = await getReceivablesByStoreWithPayments(storeId);
        const filtered = status ? all.filter(r => r.status === status) : all.filter(r => r.status === 'pending');
        const totalPendientePorMoneda = {};
        for (const r of filtered) {
          const pendiente = Math.max(0, (r.amount || 0) - (r.totalPaid || 0));
          if (pendiente <= 0) continue;
          const moneda = r.currency || 'USD';
          totalPendientePorMoneda[moneda] = (totalPendientePorMoneda[moneda] || 0) + pendiente;
        }
        
        return {
          success: true,
          storeName: store.storeName,
          total: filtered.length,
          totalPendientePorMoneda,
          cuentas: filtered.map(r => ({
            numero: r.receivableNumber,
            cliente: r.customerName || 'Sin nombre',
            telefono: r.customerPhone,
            monto: r.amount,
            pagado: r.totalPaid,
            pendiente: Math.max(0, r.amount - r.totalPaid),
            moneda: r.currency,
            estado: r.status,
            desdePedido: !!r.requestId,
            fecha: new Date(r.createdAt).toLocaleDateString('es-ES'),
          })),
        };
      }

      case 'consultar_detalle_cuenta': {
        const { storeId, receivableNumber } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        const rec = await getReceivableByStoreAndReceivableNumber(storeId, receivableNumber);
        if (!rec) throw new Error(`Cuenta #${receivableNumber} no encontrada`);
        const paymentsData = await getPaymentsByReceivableId(rec.id, storeId);
        const totalPaid = paymentsData?.totalPaid ?? 0;
        const pendiente = Math.max(0, (rec.amount || 0) - totalPaid);
        let pedido = null;
        if (rec.requestId) {
          const request = await getRequestById(rec.requestId, storeId);
          if (request && request.items && Array.isArray(request.items)) {
            pedido = {
              numeroPedido: request.order_number,
              cliente: request.customer_name,
              telefono: request.customer_phone,
              total: parseFloat(request.total),
              moneda: request.currency || 'USD',
              productos: request.items.map((it, i) => ({
                nombre: it.productName,
                cantidad: it.quantity,
                precioUnitario: it.quantity > 0 ? (it.totalPrice || 0) / it.quantity : 0,
                total: it.totalPrice || 0,
              })),
            };
          }
        }
        return {
          success: true,
          storeName: store.storeName,
          cuenta: {
            numero: rec.receivableNumber,
            cliente: rec.customerName || 'Sin nombre',
            telefono: rec.customerPhone,
            descripcion: rec.description,
            monto: rec.amount,
            moneda: rec.currency || 'USD',
            estado: rec.status,
            totalPagado: totalPaid,
            pendiente,
            abonos: (paymentsData?.payments || []).map(p => ({
              monto: p.amount,
              moneda: p.currency,
              notas: p.notes,
              fecha: p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-ES') : null,
            })),
            pedido,
          },
        };
      }
      
      case 'convertir_pedido_a_cuenta': {
        const { storeId, orderNumber } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const request = await getRequestByStoreAndOrderNumber(storeId, orderNumber);
        if (!request) throw new Error(`Pedido #${orderNumber} no encontrado`);
        if (request.status !== 'pending') throw new Error('Solo se pueden convertir pedidos pendientes');
        
        await createReceivableFromRequest(request.id, storeId, store.userId);
        
        return {
          success: true,
          mensaje: `Pedido #${orderNumber} convertido exitosamente a cuenta por cobrar`,
          storeName: store.storeName,
        };
      }
      
      case 'crear_cuenta_manual': {
        const { storeId, customerName, customerPhone, amount, currency, description } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const newReceivable = await createReceivable({
          storeId,
          createdBy: store.userId,
          customerName,
          customerPhone,
          description,
          amount,
          currency,
        });
        
        return {
          success: true,
          mensaje: `Cuenta por cobrar creada exitosamente`,
          storeName: store.storeName,
          cuenta: {
            numero: newReceivable.receivableNumber,
            cliente: customerName,
            telefono: customerPhone,
            monto: amount,
            moneda: currency,
            descripcion: description,
          },
        };
      }
      
      case 'registrar_abono': {
        const { storeId, receivableNumber, amount, notes } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const rec = await getReceivableByStoreAndReceivableNumber(storeId, receivableNumber);
        if (!rec) throw new Error(`Cuenta #${receivableNumber} no encontrada`);
        if (rec.status !== 'pending') throw new Error('Solo se pueden abonar cuentas pendientes');
        
        const result = await createReceivablePayment(rec.id, storeId, {
          amount,
          currency: rec.currency,
          notes,
        }, store.userId);
        
        const nuevoPendiente = Math.max(0, rec.amount - (rec.totalPaid || 0) - amount);
        
        return {
          success: true,
          mensaje: `Abono de ${amount} ${rec.currency} registrado en cuenta #${receivableNumber}`,
          storeName: store.storeName,
          montoAbonado: amount,
          pendienteRestante: nuevoPendiente,
          cuentaCobrada: result.receivable?.status === 'paid',
        };
      }
      
      case 'marcar_cuenta_cobrada': {
        const { storeId, receivableNumber } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const rec = await getReceivableByStoreAndReceivableNumber(storeId, receivableNumber);
        if (!rec) throw new Error(`Cuenta #${receivableNumber} no encontrada`);
        if (rec.status !== 'pending') throw new Error('La cuenta no está pendiente');
        
        await updateReceivable(rec.id, storeId, { status: 'paid' });
        
        return {
          success: true,
          mensaje: `Cuenta #${receivableNumber} marcada como cobrada`,
          storeName: store.storeName,
        };
      }
      
      case 'cancelar_cuenta': {
        const { storeId, receivableNumber } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const rec = await getReceivableByStoreAndReceivableNumber(storeId, receivableNumber);
        if (!rec) throw new Error(`Cuenta #${receivableNumber} no encontrada`);
        
        await updateReceivable(rec.id, storeId, { status: 'cancelled' });
        
        return {
          success: true,
          mensaje: `Cuenta #${receivableNumber} cancelada`,
          storeName: store.storeName,
        };
      }
      
      case 'cambiar_estado_pedido': {
        const { storeId, orderNumber, newStatus } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const request = await getRequestByStoreAndOrderNumber(storeId, orderNumber);
        if (!request) throw new Error(`Pedido #${orderNumber} no encontrado`);
        
        await updateRequestStatus(request.id, storeId, newStatus);
        
        const statusLabels = {
          processing: 'en proceso',
          completed: 'completado',
          cancelled: 'cancelado',
        };
        
        return {
          success: true,
          mensaje: `Pedido #${orderNumber} marcado como ${statusLabels[newStatus]}`,
          storeName: store.storeName,
        };
      }
      
      case 'consultar_productos': {
        const { storeId, search, limit = 10 } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const { products } = await getProductsByStore(storeId, {
          search,
          limit: Math.min(limit, 20),
          offset: 0,
        });
        
        return {
          success: true,
          storeName: store.storeName,
          total: products.length,
          productos: products.map(p => ({
            nombre: p.name,
            codigo: p.sku,
            precio: p.base_price,
            moneda: p.currency || 'USD',
            stock: p.stock,
            categoria: p.category,
            visible: p.visible_in_store,
          })),
        };
      }
      
      case 'consultar_clientes': {
        const { storeId, search, limit = 20 } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const { clients, total } = await getClientsByStore(storeId, {
          search,
          limit: Math.min(limit, 50),
          offset: 0,
        });
        
        return {
          success: true,
          storeName: store.storeName,
          total,
          clientes: clients.map(c => ({
            id: c.id,
            nombre: c.name || 'Sin nombre',
            telefono: c.phone || 'Sin teléfono',
            email: c.email || 'Sin email',
            fechaRegistro: new Date(c.created_at).toLocaleDateString('es-ES'),
          })),
        };
      }
      
      case 'crear_cliente': {
        const { storeId, name, phone, email } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        if (!name && !phone) {
          throw new Error('Debe proporcionar al menos nombre o teléfono del cliente');
        }
        
        const newClient = await createClient({
          name: name || 'Cliente',
          phone: phone || null,
          email: email || null,
          store_id: storeId,
        });
        
        return {
          success: true,
          mensaje: `Cliente "${name || phone}" creado exitosamente`,
          storeName: store.storeName,
          cliente: {
            id: newClient.id,
            nombre: newClient.name,
            telefono: newClient.phone,
            email: newClient.email,
          },
        };
      }
      
      case 'consultar_categorias': {
        const { storeId } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        const categories = await getCategoriesByStoreId(storeId);
        
        return {
          success: true,
          storeName: store.storeName,
          total: categories.length,
          categorias: categories.map(c => ({
            id: c.id,
            nombre: c.name,
            slug: c.slug,
            fechaCreacion: new Date(c.created_at).toLocaleDateString('es-ES'),
          })),
        };
      }
      
      case 'crear_categoria': {
        const { storeId, name } = args;
        const store = userStores.find(s => s.storeId === storeId);
        if (!store) throw new Error('Tienda no encontrada');
        
        if (!name || name.trim() === '') {
          throw new Error('El nombre de la categoría es obligatorio');
        }
        
        // Generar slug automáticamente
        const slug = name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
          .replace(/[^a-z0-9\s-]/g, '') // Eliminar caracteres especiales
          .trim()
          .replace(/\s+/g, '-') // Reemplazar espacios por guiones
          .replace(/-+/g, '-'); // Eliminar guiones duplicados
        
        const newCategory = await createCategory({
          name: name.trim(),
          slug,
          store_id: storeId,
        });
        
        return {
          success: true,
          mensaje: `Categoría "${name}" creada exitosamente`,
          storeName: store.storeName,
          categoria: {
            id: newCategory.id,
            nombre: newCategory.name,
            slug: newCategory.slug,
          },
        };
      }
      
      default:
        throw new Error(`Función ${functionName} no implementada`);
    }
  } catch (error) {
    console.error(`[Groq] Error ejecutando ${functionName}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Procesa un mensaje usando Groq AI
 */
export async function processMessageWithGroq(phone, messageText) {
  try {
    // Validar si el teléfono pertenece a una tienda
    const userStores = await getStoresWithUserIdByPhoneNumber(phone);
    
    if (userStores.length === 0) {
      return {
        response: '👋 Hola! No encontré tiendas asociadas a este número.\n\nSi eres dueño de una tienda, por favor asocia tu número de teléfono desde el panel de administración web.',
        webButtonUrl: null,
      };
    }
    
    // Construir contexto de tiendas
    const storesContext = userStores.map(s => 
      `- ${s.storeName} (ID: ${s.storeId})`
    ).join('\n');
    
    // Crear o recuperar historial de conversación
    const history = getConversationHistory(phone);
    
    // System instruction
    const systemMessage = {
      role: 'system',
      content: `Eres un asistente de WhatsApp para Atelier Poz. El usuario ${phone} administra estas tiendas:
${storesContext}

🔴 REGLA CRÍTICA #1 - SIEMPRE USA LAS FUNCIONES DISPONIBLES:
Cuando el usuario pida ver/consultar información, DEBES llamar la función correspondiente INMEDIATAMENTE.
NO respondas con texto genérico. SIEMPRE ejecuta la función primero y luego presenta los resultados.

EJEMPLOS DE USO CORRECTO:
Usuario: "muéstrame los pedidos pendientes"
→ LLAMA consultar_pedidos() INMEDIATAMENTE
→ LUEGO presenta los resultados en formato amigable

Usuario: "cuánto me deben"
→ LLAMA consultar_cuentas_por_cobrar() INMEDIATAMENTE  
→ LUEGO presenta los totales

Usuario: "ver productos"
→ LLAMA consultar_productos() INMEDIATAMENTE
→ LUEGO muestra el catálogo

🔴 REGLA CRÍTICA #2 - SIEMPRE PIDE INFORMACIÓN FALTANTE:
NUNCA ejecutes funciones con datos incompletos. SIEMPRE pregunta TODOS los datos necesarios.

EJEMPLOS OBLIGATORIOS:

❌ MAL:
Usuario: "crea un cliente"
Bot: [ejecuta función sin datos]

✅ BIEN:
Usuario: "crea un cliente"
Bot: "Perfecto! Para crear un cliente necesito:
• Nombre del cliente
• Teléfono (con código de país, ej: +58 424 1234567)
• Email (opcional)

¿Cuál es el nombre y teléfono del cliente?"

❌ MAL:
Usuario: "crea una categoría"
Bot: [ejecuta función sin nombre]

✅ BIEN:
Usuario: "crea una categoría"
Bot: "¿Qué nombre quieres para la nueva categoría?"

❌ MAL:
Usuario: "crea una cuenta por cobrar"
Bot: [adivina si es manual o de pedido]

✅ BIEN:
Usuario: "crea una cuenta por cobrar"
Bot: "Hay dos formas de crear una cuenta:

1️⃣ *Desde un pedido existente*
   Ejemplo: "convierte el pedido 5 en cuenta"

2️⃣ *Manual (sin pedido)*
   Necesito estos datos:
   • Nombre del cliente
   • Teléfono
   • Monto a cobrar
   • Moneda (USD/EUR)
   • Descripción

¿Cuál prefieres?"

❌ MAL:
Usuario: "crea un producto"
Bot: [ejecuta sin datos completos]

✅ BIEN:
Usuario: "crea un producto"
Bot: "Para crear un producto necesito:
• Nombre del producto
• Código/SKU
• Precio base
• Moneda (USD/EUR)
• Categoría
• Stock inicial

Dame estos datos y lo creo de inmediato!"

❌ MAL:
Usuario: "registra un pago"
Bot: [ejecuta sin especificar cuenta ni monto]

✅ BIEN:
Usuario: "registra un pago"
Bot: "¿En qué cuenta quieres registrar el pago?
Ejemplo: cuenta 3 o cuenta #3

Y ¿de cuánto es el pago?"

🎯 REGLA: SI FALTA INFORMACIÓN, PREGUNTA DE FORMA ESPECÍFICA
NO asumas nada. NO uses valores por defecto. PREGUNTA TODO.

FUNCIONES DISPONIBLES:
📦 consultar_pedidos - Ver pedidos de la tienda
💰 consultar_cuentas_por_cobrar - Ver cuentas pendientes
🛍️ consultar_productos - Ver catálogo
👥 consultar_clientes - Ver clientes registrados
📁 consultar_categorias - Ver categorías de productos
✅ convertir_pedido_a_cuenta - Convertir pedido en cuenta (REQUIERE: número de pedido)
📝 crear_cuenta_manual - Crear cuenta manual (REQUIERE: nombre cliente, teléfono, monto, moneda, descripción)
💵 registrar_abono - Registrar pago (REQUIERE: número de cuenta, monto)
✓ marcar_cuenta_cobrada - Marcar como cobrada (REQUIERE: número de cuenta)
❌ cancelar_cuenta - Cancelar cuenta (REQUIERE: número de cuenta)
🔄 cambiar_estado_pedido - Cambiar estado (REQUIERE: número de pedido, nuevo estado)
👤 crear_cliente - Crear cliente (REQUIERE: nombre Y/O teléfono, email opcional)
📂 crear_categoria - Crear categoría (REQUIERE: nombre)

PERSONALIDAD:
- Amigable y conversacional
- Usa emojis con moderación  
- Respuestas cortas para WhatsApp
- Presenta los datos de forma clara y organizada
- SIEMPRE pregunta datos faltantes antes de ejecutar

CUANDO NO ENTIENDAS ALGO:
Ofrece opciones claras: "¿Quieres ver pedidos, cuentas o productos?"

FORMATO DE RESPUESTA:
- Mensajes cortos (WhatsApp)
- Usa listas con viñetas (•)
- *Negritas* para destacar
- Números claros: Pedido #5, Cuenta #3, $50.00

MÚLTIPLES TIENDAS:
Menciona siempre de qué tienda hablas si el usuario tiene varias.

CONFIRMACIONES:
Para acciones importantes (cancelar, marcar cobrada), confirma antes de ejecutar.

⚠️ IMPORTANTE: NO ejecutes funciones sin TODOS los parámetros requeridos. PREGUNTA primero.`
    };

    // Construir mensajes para la API
    const messages = [
      systemMessage,
      ...history,
      { role: 'user', content: messageText }
    ];

    // Llamar a Groq con function calling
    let response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 1024,
    });

    // Guardar mensaje del usuario en historial
    addToHistory(phone, 'user', messageText);
    
    let functionResults = [];
    let finalResponse = '';

    // Procesar tool calls iterativamente
    let iterations = 0;
    const maxIterations = 5;

    while (response.choices[0].message.tool_calls && iterations < maxIterations) {
      iterations++;
      const toolCalls = response.choices[0].message.tool_calls;

      // Agregar mensaje del asistente con tool_calls al historial
      addToHistory(phone, 'assistant', response.choices[0].message.content || '');

      // Ejecutar todas las funciones
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log(`[Groq] Function call: ${functionName}`, args);
        
        const result = await executeFunction(functionName, args, userStores);
        functionResults.push({ name: functionName, result });
        
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Enviar resultados de vuelta a Groq
      messages.push(response.choices[0].message);
      messages.push(...toolResults);

      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1024,
      });
    }

    // Obtener respuesta final
    finalResponse = response.choices[0].message.content || 'No pude procesar tu solicitud.';
    
    // Guardar respuesta final en historial
    addToHistory(phone, 'assistant', finalResponse);
    
    // Generar URL del botón web si corresponde
    let webButtonUrl = null;
    if (functionResults.length > 0) {
      const webUrl = process.env.DOMAIN || 'https://atelierpoz.com';
      webButtonUrl = `${webUrl}/admin`;
    }
    
    return {
      response: finalResponse,
      webButtonUrl,
      functionResults,
    };
    
  } catch (error) {
    console.error('[Groq] Error procesando mensaje:', error);
    
    // Manejar específicamente errores de rate limit (429)
    if (error.status === 429 || error.code === 'rate_limit_exceeded' || error.message?.includes('Rate limit')) {
      console.log('[Groq] Rate limit alcanzado. Generando resumen manual...');
      
      // Obtener tiendas del usuario (en catch no tenemos userStores del try)
      const userStoresForSummary = await getStoresWithUserIdByPhoneNumber(phone);
      const summaries = await generateRateLimitSummary(userStoresForSummary);
      
      const mainMessage = `😅 Ups! Hemos alcanzado el límite de mensajes por hoy.

Nuestro servicio de IA tiene un límite diario de uso, y ya llegamos al máximo por hoy.

⏰ *Por favor intenta de nuevo en 24 horas*

Mientras tanto, puedes acceder al panel web para gestionar tu tienda:
${process.env.DOMAIN || 'https://atelierpoz.com'}/admin

¡Gracias por tu comprensión! 😊`;

      return {
        response: mainMessage,
        webButtonUrl: `${process.env.DOMAIN || 'https://atelierpoz.com'}/admin`,
        error: 'rate_limit_exceeded',
        summaries, // Resúmenes adicionales de pedidos y cuentas
      };
    }
    
    // Error genérico para otros casos
    return {
      response: '❌ Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.',
      webButtonUrl: null,
      error: error.message,
    };
  }
}

/**
 * Procesa mensajes de dueños de tienda: SOLO consultas de cuentas por cobrar.
 * No permite crear, modificar, registrar abonos ni consultar pedidos/productos.
 */
export async function processStoreOwnerReceivablesOnly(phone, messageText) {
  try {
    const userStores = await getStoresWithUserIdByPhoneNumber(phone);
    if (userStores.length === 0) {
      return {
        response: '👋 No encontré tiendas asociadas a este número. Asocia tu número desde el panel web.',
        webButtonUrl: process.env.DOMAIN ? `${process.env.DOMAIN}/admin` : 'https://atelierpoz.com/admin',
      };
    }
    const storesContext = userStores.map(s => `- ${s.storeName} (ID: ${s.storeId})`).join('\n');
    const history = getConversationHistory(phone);
    const systemMessage = {
      role: 'system',
      content: `Eres un asistente de WhatsApp para Atelier Poz. El usuario administra estas tiendas:
${storesContext}

REGLA ESTRICTA: Solo puedes ayudar con CONSULTAS de cuentas por cobrar. Nada más.

FUNCIONES PERMITIDAS:
1. consultar_cuentas_por_cobrar - Listar cuentas por cobrar (quién me debe, cuánto me deben, cuentas pendientes).
2. consultar_detalle_cuenta - Ver detalle de una cuenta por su número (cliente, monto, abonos, pendiente, y si viene de un pedido: productos y precios).

Si el usuario pide ver cuentas, listar cuentas, quién le debe, cuánto le deben, detalle de la cuenta X, etc., USA estas funciones y responde con los datos.

IMPORTANTE - TOTAL: Cuando el usuario pregunte por "el total", "cuánto en total", "dime el total", etc., DEBES usar el campo totalPendientePorMoneda que devuelve la función consultar_cuentas_por_cobrar. Ese es el total oficial (igual al admin y reportes). NO sumes tú mismo los pendiente de cada cuenta; usa siempre totalPendientePorMoneda. Ejemplo: si totalPendientePorMoneda es { USD: 292 }, responde "El total de tus cuentas por cobrar es 292 USD".

Si el usuario pide algo que NO sea consulta de cuentas por cobrar (por ejemplo: registrar un abono, crear cuenta, ver pedidos, productos, clientes, cambiar estado, cancelar), responde amablemente:
"Solo puedo ayudarte con consultas de tus cuentas por cobrar aquí. Para registrar abonos, crear cuentas, ver pedidos o gestionar tu tienda, usa el panel web 👇"
y no ejecutes ninguna otra acción.

Sé breve y claro. Usa listas y números. Siempre que des datos de cuentas, presenta totales y detalles de forma ordenada.`,
    };
    const messages = [
      systemMessage,
      ...history,
      { role: 'user', content: messageText },
    ];
    addToHistory(phone, 'user', messageText);

    let response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: toolsReceivablesOnly,
      tool_choice: 'auto',
      temperature: 0.5,
      max_tokens: 1024,
    });

    let iterations = 0;
    const maxIterations = 5;
    let functionResults = [];

    while (response.choices[0].message.tool_calls && iterations < maxIterations) {
      iterations++;
      const toolCalls = response.choices[0].message.tool_calls;
      addToHistory(phone, 'assistant', response.choices[0].message.content || '');
      const toolResults = [];
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeFunction(functionName, args, userStores);
        functionResults.push({ name: functionName, result });
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      messages.push(response.choices[0].message);
      messages.push(...toolResults);
      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: toolsReceivablesOnly,
        tool_choice: 'auto',
        temperature: 0.5,
        max_tokens: 1024,
      });
    }

    const finalResponse = response.choices[0].message.content || 'No pude procesar tu consulta.';
    addToHistory(phone, 'assistant', finalResponse);
    const webUrl = process.env.DOMAIN || 'https://atelierpoz.com';
    return {
      response: finalResponse,
      webButtonUrl: `${webUrl}/admin`,
      functionResults,
    };
  } catch (error) {
    console.error('[Groq] Error processStoreOwnerReceivablesOnly:', error);
    if (error.status === 429 || error.code === 'rate_limit_exceeded' || error.message?.includes('Rate limit')) {
      const userStoresForFallback = await getStoresWithUserIdByPhoneNumber(phone);
      const receivablesFallback = await generateReceivablesOnlySummary(userStoresForFallback);
      const response = receivablesFallback && receivablesFallback.trim()
        ? `${receivablesFallback}\n\n😅 Límite de mensajes por hoy alcanzado. Para más consultas usa el panel web 👇`
        : '😅 Límite de uso alcanzado. Por favor intenta en 24 horas o usa el panel web 👇';
      return {
        response,
        webButtonUrl: `${process.env.DOMAIN || 'https://atelierpoz.com'}/admin`,
        error: 'rate_limit_exceeded',
      };
    }
    return {
      response: '❌ Error procesando tu mensaje. Por favor intenta de nuevo o usa el panel web 👇',
      webButtonUrl: process.env.DOMAIN ? `${process.env.DOMAIN}/admin` : 'https://atelierpoz.com/admin',
      error: error.message,
    };
  }
}

/**
 * Genera solo resumen de cuentas por cobrar (para dueños de tienda cuando se acaban los tokens).
 */
async function generateReceivablesOnlySummary(userStores) {
  try {
    if (!userStores || userStores.length === 0) return '';
    const parts = [];
    for (const store of userStores) {
      const { storeId, storeName } = store;
      const all = await getReceivablesByStoreWithPayments(storeId);
      const pendientes = all.filter(r => r.status === 'pending');
      if (pendientes.length === 0) {
        parts.push(`💼 *${storeName}*\nNo tienes cuentas por cobrar pendientes.`);
        continue;
      }
      const cuentasList = pendientes.slice(0, 10).map(r => {
        const numero = r.receivableNumber || 'N/A';
        const cliente = r.customerName || 'Sin nombre';
        const pendiente = (parseFloat(r.amount || 0) - parseFloat(r.totalPaid || 0)).toFixed(2);
        const moneda = r.currency || 'USD';
        return `• Cuenta #${numero}: ${cliente} — Pendiente ${moneda} ${pendiente}`;
      }).join('\n');
      const totalPendiente = pendientes.reduce((sum, r) => sum + (parseFloat(r.amount || 0) - parseFloat(r.totalPaid || 0)), 0);
      const moneda = pendientes[0]?.currency || 'USD';
      let text = `💼 *CUENTAS POR COBRAR - ${storeName}*\n(${pendientes.length} cuenta(s) pendiente(s))\n\n${cuentasList}`;
      if (pendientes.length > 10) text += `\n...y ${pendientes.length - 10} más`;
      text += `\n\n📊 *Total a cobrar: ${moneda} ${totalPendiente.toFixed(2)}*`;
      parts.push(text);
    }
    return parts.join('\n\n');
  } catch (err) {
    console.error('[Groq] Error generateReceivablesOnlySummary:', err);
    return '';
  }
}

/**
 * Genera resumen de pedidos y cuentas cuando hay rate limit
 * Esto permite que el usuario tenga información útil incluso sin IA
 */
async function generateRateLimitSummary(userStores) {
  try {
    if (!userStores || userStores.length === 0) {
      return null;
    }

    const summaries = [];

    for (const store of userStores) {
      const { storeId, storeName } = store;

      // Obtener pedidos pendientes
      let pedidosText = '';
      try {
        const { requests } = await getRequestsByStore(storeId, { status: 'pending' });
        if (requests && requests.length > 0) {
          const pedidosList = requests.slice(0, 5).map(r => {
            const numero = r.order_number || 'N/A';
            const cliente = r.customer_name || 'Sin nombre';
            const telefono = r.customer_phone || 'Sin teléfono';
            const total = parseFloat(r.total || 0).toFixed(2);
            const moneda = r.currency || 'USD';
            const fecha = new Date(r.created_at).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });

            return `📦 *Pedido #${numero}*
👤 ${cliente}
📱 ${telefono}
💰 ${moneda} ${total}
📅 ${fecha}`;
          }).join('\n\n');

          pedidosText = `📋 *PEDIDOS PENDIENTES - ${storeName}*
(Mostrando ${Math.min(requests.length, 5)} de ${requests.length})

${pedidosList}`;

          if (requests.length > 5) {
            pedidosText += `\n\n...y ${requests.length - 5} pedido(s) más`;
          }
        }
      } catch (err) {
        console.error('[Groq] Error obteniendo pedidos para rate limit:', err);
      }

      // Obtener cuentas por cobrar pendientes
      let cuentasText = '';
      try {
        const all = await getReceivablesByStoreWithPayments(storeId);
        const pendientes = all.filter(r => r.status === 'pending');
        
        if (pendientes && pendientes.length > 0) {
          const cuentasList = pendientes.slice(0, 5).map(r => {
            const numero = r.receivableNumber || 'N/A';
            const cliente = r.customerName || 'Sin nombre';
            const telefono = r.customerPhone || 'Sin teléfono';
            const monto = parseFloat(r.amount || 0).toFixed(2);
            const pagado = parseFloat(r.totalPaid || 0).toFixed(2);
            const pendiente = (parseFloat(r.amount || 0) - parseFloat(r.totalPaid || 0)).toFixed(2);
            const moneda = r.currency || 'USD';
            const fecha = new Date(r.createdAt).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric'
            });

            return `💰 *Cuenta #${numero}*
👤 ${cliente}
📱 ${telefono}
💵 Total: ${moneda} ${monto}
✅ Pagado: ${moneda} ${pagado}
⏳ Pendiente: ${moneda} ${pendiente}
📅 ${fecha}`;
          }).join('\n\n');

          cuentasText = `💼 *CUENTAS POR COBRAR - ${storeName}*
(Mostrando ${Math.min(pendientes.length, 5)} de ${pendientes.length})

${cuentasList}`;

          if (pendientes.length > 5) {
            cuentasText += `\n\n...y ${pendientes.length - 5} cuenta(s) más`;
          }

          // Calcular total pendiente
          const totalPendiente = pendientes.reduce((sum, r) => {
            return sum + (parseFloat(r.amount || 0) - parseFloat(r.totalPaid || 0));
          }, 0);
          cuentasText += `\n\n📊 *TOTAL A COBRAR: ${pendientes[0]?.currency || 'USD'} ${totalPendiente.toFixed(2)}*`;
        }
      } catch (err) {
        console.error('[Groq] Error obteniendo cuentas para rate limit:', err);
      }

      if (pedidosText) summaries.push(pedidosText);
      if (cuentasText) summaries.push(cuentasText);
    }

    return summaries.length > 0 ? summaries : null;
  } catch (error) {
    console.error('[Groq] Error generando resumen de rate limit:', error);
    return null;
  }
}

/**
 * Limpia el historial de conversación para un número
 */
export function resetConversation(phone) {
  clearHistory(phone);
  return true;
}
