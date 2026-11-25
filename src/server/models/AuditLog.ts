import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actorId?: mongoose.Types.ObjectId | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  warehouseId?: mongoose.Types.ObjectId | null;
  details: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: '' },
    entityRef: { type: String, default: '' },
    warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auditLogs' }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, action: 1 });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
