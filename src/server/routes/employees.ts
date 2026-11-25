import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Employee, User } from '../models';
import {
  authenticate,
  requirePermission,
  canAccessAllWarehouses,
  assertWarehouseAccess,
} from '../middleware/auth';
import { runInTransaction } from '../config/db';
import { recordAuditLog } from '../services/auditService';
import { asyncHandler, escapeRegex, parseObjectId, safeString, validateBody } from '../utils/validation';

const router = Router();
router.use(authenticate);

const createEmployeeSchema = z.object({
  fullName: z.string().min(2).max(140),
  employeeCode: z.string().min(2).max(40),
  phone: z.string().min(3).max(40),
  email: z.string().email(),
  position: z.string().min(2).max(100),
  assignedWarehouseId: z.string().nullable().optional(),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128),
  role: z.enum(['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT']),
  accountStatus: z.enum(['Active', 'Suspended', 'Inactive']).optional().default('Active'),
});

const updateEmployeeSchema = z.object({
  fullName: z.string().min(2).max(140),
  phone: z.string().min(3).max(40),
  email: z.string().email(),
  position: z.string().min(2).max(100),
  assignedWarehouseId: z.string().nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER', 'STOREKEEPER', 'ACCOUNTANT']),
  accountStatus: z.enum(['Active', 'Suspended', 'Inactive']),
  newPassword: z.string().min(8).max(128).optional().or(z.literal('')),
});

router.get(
  '/',
  requirePermission('EMPLOYEE_MANAGE', 'WAREHOUSE_VIEW_ALL', 'INVENTORY_VIEW'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const search = safeString(req.query.search);
    const warehouseId = safeString(req.query.warehouseId);

    const filter: Record<string, unknown> = {};
    if (!canAccessAllWarehouses(user)) {
      if (!user.assignedWarehouseId) return res.json({ employees: [] });
      filter.assignedWarehouseId = parseObjectId(user.assignedWarehouseId, 'assignedWarehouseId');
    } else if (warehouseId && warehouseId !== 'ALL') {
      filter.assignedWarehouseId = parseObjectId(warehouseId, 'warehouseId');
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ fullName: rx }, { employeeCode: rx }, { position: rx }, { email: rx }];
    }

    const employees = await Employee.find(filter)
      .populate('assignedWarehouseId', 'name code location')
      .populate('userId', 'username role accountStatus lastLoginAt customPermissions')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ employees });
  })
);

router.post(
  '/',
  requirePermission('EMPLOYEE_MANAGE'),
  asyncHandler(async (req, res) => {
    const data = validateBody(createEmployeeSchema, req.body);

    if (data.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can create another Super Admin' });
    }

    const whId = data.assignedWarehouseId
      ? parseObjectId(data.assignedWarehouseId, 'assignedWarehouseId')
      : null;

    if (!canAccessAllWarehouses(req.user!)) {
      assertWarehouseAccess(req.user!, whId);
      if (['SUPER_ADMIN', 'GENERAL_MANAGER', 'ACCOUNTANT'].includes(data.role)) {
        return res.status(403).json({ error: 'Warehouse Managers can only assign Storekeeper or Warehouse roles' });
      }
    }

    const code = data.employeeCode.trim().toUpperCase();
    const username = data.username.trim().toLowerCase();
    const email = data.email.trim().toLowerCase();

    const [dupEmp, dupUser] = await Promise.all([
      Employee.findOne({ employeeCode: code }),
      User.findOne({ $or: [{ username }, { email }] }),
    ]);

    if (dupEmp) return res.status(409).json({ error: `Employee ID ${code} already exists` });
    if (dupUser) return res.status(409).json({ error: 'Username or email is already registered' });

    const passwordHash = await bcrypt.hash(data.password, 12);

    const created = await runInTransaction(async (session) => {
      const [userDoc] = await User.create(
        [
          {
            fullName: data.fullName.trim(),
            username,
            email,
            passwordHash,
            role: data.role,
            assignedWarehouseId: whId,
            accountStatus: data.accountStatus,
          },
        ],
        session ? { session } : undefined
      );

      const [empDoc] = await Employee.create(
        [
          {
            fullName: data.fullName.trim(),
            employeeCode: code,
            phone: data.phone.trim(),
            email,
            position: data.position.trim(),
            assignedWarehouseId: whId,
            userId: userDoc._id,
            status: data.accountStatus === 'Active' ? 'Active' : 'Inactive',
          },
        ],
        session ? { session } : undefined
      );

      userDoc.employeeId = empDoc._id;
      await userDoc.save(session ? { session } : undefined);

      await recordAuditLog({
        actor: req.user!,
        action: 'CREATE_EMPLOYEE',
        entityType: 'Employee',
        entityId: String(empDoc._id),
        entityRef: code,
        warehouseId: whId,
        details: { role: data.role, username },
        ipAddress: req.ip || '',
        session,
      });

      return empDoc;
    });

    res.status(201).json({ employee: created });
  })
);

router.put(
  '/:id',
  requirePermission('EMPLOYEE_MANAGE'),
  asyncHandler(async (req, res) => {
    const id = parseObjectId(req.params.id, 'employeeId');
    const data = validateBody(updateEmployeeSchema, req.body);

    const emp = await Employee.findById(id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    if (data.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Only Super Admin can assign Super Admin role' });
    }

    const whId = data.assignedWarehouseId
      ? parseObjectId(data.assignedWarehouseId, 'assignedWarehouseId')
      : null;

    if (!canAccessAllWarehouses(req.user!)) {
      assertWarehouseAccess(req.user!, emp.assignedWarehouseId);
      assertWarehouseAccess(req.user!, whId);
    }

    emp.fullName = data.fullName.trim();
    emp.phone = data.phone.trim();
    emp.email = data.email.trim().toLowerCase();
    emp.position = data.position.trim();
    emp.assignedWarehouseId = whId;
    emp.status = data.accountStatus === 'Active' ? 'Active' : 'Inactive';
    await emp.save();

    if (emp.userId) {
      const userUpdate: Record<string, unknown> = {
        fullName: emp.fullName,
        email: emp.email,
        role: data.role,
        assignedWarehouseId: whId,
        accountStatus: data.accountStatus,
      };
      if (data.newPassword) {
        userUpdate.passwordHash = await bcrypt.hash(data.newPassword, 12);
      }
      await User.findByIdAndUpdate(emp.userId, userUpdate);
    }

    await recordAuditLog({
      actor: req.user!,
      action: 'UPDATE_EMPLOYEE',
      entityType: 'Employee',
      entityId: String(emp._id),
      entityRef: emp.employeeCode,
      warehouseId: whId,
      details: { role: data.role, accountStatus: data.accountStatus },
      ipAddress: req.ip || '',
    });

    res.json({ employee: emp });
  })
);

export default router;
