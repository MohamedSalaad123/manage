import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Pencil } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Modal } from '../components/ui/Modal';
import { StatusLabel } from '../components/ui/StatusLabel';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/ui/DataState';

interface EmployeeRow {
  _id: string;
  fullName: string;
  employeeCode: string;
  phone: string;
  email: string;
  position: string;
  assignedWarehouseId?: { _id: string; name: string; code: string } | null;
  userId?: {
    _id: string;
    username: string;
    role: string;
    accountStatus: 'Active' | 'Suspended' | 'Inactive';
  } | null;
}

export function EmployeesPage() {
  const { t, user, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ _id: string; name: string; code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    employeeCode: '',
    phone: '',
    email: '',
    position: '',
    assignedWarehouseId: '',
    username: '',
    password: '',
    role: 'STOREKEEPER',
    accountStatus: 'Active' as 'Active' | 'Suspended' | 'Inactive',
  });

  const canManage = hasPermission('EMPLOYEE_MANAGE');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : '';
      const [empRes, whRes] = await Promise.all([
        apiRequest<{ employees: EmployeeRow[] }>(`/api/employees${q}`),
        apiRequest<{ warehouses: Array<{ _id: string; name: string; code: string }> }>('/api/warehouses'),
      ]);
      setEmployees(empRes.employees);
      setWarehouses(whRes.warehouses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      fullName: '',
      employeeCode: `EMP-${String(employees.length + 2).padStart(4, '0')}`,
      phone: '',
      email: '',
      position: 'Storekeeper',
      assignedWarehouseId: user?.assignedWarehouseId || warehouses[0]?._id || '',
      username: '',
      password: '',
      role: 'STOREKEEPER',
      accountStatus: 'Active',
    });
    setFormOpen(true);
  };

  const openEdit = (emp: EmployeeRow) => {
    setEditing(emp);
    setForm({
      fullName: emp.fullName,
      employeeCode: emp.employeeCode,
      phone: emp.phone,
      email: emp.email,
      position: emp.position,
      assignedWarehouseId: emp.assignedWarehouseId?._id || '',
      username: emp.userId?.username || '',
      password: '',
      role: emp.userId?.role || 'STOREKEEPER',
      accountStatus: emp.userId?.accountStatus || 'Active',
    });
    setFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await apiRequest(`/api/employees/${editing._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: form.fullName,
            phone: form.phone,
            email: form.email,
            position: form.position,
            assignedWarehouseId: form.assignedWarehouseId || null,
            role: form.role,
            accountStatus: form.accountStatus,
            newPassword: form.password || '',
          }),
        });
        showSuccess('Employee account updated.');
      } else {
        await apiRequest('/api/employees', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            assignedWarehouseId: form.assignedWarehouseId || null,
          }),
        });
        showSuccess('Employee and user account created.');
      }
      setFormOpen(false);
      loadData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.common.search}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#245582] hover:bg-[#1B4368] rounded-md whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Employee & User</span>
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadData} />}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : employees.length === 0 ? (
          <EmptyState title={t.common.noData} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Employee ID</th>
                  <th className="text-left font-semibold px-4 py-3">Full Name</th>
                  <th className="text-left font-semibold px-4 py-3">Position</th>
                  <th className="text-left font-semibold px-4 py-3">Username</th>
                  <th className="text-left font-semibold px-4 py-3">Role</th>
                  <th className="text-left font-semibold px-4 py-3">Assigned Warehouse</th>
                  <th className="text-left font-semibold px-4 py-3">Phone</th>
                  <th className="text-left font-semibold px-4 py-3">{t.common.status}</th>
                  <th className="text-right font-semibold px-4 py-3">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp._id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-[#245582]">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{emp.fullName}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.position}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{emp.userId?.username || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {(emp.userId?.role || 'N/A').replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {emp.assignedWarehouseId?.name || 'All / Corporate HQ'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{emp.phone}</td>
                    <td className="px-4 py-3">
                      <StatusLabel status={emp.userId?.accountStatus || 'Active'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => openEdit(emp)}
                          className="p-1.5 text-slate-600 hover:text-[#245582] hover:bg-slate-100 rounded"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit Employee (${editing.employeeCode})` : 'Create Employee & User Account'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Employee ID</label>
              <input
                type="text"
                required
                disabled={Boolean(editing)}
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Position</label>
              <input
                type="text"
                required
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Warehouse</label>
              <select
                value={form.assignedWarehouseId}
                onChange={(e) => setForm({ ...form, assignedWarehouseId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">All Warehouses (Corporate)</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Username</label>
              <input
                type="text"
                required={!editing}
                disabled={Boolean(editing)}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {editing ? 'Reset Password (optional)' : 'Password (min 8 chars)'}
              </label>
              <input
                type="password"
                required={!editing}
                minLength={editing ? 0 : 8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">System Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                {user?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">SUPER ADMIN</option>}
                <option value="GENERAL_MANAGER">GENERAL MANAGER</option>
                <option value="WAREHOUSE_MANAGER">WAREHOUSE MANAGER</option>
                <option value="STOREKEEPER">STOREKEEPER</option>
                <option value="ACCOUNTANT">ACCOUNTANT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Status</label>
              <select
                value={form.accountStatus}
                onChange={(e) =>
                  setForm({ ...form, accountStatus: e.target.value as 'Active' | 'Suspended' | 'Inactive' })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-md"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold bg-[#245582] text-white rounded-md"
            >
              {saving ? '...' : t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
