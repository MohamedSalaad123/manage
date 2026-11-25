import mongoose, { Schema, Document } from 'mongoose';

export interface IEmployee extends Document {
  fullName: string;
  employeeCode: string;
  phone: string;
  email: string;
  position: string;
  assignedWarehouseId?: mongoose.Types.ObjectId | null;
  userId?: mongoose.Types.ObjectId | null;
  status: 'Active' | 'On Leave' | 'Inactive';
  hireDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const employeeSchema = new Schema<IEmployee>(
  {
    fullName: { type: String, required: true, trim: true },
    employeeCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    position: { type: String, required: true, trim: true },
    assignedWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' },
    hireDate: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'employees' }
);

export const Employee =
  mongoose.models.Employee || mongoose.model<IEmployee>('Employee', employeeSchema);
