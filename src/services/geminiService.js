/**
 * Servicio de Gemini AI para WhatsApp conversacional.
 * Maneja conversaciones inteligentes y ejecuta acciones en el sistema.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getStoresWithUserIdByPhoneNumber } from './storeService.js';
import { getRequestsByStore, updateRequestStatus, getRequestByStoreAndOrderNumber } from './requestService.js';
import { 
  getReceivablesByStoreWithPayments, 
  createReceivableFromRequest,
  createReceivablePayment,
  updateReceivable,
  getReceivableByStoreAndReceivableNumber 
} from './receivableService.js';
import { getProductsByStore } from './productService.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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
  history.push({ role, parts: [{ text: content }] });
  
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
 * Define las funciones disponibles para Gemini (function calling)
 */
const functions = [
  {
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
  {
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
  {
    name: 'convertir_pedido_a_cuenta',
    description: 'Convierte un pedido en cuenta por cobrar.',
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
  {
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
  {
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
  {
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
  {
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
  {
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
];

/**
 * Ejecuta una función llamada por Gemini
 */
async function executeFunction(functionName, args, userStores) {
  console.log(`[Gemini] Ejecutando función: ${functionName}`, args);
  
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
        
        return {
          success: true,
          storeName: store.storeName,
          total: filtered.length,
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
      
      default:
        throw new Error(`Función ${functionName} no implementada`);
    }
  } catch (error) {
    console.error(`[Gemini] Error ejecutando ${functionName}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Procesa un mensaje usando Gemini AI
 */
export async function processMessageWithGemini(phone, messageText) {
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
    const systemInstruction = `Eres un asistente de WhatsApp para Atelier Poz. El usuario ${phone} administra estas tiendas:
${storesContext}

🔴 REGLA CRÍTICA - SIEMPRE USA LAS FUNCIONES DISPONIBLES:
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

FUNCIONES DISPONIBLES:
📦 consultar_pedidos - Ver pedidos de la tienda
💰 consultar_cuentas_por_cobrar - Ver cuentas pendientes
🛍️ consultar_productos - Ver catálogo
✅ convertir_pedido_a_cuenta - Convertir pedido en cuenta
💵 registrar_abono - Registrar pago
✓ marcar_cuenta_cobrada - Marcar como cobrada
❌ cancelar_cuenta - Cancelar cuenta
🔄 cambiar_estado_pedido - Cambiar estado

PERSONALIDAD:
- Amigable y conversacional
- Usa emojis con moderación  
- Respuestas cortas para WhatsApp
- Presenta los datos de forma clara y organizada

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
Para acciones importantes (cancelar, marcar cobrada), confirma antes de ejecutar.`;

    // Crear modelo con function calling
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction,
      tools: [{ functionDeclarations: functions }],
    });

    // Iniciar chat con historial
    const chat = model.startChat({
      history,
    });

    // Enviar mensaje del usuario
    let result = await chat.sendMessage(messageText);
    
    // Guardar mensaje del usuario en historial
    addToHistory(phone, 'user', messageText);
    
    // Procesar respuesta y function calls
    let finalResponse = '';
    let functionResults = [];
    
    // Manejar function calls iterativamente
    while (result.response.functionCalls && result.response.functionCalls.length > 0) {
      const functionCall = result.response.functionCalls[0];
      const { name, args } = functionCall;
      
      console.log(`[Gemini] Function call: ${name}`, args);
      
      // Ejecutar función
      const functionResult = await executeFunction(name, args, userStores);
      functionResults.push({ name, result: functionResult });
      
      // Enviar resultado de vuelta a Gemini
      result = await chat.sendMessage([{
        functionResponse: {
          name,
          response: functionResult,
        },
      }]);
    }
    
    // Obtener respuesta final de texto
    finalResponse = result.response.text();
    
    // Guardar respuesta del asistente en historial
    addToHistory(phone, 'model', finalResponse);
    
    // Generar URL del botón web si corresponde
    let webButtonUrl = null;
    if (functionResults.length > 0) {
      // Si ejecutó alguna función, ofrecer ir al admin
      const webUrl = process.env.DOMAIN || 'https://atelierpoz.com';
      webButtonUrl = `${webUrl}/admin`;
    }
    
    return {
      response: finalResponse,
      webButtonUrl,
      functionResults,
    };
    
  } catch (error) {
    console.error('[Gemini] Error procesando mensaje:', error);
    
    // En caso de error, intentar recuperar con respuesta básica
    return {
      response: '❌ Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo o escribe "ayuda" para ver los comandos disponibles.',
      webButtonUrl: null,
      error: error.message,
    };
  }
}

/**
 * Limpia el historial de conversación para un número
 */
export function resetConversation(phone) {
  clearHistory(phone);
  return true;
}
