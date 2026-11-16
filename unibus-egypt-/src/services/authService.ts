import {
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { StaffInvite, User } from '../types';
import {
  COLLECTIONS,
  DEFAULT_COMPANY_ID,
  emailToInviteId,
  normalizePhoneDigits,
  phoneToUserId,
  syncPhoneDirectoryEntry
} from './firestoreDb';
import { normalizeArabicText } from '../utils/arabicSearch';

export interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: User | null;
  loading: boolean;
  error: string | null;
  requiresConsoleSetup: boolean;
}

export interface SavedPhoneSession {
  userId: string;
  phone: string;
  name: string;
  companyId: string;
  role: User['role'];
  status: User['status'];
  isGeneralSupervisor?: boolean;
  universityId?: string;
  lineId?: string;
  stationId?: string;
  assignedBusId?: string;
  savedAt: string;
}

const BOOTSTRAP_OWNER_EMAIL = 'khaled5ber5@gmail.com';
const SAVED_PHONE_SESSION_KEY = 'unibus_saved_phone_session_v1';

function stripUndefinedProps<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

export function savePhoneSessionLocally(
  user: Pick<User, 'id' | 'phone' | 'name' | 'companyId'> &
    Partial<Pick<User, 'role' | 'status' | 'isGeneralSupervisor' | 'universityId' | 'lineId' | 'stationId' | 'assignedBusId'>>
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: SavedPhoneSession = stripUndefinedProps({
      userId: user.id,
      phone: normalizePhoneDigits(user.phone) || user.phone,
      name: user.name,
      companyId: user.companyId || DEFAULT_COMPANY_ID,
      role: user.role || 'student',
      status: user.status || 'pending_approval',
      isGeneralSupervisor: user.isGeneralSupervisor,
      universityId: user.universityId,
      lineId: user.lineId,
      stationId: user.stationId,
      assignedBusId: user.assignedBusId,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(SAVED_PHONE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
}

export function getSavedPhoneSession(): SavedPhoneSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_PHONE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPhoneSession;
    if (!parsed?.userId || !parsed?.phone) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedPhoneSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SAVED_PHONE_SESSION_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Checks if a Google-signed-in user has a pending StaffInvite in Firestore.
 */
export async function claimPendingStaffInviteIfAny(
  fbUser: FirebaseUser,
  existingProfile?: User | null
): Promise<User | null> {
  const email = fbUser.email?.trim();
  if (!email) return null;
  if (email.toLowerCase() === BOOTSTRAP_OWNER_EMAIL) return null;

  const inviteId = emailToInviteId(email);
  const inviteRef = doc(db, COLLECTIONS.STAFF_INVITES, inviteId);

  try {
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) return null;

    const invite = inviteSnap.data() as StaffInvite;
    if (invite.status !== 'pending') return null;

    const claimedProfile: User = stripUndefinedProps({
      ...(existingProfile || {}),
      id: fbUser.uid,
      companyId: invite.companyId,
      name: invite.name || existingProfile?.name || fbUser.displayName || email.split('@')[0],
      phone: invite.phone || existingProfile?.phone || fbUser.phoneNumber || '01000000000',
      email,
      role: invite.role,
      isGeneralSupervisor: invite.isGeneralSupervisor,
      status: 'active',
      universityId: invite.universityId ?? existingProfile?.universityId,
      lineId: invite.lineId ?? existingProfile?.lineId,
      stationId: invite.stationId ?? existingProfile?.stationId,
      assignedBusId: invite.assignedBusId ?? existingProfile?.assignedBusId,
    });

    await setDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), claimedProfile, { merge: true });
    await syncPhoneDirectoryEntry(claimedProfile).catch(() => {});

    if (invite.preProvisionedDriverId) {
      try {
        await updateDoc(doc(db, COLLECTIONS.DRIVERS, invite.preProvisionedDriverId), {
          userId: fbUser.uid,
        });
      } catch (e) {
        console.warn('Could not link pre-provisioned driver doc:', e);
      }
    }

    if (invite.preProvisionedUserId && invite.preProvisionedUserId !== fbUser.uid) {
      try {
        await deleteDoc(doc(db, COLLECTIONS.USERS, invite.preProvisionedUserId));
      } catch (e) {
        console.warn('Could not remove temp pre-provisioned user doc:', e);
      }
    }

    await updateDoc(inviteRef, {
      status: 'claimed',
      claimedAt: new Date().toISOString(),
      claimedByUid: fbUser.uid,
    });

    return claimedProfile;
  } catch (err) {
    console.warn('claimPendingStaffInviteIfAny notice:', err);
    return null;
  }
}

/**
 * Signs in Platform Owner (khaled5ber5@gmail.com) and Google-invited Admins/Supervisors
 * using Google OAuth Popup.
 */
