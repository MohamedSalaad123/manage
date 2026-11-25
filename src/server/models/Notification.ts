import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType =
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'TRANSFER_REQUEST'
  | 'TRANSFER_APPROVED'
  | 'TRANSFER_REJECTED'
  | 'TRANSFER_RECEIVED'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_COUNT_APPROVED';

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  titleSo: string;
  message: string;
  messageSo: string;
  warehouseId?: mongoose.Types.ObjectId | null;
  productId?: mongoose.Types.ObjectId | null;
  referenceNumber?: string;
  targetRoles: string[];
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    type: {
      type: String,
      enum: [
        'LOW_STOCK',
        'OUT_OF_STOCK',
        'STOCK_IN',
        'STOCK_OUT',
        'TRANSFER_REQUEST',
        'TRANSFER_APPROVED',
        'TRANSFER_REJECTED',
        'TRANSFER_RECEIVED',
        'STOCK_ADJUSTMENT',
        'STOCK_COUNT_APPROVED',
      ],
      required: true,
    },
    title: { type: String, required: true },
    titleSo: { type: String, required: true },
    message: { type: String, required: true },
    messageSo: { type: String, required: true },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    referenceNumber: { type: String, default: '' },
    targetRoles: { type: [String], default: ['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER'] },
    readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true, collection: 'notifications' }
);

notificationSchema.index({ createdAt: -1 });

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', notificationSchema);
