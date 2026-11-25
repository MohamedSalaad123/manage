import mongoose, { Schema, Document } from 'mongoose';

export type MovementType =
  | 'Opening Balance'
  | 'Stock In'
  | 'Stock Out'
  | 'Transfer In'
  | 'Transfer Out'
  | 'Adjustment In'
  | 'Adjustment Out'
  | 'Damaged Stock';

export interface IStockTransaction extends Document {
  transactionNumber: string;
  direction: 'IN' | 'OUT' | 'LEDGER';
  movementType: MovementType;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  ledgerPosted: boolean;
  warehouseId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  unit: string;
  unitCost: number;
  totalAmount: number;
  previousQuantity: number;
  quantityIn: number;
  quantityOut: number;
  newQuantity: number;
  supplierId?: mongoose.Types.ObjectId | null;
  invoiceNumber?: string;
  destinationCustomer?: string;
  referenceNumber?: string;
  reason?: string;
  notes?: string;
  attachmentUrl?: string;
  transactionDate: Date;
  performedBy: mongoose.Types.ObjectId;
  confirmedBy?: mongoose.Types.ObjectId | null;
  confirmedAt?: Date | null;
  relatedTransferId?: mongoose.Types.ObjectId | null;
  relatedAdjustmentId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const stockTransactionSchema = new Schema<IStockTransaction>(
  {
    transactionNumber: { type: String, required: true, unique: true, trim: true },
    direction: { type: String, enum: ['IN', 'OUT', 'LEDGER'], required: true },
    movementType: {
      type: String,
      enum: [
        'Opening Balance',
        'Stock In',
        'Stock Out',
        'Transfer In',
        'Transfer Out',
        'Adjustment In',
        'Adjustment Out',
        'Damaged Stock',
      ],
      required: true,
    },
    status: { type: String, enum: ['Draft', 'Confirmed', 'Cancelled'], default: 'Draft' },
    ledgerPosted: { type: Boolean, default: false },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, required: true, default: 'Piece' },
    unitCost: { type: Number, required: true, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    previousQuantity: { type: Number, default: 0 },
    quantityIn: { type: Number, default: 0 },
    quantityOut: { type: Number, default: 0 },
    newQuantity: { type: Number, default: 0 },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
    invoiceNumber: { type: String, default: '', trim: true },
    destinationCustomer: { type: String, default: '', trim: true },
    referenceNumber: { type: String, default: '', trim: true },
    reason: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    attachmentUrl: { type: String, default: '' },
    transactionDate: { type: Date, default: Date.now },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    relatedTransferId: { type: Schema.Types.ObjectId, ref: 'StockTransfer', default: null },
    relatedAdjustmentId: { type: Schema.Types.ObjectId, ref: 'StockAdjustment', default: null },
  },
  { timestamps: true, collection: 'stockTransactions' }
);

stockTransactionSchema.index({ warehouseId: 1, transactionDate: -1 });
stockTransactionSchema.index({ productId: 1, transactionDate: -1 });
stockTransactionSchema.index({ movementType: 1, status: 1 });

export const StockTransaction =
  mongoose.models.StockTransaction ||
  mongoose.model<IStockTransaction>('StockTransaction', stockTransactionSchema);