export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const userDocRef = doc(db, COLLECTIONS.USERS, cred.user.uid);
  const userSnap = await getDoc(userDocRef);
  const isBootstrapOwner = (cred.user.email || '').toLowerCase() === BOOTSTRAP_OWNER_EMAIL;
  const existing = userSnap.exists() ? ({ ...userSnap.data(), id: cred.user.uid } as User) : null;

  if (isBootstrapOwner) {
    if (!existing || existing.role !== 'super_admin' || existing.status !== 'active') {
      const upgraded: User = {
        id: cred.user.uid,
        companyId: existing?.companyId || DEFAULT_COMPANY_ID,
        name: existing?.name || cred.user.displayName || 'مالك المنصة',
        phone: existing?.phone || cred.user.phoneNumber || '01000000000',
        email: cred.user.email || '',
        role: 'super_admin',
        status: 'active',
      };
      await setDoc(userDocRef, upgraded, { merge: true });
      await syncPhoneDirectoryEntry(upgraded).catch(() => {});
      return upgraded;
    }
    return existing;
  }

  const claimed = await claimPendingStaffInviteIfAny(cred.user, existing);
  if (claimed) return claimed;

  if (existing) return existing;

  const newProfile: User = {
    id: cred.user.uid,
    companyId: DEFAULT_COMPANY_ID,
    name: cred.user.displayName || cred.user.email?.split('@')[0] || 'مستخدم Google',
    phone: cred.user.phoneNumber || '01000000000',
    email: cred.user.email || '',
    role: 'student',
    status: 'pending_approval'
  };

  await setDoc(userDocRef, newProfile, { merge: true });
  return newProfile;
}

/**
 * Registers a new account using ONLY Name + Phone Number (no email/password required).
 * Enforces pending_approval until approved by Supervisor or Company Admin.
 * Saves session locally so user stays signed in across visits.
 */
export async function registerWithPhoneAndName(data: {
  name: string;
  phone: string;
  role?: 'student' | 'driver' | 'supervisor';
  email?: string;
  licenseNumber?: string;
  universityId?: string;
  lineId?: string;
  stationId?: string;
  companyId?: string;
}): Promise<{ user: User; alreadyExisted: boolean }> {
  const cleanName = data.name.trim();
  const digits = normalizePhoneDigits(data.phone);

  if (cleanName.length < 2) {
    throw new Error('يرجى إدخال الاسم بالكامل (حرفان على الأقل).');
  }
  if (digits.length < 8 || digits.length > 15) {
    throw new Error('يرجى إدخال رقم هاتف صحيح (8 إلى 15 رقماً).');
  }

  const phoneUserId = phoneToUserId(digits);

  // Check if phone is already registered (either in phoneDirectory or deterministic phone_ doc)
  const dirRef = doc(db, COLLECTIONS.PHONE_DIRECTORY, digits);
  const dirSnap = await getDoc(dirRef).catch(() => null);

  if (dirSnap && dirSnap.exists()) {
    const dirData = dirSnap.data() as { userId: string; companyId: string; name: string; phone: string; role: User['role']; status: User['status'] };
    const userRef = doc(db, COLLECTIONS.USERS, dirData.userId);
    const userSnap = await getDoc(userRef).catch(() => null);
    if (userSnap && userSnap.exists()) {
      const existingUser = { ...userSnap.data(), id: userSnap.id } as User;
      savePhoneSessionLocally(existingUser);
      return { user: existingUser, alreadyExisted: true };
    }
  }

  const deterministicUserRef = doc(db, COLLECTIONS.USERS, phoneUserId);
  const existingDetSnap = await getDoc(deterministicUserRef).catch(() => null);
  if (existingDetSnap && existingDetSnap.exists()) {
    const existingUser = { ...existingDetSnap.data(), id: existingDetSnap.id } as User;
    savePhoneSessionLocally(existingUser);
    return { user: existingUser, alreadyExisted: true };
  }

  const targetCompanyId = data.companyId || DEFAULT_COMPANY_ID;
  const requestedRole: 'student' | 'driver' | 'supervisor' =
    data.role === 'driver' || data.role === 'supervisor' ? data.role : 'student';

  const newProfile: User = stripUndefinedProps({
    id: phoneUserId,
    companyId: targetCompanyId,
    name: cleanName,
    phone: digits,
    email: data.email?.trim() || '',
    role: requestedRole, // LOCKED to student/driver/supervisor by firestore.rules
    status: 'pending_approval', // LOCKED by firestore.rules until Supervisor/Admin approves
    universityId: requestedRole === 'student' ? data.universityId || undefined : undefined,
    lineId: requestedRole === 'student' ? data.lineId || undefined : undefined,
    stationId: requestedRole === 'student' ? data.stationId || undefined : undefined,
  });

  await setDoc(deterministicUserRef, newProfile);
  await setDoc(dirRef, {
    id: digits,
    userId: phoneUserId,
    companyId: targetCompanyId,
    name: cleanName,
    phone: digits,
    role: requestedRole,
    status: 'pending_approval',
    isGeneralSupervisor: false,
  });

  savePhoneSessionLocally(newProfile);
  return { user: newProfile, alreadyExisted: false };
}

/**
 * Signs in once using Phone Number + Name (no email required) and persists session locally.
 */
