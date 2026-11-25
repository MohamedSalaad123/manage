import mongoose from 'mongoose';
import {
  AuditLog,
  Notification,
  Product,
  Warehouse,
  CompanySettings,
  type NotificationType,
} from '../models';
import type { AuthUserContext } from '../middleware/auth';

export async function recordAuditLog(params: {
  actor?: AuthUserContext | { id?: string; fullName: string; role: string } | null;
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  warehouseId?: string | mongoose.Types.ObjectId | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
  session?: mongoose.ClientSession | null;
}) {
  const doc = {
    actorId: params.actor?.id && mongoose.Types.ObjectId.isValid(params.actor.id)
      ? new mongoose.Types.ObjectId(params.actor.id)
      : null,
    actorName: params.actor?.fullName || 'System',
    actorRole: params.actor?.role || 'SYSTEM',
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId || '',
    entityRef: params.entityRef || '',
    warehouseId: params.warehouseId || null,
    details: params.details || {},
    ipAddress: params.ipAddress || '',
  };

  if (params.session) {
    await AuditLog.create([doc], { session: params.session });
  } else {
    await AuditLog.create(doc);
  }
}

export async function createNotification(params: {
  type: NotificationType;
  title: string;
  titleSo: string;
  message: string;
  messageSo: string;
  warehouseId?: string | mongoose.Types.ObjectId | null;
  productId?: string | mongoose.Types.ObjectId | null;
  referenceNumber?: string;
  targetRoles?: string[];
  session?: mongoose.ClientSession | null;
}) {
  const doc = {
    type: params.type,
    title: params.title,
    titleSo: params.titleSo,
    message: params.message,
    messageSo: params.messageSo,
    warehouseId: params.warehouseId || null,
    productId: params.productId || null,
    referenceNumber: params.referenceNumber || '',
    targetRoles: params.targetRoles || [
      'SUPER_ADMIN',
      'GENERAL_MANAGER',
      'WAREHOUSE_MANAGER',
      'STOREKEEPER',
    ],
    readBy: [],
  };

  if (params.session) {
    await Notification.create([doc], { session: params.session });
  } else {
    await Notification.create(doc);
  }
}

export async function checkAndNotifyStockLevel(params: {
  productId: mongoose.Types.ObjectId | string;
  warehouseId: mongoose.Types.ObjectId | string;
  newAvailableQty: number;
  session?: mongoose.ClientSession | null;
}) {
  const settings = await CompanySettings.findOne({ singletonKey: 'PRIMARY' })
    .session(params.session || null)
    .lean();

  const notifyLow = settings?.notificationSettings?.lowStockAlerts ?? true;
  const notifyOut = settings?.notificationSettings?.outOfStockAlerts ?? true;
  if (!notifyLow && !notifyOut) return;

  const [product, warehouse] = await Promise.all([
    Product.findById(params.productId).session(params.session || null).lean(),
    Warehouse.findById(params.warehouseId).session(params.session || null).lean(),
  ]);

  if (!product || !warehouse) return;

  if (params.newAvailableQty <= 0 && notifyOut) {
    await createNotification({
      type: 'OUT_OF_STOCK',
      title: `Out of Stock: ${product.name}`,
      titleSo: `Kaydka wuu dhammaaday: ${product.name}`,
      message: `${product.name} (${product.sku}) is now out of stock in ${warehouse.name}.`,
      messageSo: `${product.name} (${product.sku}) wuu ka dhammaaday bakhaarka ${warehouse.name}.`,
      warehouseId: warehouse._id,
      productId: product._id,
      referenceNumber: product.sku,
      session: params.session,
    });
  } else if (params.newAvailableQty > 0 && params.newAvailableQty <= product.minStockLevel && notifyLow) {
    await createNotification({
      type: 'LOW_STOCK',
      title: `Low Stock Alert: ${product.name}`,
      titleSo: `Digniin Kayd Yar: ${product.name}`,
      message: `${product.name} (${product.sku}) in ${warehouse.name} dropped to ${params.newAvailableQty} ${product.unit} (Min: ${product.minStockLevel}).`,
      messageSo: `${product.name} (${product.sku}) ee bakhaarka ${warehouse.name} wuxuu marayaa ${params.newAvailableQty} ${product.unit} (Ugu yaraan: ${product.minStockLevel}).`,
      warehouseId: warehouse._id,
      productId: product._id,
      referenceNumber: product.sku,
      session: params.session,
    });
  }
}
