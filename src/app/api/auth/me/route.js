import { NextResponse } from 'next/server';
import { verifyAuth } from '../../../../lib/auth';

export async function GET(req) {
  try {
    const { user } = await verifyAuth(req);
    return NextResponse.json(user.toJSON());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.message.includes('token') || err.message.includes('Session') ? 401 : 403 });
  }
}

export async function PUT(req) {
  try {
    const { user } = await verifyAuth(req);
    const { name, academyName, settings } = await req.json();

    if (name !== undefined) user.name = name;
    if (academyName !== undefined) user.academyName = academyName;

    // Patch, don't replace: the UI sends only the keys it changed.
    if (settings && typeof settings === 'object') {
      const current = user.settings ? user.settings.toObject() : {};
      user.settings = { ...current, ...settings };
    }

    await user.save();
    return NextResponse.json(user.toJSON());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}