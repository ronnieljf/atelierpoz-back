/**
 * Endpoint para WhatsApp Flows (data exchange).
 * Descifra el payload con la llave privada, procesa y devuelve respuesta cifrada.
 * Documentación: https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 *
 * - Lee private.key (opcional: FLOW_PRIVATE_KEY_PASSPHRASE si está cifrada)
 * - Lee meta.json → data[0].business_public_key (referencia; la respuesta se cifra con la misma clave AES e IV invertido)
 */

import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getStoreIdsByPhoneNumber } from '../services/storeService.js';
import { getReceivablesByStoreWithPayments } from '../services/receivableService.js';
import { getRequestsByStore } from '../services/requestService.js';

const TAG_LENGTH = 16;
const ROOT = process.cwd();
const PRIVATE_KEY_PATH = process.env.FLOW_PRIVATE_KEY_PATH || join(ROOT, 'private.key');
const META_JSON_PATH = process.env.FLOW_META_JSON_PATH || join(ROOT, 'meta.json');

let privateKeyPem = null;
let businessPublicKey = null;

function loadPrivateKey() {
  if (privateKeyPem) return privateKeyPem;
  const pem = readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const passphrase = process.env.FLOW_PRIVATE_KEY_PASSPHRASE || '';
  privateKeyPem = pem;
  return pem;
}

function getPrivateKey() {
  const pem = loadPrivateKey();
  const passphrase = process.env.FLOW_PRIVATE_KEY_PASSPHRASE || undefined;
  return crypto.createPrivateKey({
    key: pem,
    format: 'pem',
    type: 'pkcs1',
    passphrase: passphrase || undefined,
  });
}

function loadMetaJson() {
  if (businessPublicKey) return businessPublicKey;
  try {
    const raw = readFileSync(META_JSON_PATH, 'utf8');
    const meta = JSON.parse(raw);
    businessPublicKey = meta?.data?.[0]?.business_public_key || null;
    return businessPublicKey;
  } catch (e) {
    return null;
  }
}

/**
 * Descifra el body del Flow (encrypted_aes_key, encrypted_flow_data, initial_vector).
 * @returns {{ decryptedBody: object, aesKeyBuffer: Buffer, initialVectorBuffer: Buffer }}
 */
function decryptRequest(body) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body || {};
  if (!encrypted_aes_key || !encrypted_flow_data || !initial_vector) {
    throw new Error('Faltan encrypted_aes_key, encrypted_flow_data o initial_vector');
  }

  const key = getPrivateKey();
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');
  const encryptedBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv(
    'aes-128-gcm',
    decryptedAesKey,
    initialVectorBuffer
  );
  decipher.setAuthTag(authTag);
  const decryptedJSONString = Buffer.concat([
    decipher.update(encryptedBody),
    decipher.final(),
  ]).toString('utf-8');

  return {
    decryptedBody: JSON.parse(decryptedJSONString),
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
}

/**
 * Cifra la respuesta para Meta: IV invertido (flip bits), mismo AES key, AES-128-GCM.
 * La respuesta se devuelve en base64 (plain text).
 */
function encryptResponse(responseObject, aesKeyBuffer, initialVectorBuffer) {
  const flippedIv = Buffer.from(
    initialVectorBuffer.map((b) => b ^ 0xff)
  );
  const cipher = crypto.createCipheriv(
    'aes-128-gcm',
    aesKeyBuffer,
    flippedIv
  );
  const json = JSON.stringify(responseObject);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return encrypted.toString('base64');
}

/**
 * Construye la respuesta según action: ping, error notification o data exchange.
 * Si hay data.phone, opcionalmente consulta receivables/orders y los incluye en extension_message_response.params.
 */
async function buildFlowResponse(decryptedBody, aesKeyBuffer, initialVectorBuffer) {
  const { action, flow_token, data = {} } = decryptedBody;

  if (action === 'ping') {
    return encryptResponse(
      { data: { status: 'active' } },
      aesKeyBuffer,
      initialVectorBuffer
    );
  }

  if (action === 'data_exchange' && data?.error) {
    return encryptResponse(
      { data: { acknowledged: true } },
      aesKeyBuffer,
      initialVectorBuffer
    );
  }

  const phone = data?.phone || data?.telefono || data?.phone_number;
  let receivablesPayload = null;
  let ordersPayload = null;

  if (phone && String(phone).trim()) {
    const phoneStr = String(phone).trim().replace(/\D/g, '');
    if (phoneStr) {
      const stores = await getStoreIdsByPhoneNumber(phoneStr);
      const receivablesByStore = [];
      const ordersByStore = [];
      for (const { storeId, storeName } of stores) {
        const allRec = await getReceivablesByStoreWithPayments(storeId);
        const pending = allRec.filter((r) => r.status === 'pending').map((r) => ({
          id: r.id,
          receivableNumber: r.receivableNumber,
          customerName: r.customerName,
          amount: r.amount,
          currency: r.currency,
          totalPaid: r.totalPaid,
          pendingAmount: Math.max(0, r.amount - (r.totalPaid || 0)),
        }));
        receivablesByStore.push({ storeId, storeName, receivables: pending });
        const { requests } = await getRequestsByStore(storeId, { status: 'pending' });
        ordersByStore.push({
          storeId,
          storeName,
          orders: (requests || []).map((r) => ({
            id: r.id,
            orderNumber: r.order_number,
            customerName: r.customer_name,
            total: parseFloat(r.total),
            currency: r.currency || 'USD',
            createdAt: r.created_at,
          })),
        });
      }
      receivablesPayload = receivablesByStore;
      ordersPayload = ordersByStore;
    }
  }

  const params = {
    flow_token: flow_token || '',
    ...(receivablesPayload != null && { receivables: receivablesPayload }),
    ...(ordersPayload != null && { orders: ordersPayload }),
  };

  const responsePayload = {
    screen: 'SUCCESS',
    data: {
      extension_message_response: {
        params,
      },
    },
  };

  return encryptResponse(responsePayload, aesKeyBuffer, initialVectorBuffer);
}

/**
 * POST /api/flow
 * Body: { encrypted_flow_data, encrypted_aes_key, initial_vector }
 * Respuesta: body en texto plano (base64 del payload cifrado).
 */
export async function flowPost(req, res, next) {
  try {
    console.log('flowPost', req.body);
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).send('Bad Request');
    }

    let decrypted;
    try {
      decrypted = decryptRequest(body);
    } catch (err) {
      console.error('[flow] Decryption error:', err.message);
      return res.status(421).send('Decryption failed');
    }

    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decrypted;
    loadMetaJson();

    const encryptedResponse = await buildFlowResponse(
      decryptedBody,
      aesKeyBuffer,
      initialVectorBuffer
    );

    res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    res.status(200).send(encryptedResponse);
  } catch (err) {
    console.error('[flow] Error:', err);
    next(err);
  }
}
