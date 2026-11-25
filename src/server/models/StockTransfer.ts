import mongoose, { Schema, Document } from 'mongoose';

export type TransferStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'In Transit'
  | 'Partially Received'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

export interface IReceiptLog {
  receivedQty: number;
  damagedQty: number;
  missingQty: number;
  notes?: string;
  receivedBy: mongoose.Types.ObjectId;
  receivedAt: Date;
}

export interface IStockTransfer extends Document {
  transferNumber: string;
  sourceWarehouseId: mongoose.Types.ObjectId;
  destinationWarehouseId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  dispatchedQuantity: number;
  receivedQuantity: number;
  damagedQuantity: number;
  missingQuantity: number;
  unitCostAtDispatch: number;
  transferDate: Date;
  status: TransferStatus;
  requestedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  dispatchedBy?: mongoose.Types.ObjectId | null;
  dispatchedAt?: Date | null;
  receivedBy?: mongoose.Types.ObjectId | null;
  completedAt?: Date | null;
  rejectionReason?: string;
  notes?: string;
  receiptLogs: IReceiptLog[];
  createdAt: Date;
  updatedAt: Date;
}

const receiptLogSchema = new Schema<IReceiptLog>(
  {
    receivedQty: { type: Number, required: true, min: 0 },
    damagedQty: { type: Number, default: 0, min: 0 },
    missingQty: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const stockTransferSchema = new Schema<IStockTransfer>(
  {
    transferNumber: { type: String, required: true, unique: true, trim: true },
    sourceWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    destinationWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    dispatchedQuantity: { type: Number, default: 0, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    damagedQuantity: { type: Number, default: 0, min: 0 },
    missingQuantity: { type: Number, default: 0, min: 0 },
    unitCostAtDispatch: { type: Number, default: 0, min: 0 },
    transferDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: [
        'Draft',
        'Pending Approval',
        'Approved',
        'In Transit',
        'Partially Received',
        'Completed',
        'Rejected',
        'Cancelled',
      ],
      default: 'Pending Approval',
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    dispatchedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dispatchedAt: { type: Date, default: null },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    notes: { type: String, default: '' },
    receiptLogs: { type: [receiptLogSchema], default: [] },
  },
  { timestamps: true, collection: 'stockTransfers' }
);

stockTransferSchema.index({ sourceWarehouseId: 1, destinationWarehouseId: 1, status: 1 });

export const StockTransfer =
  mongoose.models.StockTransfer ||
  mongoose.model<IStockTransfer>('StockTransfer', stockTransferSchema);
