import jwt from 'jsonwebtoken';
import dbConnect from './db';
import { User } from '../models';
import mongoose from 'mongoose';

export async function verifyAuth(req) {
  await dbConnect();
  
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('No token provided. Please log in.');
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token.';
    throw new Error(msg);
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new Error('User not found.');
  }
  if (!user.isActive) {
    throw new Error('Account deactivated. Contact support.');
  }

  // Tenant Isolation logic
  const url = new URL(req.url);
  const queryTenantId = url.searchParams.get('tenantId');
  
  let tenantId = null;
  let tenantFilter = {};

  if (user.role === 'SUPER_ADMIN') {
    if (queryTenantId && mongoose.Types.ObjectId.isValid(queryTenantId)) {
      tenantId = new mongoose.Types.ObjectId(queryTenantId);
      tenantFilter = { ownerId: tenantId };
    }
  } else {
    tenantId = user._id;
    tenantFilter = { ownerId: user._id };
  }

  return {
    user,
    tenantId,
    tenantFilter
  };
}

export function getSuperAdminOrTenant(user, bodyTenantId) {
  if (user.role === 'SUPER_ADMIN') {
    if (bodyTenantId && mongoose.Types.ObjectId.isValid(bodyTenantId)) {
      const oid = new mongoose.Types.ObjectId(bodyTenantId);
      return { tenantId: oid, tenantFilter: { ownerId: oid } };
    }
    return { tenantId: null, tenantFilter: {} };
  }
  return { tenantId: user._id, tenantFilter: { ownerId: user._id } };
}

// Enterprise gate: Students (and Attendance, which is just a filtered view of
// Students, not a separate module) are available on every plan. Expenses,
// Stock/Inventory, and Ground Bookings require the ENTERPRISE plan.
// SUPER_ADMIN always has full access regardless of plan - that field doesn't
// apply to them.
export function hasEnterpriseAccess(user) {
  return user.role === 'SUPER_ADMIN' || user.subscriptionPlan === 'ENTERPRISE';
}
