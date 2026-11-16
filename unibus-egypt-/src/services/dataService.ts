import {
  University,
  Line,
  Station,
  Bus,
  Driver,
  TripTemplate,
  User,
  Trip,
  UserRole
} from '../types';

export class DataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataValidationError';
  }
}

export const dataService = {
  // ==========================================
  // 1. UNIVERSITIES MANAGEMENT
  // ==========================================
  validateUniversity(data: Partial<University>, existing: University[], currentId?: string) {
    if (!data.nameAr || !data.nameAr.trim()) {
      throw new DataValidationError('اسم الجامعة باللغة العربية مطلوب إلزامي.');
    }
    if (!data.city || !data.city.trim()) {
      throw new DataValidationError('المدينة أو النطاق الجغرافي مطلوب.');
    }
    const duplicate = existing.find(
      u => u.id !== currentId && u.nameAr.trim().toLowerCase() === data.nameAr?.trim().toLowerCase()
    );
    if (duplicate) {
      throw new DataValidationError('توجد جامعة مسجلة مسبقاً بنفس الاسم.');
    }
  },

  canDeleteUniversity(uniId: string, lines: Line[], trips: Trip[], users: User[]): { canDelete: boolean; reason?: string } {
    const linkedLines = lines.filter(l => l.universityId === uniId);
    if (linkedLines.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف الجامعة لارتباطها بـ (${linkedLines.length}) خطوط سير نشطة. يرجى حذف أو إعادة تعيين الخطوط أولاً، أو إيقاف تفعيل الجامعة بدلاً من حذفها.`
      };
    }

    const linkedTrips = trips.filter(t => t.universityId === uniId);
    if (linkedTrips.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف الجامعة لوجود (${linkedTrips.length}) رحلات سابقة مسجلة باسمها في الأرشيف التشغيلي.`
      };
    }

    const linkedStudents = users.filter(u => u.universityId === uniId);
    if (linkedStudents.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف الجامعة لوجود (${linkedStudents.length}) طلاب مسجلين تابعين لها.`
      };
    }

    return { canDelete: true };
  },

  // ==========================================
  // 2. BUSES MANAGEMENT
  // ==========================================
  validateBus(data: Partial<Bus>, existing: Bus[], currentId?: string) {
    if (!data.plateNumber || !data.plateNumber.trim()) {
      throw new DataValidationError('رقم اللوحة المعدنية للباص مطلوب.');
    }
    if (!data.code || !data.code.trim()) {
      throw new DataValidationError('كود الباص الداخلي (مثل BUS-101) مطلوب.');
    }
    if (!data.capacity || Number(data.capacity) <= 0) {
      throw new DataValidationError('السعة القصوى للباص يجب أن تكون أكبر من صفر.');
    }

    // Check unique plate number
    const dupPlate = existing.find(
      b => b.id !== currentId && b.plateNumber.trim() === data.plateNumber?.trim()
    );
    if (dupPlate) {
      throw new DataValidationError(`رقم اللوحة (${data.plateNumber}) مسجل مسبقاً لباص آخر.`);
    }

    // Check unique bus code
    const dupCode = existing.find(
      b => b.id !== currentId && b.code?.trim().toUpperCase() === data.code?.trim().toUpperCase()
    );
    if (dupCode) {
      throw new DataValidationError(`كود الباص (${data.code}) مكرر، يرجى استخدام كود فريد.`);
    }
  },

  validateCapacityReduction(bus: Bus, newCapacity: number, trips: Trip[]) {
    // Check active / scheduled trips using this bus
    const activeTripsWithBus = trips.filter(
      t => t.busId === bus.id && (t.status === 'in_progress' || t.status === 'scheduled')
    );

    for (const trip of activeTripsWithBus) {
      const bookedOrBoarded = trip.manifest.filter(
        m => m.rsvpStatus === 'confirmed' || m.boardedStatus === 'boarded'
      ).length;

      if (newCapacity < bookedOrBoarded) {
        throw new DataValidationError(
          `لا يمكن تقليل سعة الباص إلى (${newCapacity}) مقاعد، لأن الرحلة النشطة (${trip.code}) محجوز بها حالياً (${bookedOrBoarded}) ركاب. تقليل السعة سيتسبب في ترك طلاب بلا مقاعد.`
        );
      }
    }
  },

  canDeleteBus(busId: string, trips: Trip[]): { canDelete: boolean; reason?: string } {
    const linkedTrips = trips.filter(t => t.busId === busId);
    if (linkedTrips.length > 0) {
      return {
        canDelete: false,
        reason: `منع أمان النظام: لا يمكن حذف الباص لارتباطه بـ (${linkedTrips.length}) رحلات سابقة أو مجدولة. يُرجى تغيير حالته التشغيلية إلى "إيقاف / صيانة" للحفاظ على سلامة السجلات التاريخية.`
      };
    }
    return { canDelete: true };
  },

  // ==========================================
  // 3. ROUTES & STATIONS MANAGEMENT
  // ==========================================
  validateRoute(data: Partial<Line>, existing: Line[], currentId?: string) {
    if (!data.nameAr || !data.nameAr.trim()) {
      throw new DataValidationError('اسم خط السير مطلوب.');
    }
    if (!data.universityId) {
      throw new DataValidationError('يجب اختيار الجامعة المرتبطة بهذا الخط.');
    }
    if (!data.code || !data.code.trim()) {
      throw new DataValidationError('كود الخط (مثل AUC-M01) مطلوب.');
    }

    const dup = existing.find(
      l => l.id !== currentId && l.code.trim().toUpperCase() === data.code?.trim().toUpperCase()
    );
    if (dup) {
      throw new DataValidationError(`كود الخط (${data.code}) مستخدم مسبقاً.`);
    }
  },

  canDeleteRoute(lineId: string, trips: Trip[], users: User[]): { canDelete: boolean; reason?: string } {
    const linkedTrips = trips.filter(t => t.lineId === lineId);
    if (linkedTrips.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف خط السير لارتباطه بـ (${linkedTrips.length}) رحلات تشغيلية. يمكنك إيقاف تفعيل الخط بدلاً من الحذف.`
      };
    }

    const linkedUsers = users.filter(u => u.lineId === lineId);
    if (linkedUsers.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف خط السير لوجود (${linkedUsers.length}) طلاب مشتركين عليه.`
      };
    }

    return { canDelete: true };
  },

  canDeleteStation(stationId: string, trips: Trip[], users: User[]): { canDelete: boolean; reason?: string } {
    const linkedStudents = users.filter(u => u.stationId === stationId);
    if (linkedStudents.length > 0) {
      return {
        canDelete: false,
        reason: `لا يمكن حذف هذه المحطة لأنها المحطة المعتمدة لـ (${linkedStudents.length}) طلاب مشتركين.`
      };
    }

    // Check if station exists in active trip stops
    for (const trip of trips) {
      if (trip.status === 'in_progress' || trip.status === 'scheduled') {
        const inTrip = trip.stops.some(s => s.stationId === stationId);
        if (inTrip) {
          return {
            canDelete: false,
            reason: `المحطة مدرجة في مسار الرحلة الجارية (${trip.code}). لا يمكن حذفها أثناء التشغيل.`
          };
        }
      }
    }

    return { canDelete: true };
  },

  // ==========================================
  // 4. SCHEDULE TEMPLATES MANAGEMENT
  // ==========================================
  validateTripTemplate(data: Partial<TripTemplate>, existing: TripTemplate[], currentId?: string) {
    if (!data.time || !data.time.trim()) {
      throw new DataValidationError('توقيت الرحلة مطلوب.');
    }
    if (!data.daysOfWeek || data.daysOfWeek.length === 0) {
      throw new DataValidationError('يجب اختيار يوم عمل واحد على الأقل لتشغيل هذا الموعد.');
    }

    const dup = existing.find(
      t => t.id !== currentId &&
           t.time.trim() === data.time?.trim() &&
           t.direction === data.direction &&
           t.universityId === data.universityId &&
           t.lineId === data.lineId
    );
    if (dup) {
      throw new DataValidationError('يوجد موعد مجدول مطابق مسجل مسبقاً لنفس الخط والاتجاه.');
    }
  },

  // ==========================================
  // 5. USERS & ROLES PERMISSIONS CHECK
  // ==========================================
  validateRoleChange(
    actorUser: User,
    targetUserId: string,
    newRole: UserRole,
    targetCurrentRole?: UserRole
  ) {
    const isSuperAdmin = actorUser.role === 'super_admin';
    const isAdmin = actorUser.role === 'admin';
    if (!isSuperAdmin && !isAdmin) {
      throw new DataValidationError('صلاحية تغيير أدوار المستخدمين مقتصرة على مدير الشركة أو مالك المنصة.');
    }
    if (actorUser.id === targetUserId && actorUser.role !== newRole) {
      throw new DataValidationError('قيد أمان: لا يُسمح بتغيير دورك الشخصي أو إلغاء صلاحياتك الإدارية بنفسك.');
    }
    if (newRole === 'super_admin') {
      throw new DataValidationError('دور مالك المنصة (Super Admin) محمي ولا يمكن تعيينه من لوحة المستخدمين.');
    }
    if (!isSuperAdmin && targetCurrentRole === 'super_admin') {
      throw new DataValidationError('غير مصرح لمدير الشركة بتعديل حساب مالك المنصة.');
    }
  },

  // ==========================================
  // 6. OWNER INTERVENTION: DEPENDENCIES & CONFLICTS
  // ==========================================
  inspectEntityDependencies(
    entityType: 'university' | 'line' | 'bus' | 'driver' | 'user' | 'trip',
    id: string,
    data: { lines: Line[]; trips: Trip[]; users: User[]; drivers: Driver[]; buses: Bus[] }
  ): { blockingCount: number; summary: string; details: string[] } {
    const details: string[] = [];

    if (entityType === 'university') {
      const uniLines = data.lines.filter(l => l.universityId === id);
      const uniTrips = data.trips.filter(t => t.universityId === id);
      const uniUsers = data.users.filter(u => u.universityId === id);
      if (uniLines.length) details.push(`${uniLines.length} خطوط سير مرتبطة بالجامعة`);
      if (uniTrips.length) details.push(`${uniTrips.length} رحلات مسجلة للجامعة`);
      if (uniUsers.length) details.push(`${uniUsers.length} مستخدمين/طلاب تابعين للجامعة`);
    } else if (entityType === 'line') {
      const lineTrips = data.trips.filter(t => t.lineId === id);
      const lineUsers = data.users.filter(u => u.lineId === id);
      if (lineTrips.length) details.push(`${lineTrips.length} رحلات تستخدم هذا الخط`);
      if (lineUsers.length) details.push(`${lineUsers.length} طلاب مشتركين على هذا الخط`);
    } else if (entityType === 'bus') {
      const busTrips = data.trips.filter(t => t.busId === id);
      const busDrivers = data.drivers.filter(d => d.assignedBusId === id);
      if (busTrips.length) details.push(`${busTrips.length} رحلات مرتبطة بهذا الباص`);
      if (busDrivers.length) details.push(`${busDrivers.length} سائقين معينين على هذا الباص`);
    } else if (entityType === 'driver') {
      const drvTrips = data.trips.filter(t => t.driverId === id && t.status !== 'completed' && t.status !== 'cancelled');
      if (drvTrips.length) details.push(`${drvTrips.length} رحلات نشطة/مجدولة يقودها السائق`);
    } else if (entityType === 'user') {
      const activeManifestTrips = data.trips.filter(
        t => t.status !== 'completed' && t.status !== 'cancelled' && (t.manifest || []).some(m => m.studentId === id)
      );
      if (activeManifestTrips.length) {
        details.push(`${activeManifestTrips.length} رحلات نشطة/مجدولة مسجل بها الطالب`);
      }
      const linkedDrivers = data.drivers.filter(d => d.userId === id);
      if (linkedDrivers.length) details.push(`مرتبط بسجل سائق (${linkedDrivers[0].nameAr})`);
    } else if (entityType === 'trip') {
      const trip = data.trips.find(t => t.id === id);
      const activePassengers = (trip?.manifest || []).filter(
        m => m.rsvpStatus === 'confirmed' || m.boardedStatus === 'boarded'
      ).length;
      if (activePassengers > 0) {
        details.push(`يوجد ${activePassengers} ركاب مؤكدين أو صعدوا بالفعل على هذه الرحلة`);
      }
    }

    const blockingCount = details.length;
    const summary =
      blockingCount === 0
        ? 'لا توجد ارتباطات حرجة تمنع التعديل أو الحذف الآمن.'
        : `تحذير سلامة البيانات: توجد (${blockingCount}) ارتباطات نشطة مرتبطة بهذا السجل.`;

    return { blockingCount, summary, details };
  },

  detectCompanyConflicts(
    trips: Trip[],
    buses: Bus[],
    drivers: Driver[]
  ): Array<{
    id: string;
    severity: 'critical' | 'warning';
    type: 'bus_overlap' | 'driver_overlap' | 'over_capacity' | 'bus_unavailable' | 'duplicate_student';
    title: string;
    description: string;
    tripId: string;
    relatedTripId?: string;
  }> {
    const conflicts: Array<{
      id: string;
      severity: 'critical' | 'warning';
      type: 'bus_overlap' | 'driver_overlap' | 'over_capacity' | 'bus_unavailable' | 'duplicate_student';
      title: string;
      description: string;
      tripId: string;
      relatedTripId?: string;
    }> = [];

    const activeTrips = trips.filter(t => t.status !== 'cancelled' && t.status !== 'merged' && t.status !== 'completed');

    // 1. Over-capacity and invalid/maintenance bus checks
    activeTrips.forEach(t => {
      const confirmedCount = (t.manifest || []).filter(
        m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded'
      ).length;

      if (confirmedCount > (t.capacity || 0)) {
        conflicts.push({
          id: `conf-cap-${t.id}`,
          severity: 'critical',
          type: 'over_capacity',
          title: `تجاوز السعة القصوى في رحلة ${t.code}`,
          description: `عدد الركاب (${confirmedCount}) يتجاوز سعة الباص (${t.capacity} مقعد) في رحلة ${t.scheduledTime}.`,
          tripId: t.id,
        });
      }

      const bus = buses.find(b => b.id === t.busId);
      if (t.busId && (!bus || !bus.activeStatus || bus.status === 'maintenance')) {
        conflicts.push({
          id: `conf-bus-${t.id}`,
          severity: 'warning',
          type: 'bus_unavailable',
          title: `الباص المعين للرحلة ${t.code} غير جاهز`,
          description: bus
            ? `الباص ${bus.code} (${bus.plateNumber}) في حالة صيانة أو إيقاف ومعين على رحلة نشطة.`
            : `الرحلة ${t.code} تشير إلى باص غير موجود في السجل.`,
          tripId: t.id,
        });
      }
    });

    // 2. Bus & driver slot overlaps on same date + scheduledTime
    for (let i = 0; i < activeTrips.length; i++) {
      for (let j = i + 1; j < activeTrips.length; j++) {
        const a = activeTrips[i];
        const b = activeTrips[j];
        if (a.date === b.date && a.scheduledTime === b.scheduledTime) {
          if (a.busId && a.busId === b.busId) {
            conflicts.push({
              id: `conf-bus-overlap-${a.id}-${b.id}`,
              severity: 'critical',
              type: 'bus_overlap',
              title: `تعارض باص (${a.busPlate}) في نفس الموعد`,
              description: `الباص ${a.busPlate} مخصص لرحلتين متزامنتين (${a.code} و ${b.code}) بتاريخ ${a.date} الساعة ${a.scheduledTime}.`,
              tripId: a.id,
              relatedTripId: b.id,
            });
          }
          if (a.driverId && a.driverId === b.driverId) {
            conflicts.push({
              id: `conf-drv-overlap-${a.id}-${b.id}`,
              severity: 'critical',
              type: 'driver_overlap',
              title: `تعارض سائق (${a.driverNameAr}) في نفس الموعد`,
              description: `السائق ${a.driverNameAr} معين على رحلتين في نفس التوقيت (${a.code} و ${b.code}) بتاريخ ${a.date} الساعة ${a.scheduledTime}.`,
              tripId: a.id,
              relatedTripId: b.id,
            });
          }
        }
      }
    }

    // 3. Duplicate student confirmed on same date + direction
    const seenBySlot = new Map<string, { trip: Trip; studentName: string }>();
    activeTrips.forEach(t => {
      (t.manifest || []).forEach(m => {
        if (m.rsvpStatus === 'confirmed' || m.boardedStatus === 'boarded') {
          const key = `${t.date}__${t.direction}__${m.studentId}`;
          const prev = seenBySlot.get(key);
          if (prev && prev.trip.id !== t.id) {
            conflicts.push({
              id: `conf-dup-stu-${t.id}-${m.studentId}`,
              severity: 'warning',
              type: 'duplicate_student',
              title: `حجز مكرر للطالب (${m.studentName})`,
              description: `الطالب ${m.studentName} مؤكد في رحلتين بنفس الاتجاه بتاريخ ${t.date}: (${prev.trip.code} و ${t.code}).`,
              tripId: t.id,
              relatedTripId: prev.trip.id,
            });
          } else {
            seenBySlot.set(key, { trip: t, studentName: m.studentName });
          }
        }
      });
    });

    // Also flag unassigned/on-leave drivers if any active trip uses them
    activeTrips.forEach(t => {
      const drv = drivers.find(d => d.id === t.driverId);
      if (t.driverId && drv && drv.status === 'on_leave') {
        conflicts.push({
          id: `conf-drv-leave-${t.id}`,
          severity: 'warning',
          type: 'driver_overlap',
          title: `السائق المعين في إجازة (${drv.nameAr})`,
          description: `الرحلة ${t.code} معين لها السائق ${drv.nameAr} وحالته الحالية (في إجازة).`,
          tripId: t.id,
        });
      }
    });

    return conflicts;
  },

  validateUserCompanyTransfer(
    user: User,
    targetCompanyId: string,
    allTrips: Trip[]
  ): { allowed: boolean; reason?: string; affectedTripIds: string[] } {
    if (!targetCompanyId) {
      return { allowed: false, reason: 'يرجى تحديد الشركة المستهدفة للنقل.', affectedTripIds: [] };
    }
    if (user.role === 'super_admin') {
      return { allowed: false, reason: 'حساب مالك المنصة يدير جميع الشركات ولا يتم نقله كعضو شركة.', affectedTripIds: [] };
    }
    if ((user.companyId || 'comp-unibus-main') === targetCompanyId) {
      return { allowed: false, reason: 'المستخدم مسجل بالفعل في هذه الشركة.', affectedTripIds: [] };
    }

    const activeBoarded = allTrips.filter(
      t =>
        (t.companyId || 'comp-unibus-main') === (user.companyId || 'comp-unibus-main') &&
        t.status === 'in_progress' &&
        (t.manifest || []).some(m => m.studentId === user.id && m.boardedStatus === 'boarded')
    );

    if (activeBoarded.length > 0) {
      return {
        allowed: false,
        reason: `لا يمكن نقل المستخدم أثناء وجوده راكباً فعلياً في رحلة جارية (${activeBoarded[0].code}). أنهِ الرحلة أو انقله منها أولاً.`,
        affectedTripIds: activeBoarded.map(t => t.id),
      };
    }

    const upcomingTrips = allTrips.filter(
      t =>
        (t.companyId || 'comp-unibus-main') === (user.companyId || 'comp-unibus-main') &&
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        (t.manifest || []).some(m => m.studentId === user.id)
    );

    return {
      allowed: true,
      affectedTripIds: upcomingTrips.map(t => t.id),
    };
  }
};
