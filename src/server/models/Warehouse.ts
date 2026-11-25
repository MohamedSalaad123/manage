import mongoose, { Schema, Document } from 'mongoose';

export interface IWarehouse extends Document {
  name: string;
  code: string;
  location: string;
  address: string;
  managerId?: mongoose.Types.ObjectId | null;
  phone: string;
  description: string;
  status: 'Active' | 'Inactive';
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouse>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    location: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    phone: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'warehouses' }
);

export const Warehouse =
  mongoose.models.Warehouse || mongoose.model<IWarehouse>('Warehouse', warehouseSchema);
