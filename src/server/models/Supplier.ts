import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  supplierName: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: 'Active' | 'Inactive';
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    supplierName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    address: { type: String, default: '', trim: true },
    notes: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true, collection: 'suppliers' }
);

export const Supplier =
  mongoose.models.Supplier || mongoose.model<ISupplier>('Supplier', supplierSchema);