export async function loginWithPhoneAndName(phone: string, nameInput: string): Promise<User> {
  const digits = normalizePhoneDigits(phone);
  const cleanInputName = normalizeArabicText(nameInput);

  if (digits.length < 8 || digits.length > 15) {
    throw new Error('يرجى إدخال رقم هاتف صحيح.');
  }
  if (cleanInputName.length < 2) {
    throw new Error('يرجى إدخال الاسم المسجل.');
  }

  let resolvedUser: User | null = null;

  // 1. Check phoneDirectory first (supports users added by Admin/Supervisor/SuperAdmin as well as self-registered)
  const dirSnap = await getDoc(doc(db, COLLECTIONS.PHONE_DIRECTORY, digits)).catch(() => null);
  if (dirSnap && dirSnap.exists()) {
    const dirData = dirSnap.data() as {
      userId: string;
      companyId: string;
      name: string;
      phone: string;
      role: User['role'];
      status: User['status'];
      isGeneralSupervisor?: boolean;
    };
    const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, dirData.userId)).catch(() => null);
    if (userSnap && userSnap.exists()) {
      resolvedUser = { ...userSnap.data(), id: userSnap.id } as User;
    } else {
      resolvedUser = {
        id: dirData.userId,
        companyId: dirData.companyId || DEFAULT_COMPANY_ID,
        name: dirData.name,
        phone: dirData.phone || digits,
        email: '',
        role: dirData.role || 'student',
        status: dirData.status || 'pending_approval',
        isGeneralSupervisor: dirData.isGeneralSupervisor,
      };
    }
  }

  // 2. Fallback to deterministic phone_<digits> user doc
  if (!resolvedUser) {
    const detSnap = await getDoc(doc(db, COLLECTIONS.USERS, phoneToUserId(digits))).catch(() => null);
    if (detSnap && detSnap.exists()) {
      resolvedUser = { ...detSnap.data(), id: detSnap.id } as User;
    }
  }

  if (!resolvedUser) {
    throw new Error('لم يُعثر على حساب مسجل بهذا الرقم. اختر «حساب جديد» للتسجيل برقم الهاتف والاسم.');
  }

  // Verify name matches registered account name (token or substring overlap in Arabic)
  const storedNorm = normalizeArabicText(resolvedUser.name);
  const inputTokens = cleanInputName.split(' ').filter(Boolean);
  const nameMatches =
    storedNorm === cleanInputName ||
    storedNorm.includes(cleanInputName) ||
    cleanInputName.includes(storedNorm) ||
    inputTokens.every(tok => storedNorm.includes(tok));

  if (!nameMatches) {
    throw new Error('الاسم المدخل لا يطابق الاسم المسجل لهذا الرقم. تأكد من كتابة الاسم بشكل صحيح.');
  }

  savePhoneSessionLocally(resolvedUser);
  return resolvedUser;
}

/**
 * Restores a previously saved 1-time Phone + Name session on reload.
 */
export async function restoreSavedPhoneUser(): Promise<User | null> {
  const saved = getSavedPhoneSession();
  if (!saved) return null;

  try {
    const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, saved.userId));
    if (userSnap.exists()) {
      const fresh = { ...userSnap.data(), id: userSnap.id } as User;
      savePhoneSessionLocally(fresh);
      return fresh;
    }

    const dirSnap = await getDoc(doc(db, COLLECTIONS.PHONE_DIRECTORY, normalizePhoneDigits(saved.phone)));
    if (dirSnap.exists()) {
      const dirData = dirSnap.data() as {
        userId: string;
        companyId: string;
        name: string;
        phone: string;
        role: User['role'];
        status: User['status'];
        isGeneralSupervisor?: boolean;
      };
      const targetSnap = await getDoc(doc(db, COLLECTIONS.USERS, dirData.userId));
      if (targetSnap.exists()) {
        const fresh = { ...targetSnap.data(), id: targetSnap.id } as User;
        savePhoneSessionLocally(fresh);
        return fresh;
      }
      return {
        id: dirData.userId,
        companyId: dirData.companyId || DEFAULT_COMPANY_ID,
        name: dirData.name,
        phone: dirData.phone,
        email: '',
        role: dirData.role,
        status: dirData.status,
        isGeneralSupervisor: dirData.isGeneralSupervisor,
      };
    }

    // Account was removed/rejected by supervisor
    clearSavedPhoneSession();
    return null;
  } catch {
    // Offline fallback: return cached user role/status so Drivers/Users stay on their working view offline
    return stripUndefinedProps({
      id: saved.userId,
      companyId: saved.companyId || DEFAULT_COMPANY_ID,
      name: saved.name,
      phone: saved.phone,
      email: '',
      role: saved.role || 'student',
      status: saved.status || 'pending_approval',
      isGeneralSupervisor: saved.isGeneralSupervisor,
      universityId: saved.universityId,
      lineId: saved.lineId,
      stationId: saved.stationId,
      assignedBusId: saved.assignedBusId,
    });
  }
}

/**
 * Signs out current user from Firebase Auth and clears local saved phone session.
 */
export async function logoutUser(): Promise<void> {
  clearSavedPhoneSession();
  localStorage.removeItem('unibus_saved_role');
  try {
    await signOut(auth);
  } catch {
    // Ignore if signed in purely via phone session
  }
}
