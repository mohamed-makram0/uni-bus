import { Trip } from '../types';

export interface WaitingBusInfo {
  trip: Trip;
  boardedCount: number;
  confirmedCount: number;
  capacity: number;
  fillPercent: number;
  recommendedDepartureTarget: number;
  divisionPercent: number;
  groupStudentsPoolCount: number;
  groupCarsCount: number;
  isBalancedTargetReached: boolean;
  isReadyForDispatch: boolean;
  dispatchReasonLabel: string;
}

export interface ReturnDivisionGroupSummary {
  key: string;
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  totalPoolStudents: number;
  readyFinishedCount: number;
  boardedNowCount: number;
  carsCount: number;
  totalFleetCapacity: number;
  averagePerCar: number;
  recommendedCarsNeeded: number;
  canSaveCar: boolean;
  buses: WaitingBusInfo[];
}

export interface WaitingStudentEntry {
  studentId: string;
  studentName: string;
  phone: string;
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  stationNameAr: string;
  scheduledTime: string;
  busPlate: string;
  driverNameAr: string;
  driverPhone: string;
  tripId: string;
  tripCode: string;
  boardedAt?: string;
}

export interface FinishedUniStudentEntry {
  studentId: string;
  studentName: string;
  phone: string;
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  stationNameAr: string;
  scheduledTime: string;
  readyForReturnAt?: string;
  busPlate: string;
  driverNameAr: string;
  driverPhone: string;
  isAlreadyBoardedWaitingBus: boolean;
}

export interface DispatchAlert {
  id: string;
  type: 'single_bus_ready' | 'balanced_split_ready' | 'pooled_load_ready';
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  waitingStudentsCount: number;
  recommendedTargetCount: number;
  recommendedVehicleLabel: string;
  recommendedVehicleCapacity: number;
  recommendedTripId: string;
  recommendedBusPlate: string;
  recommendedDriverNameAr: string;
  consolidateTripIds: string[];
  message: string;
}

export interface WaitingBusConsolidationOpportunity {
  id: string;
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  targetTripId: string;
  targetBusPlate: string;
  targetDriverNameAr: string;
  targetCapacity: number;
  donorTripIds: string[];
  donorBusPlates: string[];
  combinedBoardedCount: number;
  combinedConfirmedCount: number;
  savedCarsCount: number;
  message: string;
}

export interface CrossUniversityMismatchEntry {
  tripId: string;
  tripCode: string;
  tripUniversityId: string;
  tripUniversityNameAr: string;
  lineId: string;
  lineNameAr: string;
  busPlate: string;
  driverId: string;
  driverNameAr: string;
  driverPhone: string;
  scheduledTime: string;
  direction: 'to_university' | 'from_university';
  studentId: string;
  studentName: string;
  phone: string;
  studentUniversityId: string;
  studentUniversityNameAr?: string;
  stationNameAr: string;
  boardedStatus: 'waiting' | 'boarded' | 'no_show';
}

export interface WaitingBusMetricsResult {
  waitingBuses: WaitingBusInfo[];
  divisionGroups: ReturnDivisionGroupSummary[];
  consolidationOpportunities: WaitingBusConsolidationOpportunity[];
  studentsInsideWaitingBuses: WaitingStudentEntry[];
  finishedUniStudents: FinishedUniStudentEntry[];
  departedHomeStudentIds: string[];
  crossUniversityMismatches: CrossUniversityMismatchEntry[];
  dispatchAlerts: DispatchAlert[];
  waitingInBusesCount: number;
  finishedUniCount: number;
  totalReturnPoolCount: number;
  nearestVehicleTarget: number;
  nearestVehicleProgressPercent: number;
}

export const hasReturnBusDepartedCampus = (trip: Trip): boolean => {
  if (trip.direction !== 'from_university') return false;
  if (trip.status === 'completed') return true;
  if (trip.status === 'in_progress' && (trip.stops || []).some(s => s.status === 'departed')) {
    return true;
  }
  return false;
};

export const getSuitableVehicleRecommendation = (studentCount: number): { label: string; capacity: number } => {
  if (studentCount <= 14) {
    return { label: 'ميكروباص (14 راكب)', capacity: 14 };
  }
  if (studentCount <= 28) {
    return { label: 'ميني باص (28 راكب)', capacity: 28 };
  }
  return { label: 'أتوبيس مرسيدس (33 راكب)', capacity: 33 };
};

export const computeWaitingBusMetrics = (
  trips: Trip[],
  operatingDate?: string,
  universityIdFilter?: string
): WaitingBusMetricsResult => {
  const scopedTrips = trips.filter(t => {
    if (operatingDate && operatingDate !== 'all' && t.date !== operatingDate) return false;
    if (universityIdFilter && universityIdFilter !== 'all' && t.universityId !== universityIdFilter) return false;
    if (t.status === 'cancelled' || t.status === 'merged') return false;
    return true;
  });

  // Return buses currently parked/waiting at campus (not yet departed)
  const returnWaitingTrips = scopedTrips.filter(
    t =>
      t.direction === 'from_university' &&
      !hasReturnBusDepartedCampus(t) &&
      (t.status === 'scheduled' || t.status === 'in_progress' || t.status === 'delayed')
  );

  // Track students who have already departed campus on a return bus so we don't count them as waiting
  const departedHomeStudentIds = new Set<string>();
  scopedTrips.forEach(t => {
    if (t.direction === 'from_university' && hasReturnBusDepartedCampus(t)) {
      (t.manifest || []).forEach(m => {
        if (m.boardedStatus === 'boarded') departedHomeStudentIds.add(m.studentId);
      });
    }
  });

  const studentsInsideWaitingBuses: WaitingStudentEntry[] = [];
  const boardedWaitingStudentIds = new Set<string>();

  returnWaitingTrips.forEach(trip => {
    (trip.manifest || []).forEach(m => {
      if (m.boardedStatus === 'boarded') {
        boardedWaitingStudentIds.add(m.studentId);
        studentsInsideWaitingBuses.push({
          studentId: m.studentId,
          studentName: m.studentName,
          phone: m.phone,
          universityId: trip.universityId,
          universityNameAr: trip.universityNameAr,
          lineId: trip.lineId,
          lineNameAr: trip.lineNameAr,
          stationNameAr: m.actualBoardingStationNameAr || m.stationNameAr,
          scheduledTime: trip.scheduledTime,
          busPlate: trip.busPlate,
          driverNameAr: trip.driverNameAr,
          driverPhone: trip.driverPhone,
          tripId: trip.id,
          tripCode: trip.code,
          boardedAt: m.boardedAt
        });
      }
    });
  });

  // Students who finished university (readyForReturn === true) AND have NOT departed home yet
  const finishedMap = new Map<string, FinishedUniStudentEntry>();
  scopedTrips.forEach(t => {
    (t.manifest || []).forEach(m => {
      if (m.readyForReturn && !departedHomeStudentIds.has(m.studentId) && !finishedMap.has(m.studentId)) {
        finishedMap.set(m.studentId, {
          studentId: m.studentId,
          studentName: m.studentName,
          phone: m.phone,
          universityId: t.universityId,
          universityNameAr: t.universityNameAr,
          lineId: t.lineId,
          lineNameAr: t.lineNameAr,
          stationNameAr: m.stationNameAr,
          scheduledTime: t.scheduledTime,
          readyForReturnAt: m.readyForReturnAt,
          busPlate: t.busPlate,
          driverNameAr: t.driverNameAr,
          driverPhone: t.driverPhone,
          isAlreadyBoardedWaitingBus: boardedWaitingStudentIds.has(m.studentId)
        });
      }
    });
  });

  // Cross-university mismatches: students sitting/booked on a trip heading to a DIFFERENT university than theirs,
  // excluding those already handed off to an external office/bus.
  const crossUniversityMismatches: CrossUniversityMismatchEntry[] = [];
  scopedTrips.forEach(t => {
    if (t.status === 'completed') return;
    (t.manifest || []).forEach(m => {
      if (m.rsvpStatus === 'excused' || m.boardedStatus === 'no_show') return;
      if (m.externalHandoffStatus === 'handed_off') return;
      if (m.studentUniversityId && t.universityId && m.studentUniversityId !== t.universityId) {
        crossUniversityMismatches.push({
          tripId: t.id,
          tripCode: t.code,
          tripUniversityId: t.universityId,
          tripUniversityNameAr: t.universityNameAr,
          lineId: t.lineId,
          lineNameAr: t.lineNameAr,
          busPlate: t.busPlate,
          driverId: t.driverId,
          driverNameAr: t.driverNameAr,
          driverPhone: t.driverPhone,
          scheduledTime: t.scheduledTime,
          direction: t.direction,
          studentId: m.studentId,
          studentName: m.studentName,
          phone: m.phone,
          studentUniversityId: m.studentUniversityId,
          studentUniversityNameAr: m.studentUniversityNameAr,
          stationNameAr: m.actualBoardingStationNameAr || m.stationNameAr,
          boardedStatus: m.boardedStatus
        });
      }
    });
  });

  // Group waiting return trips by universityId + lineId to calculate balanced student/car division
  const tripsByGroup = new Map<string, Trip[]>();
  returnWaitingTrips.forEach(t => {
    const key = `${t.universityId}__${t.lineId}`;
    const arr = tripsByGroup.get(key) || [];
    arr.push(t);
    tripsByGroup.set(key, arr);
  });

  // Also collect all active return-pool student IDs per universityId__lineId
  const poolStudentsByGroup = new Map<string, Set<string>>();
  const readyStudentsByGroup = new Map<string, Set<string>>();

  scopedTrips.forEach(t => {
    const key = `${t.universityId}__${t.lineId}`;
    if (!poolStudentsByGroup.has(key)) poolStudentsByGroup.set(key, new Set());
    if (!readyStudentsByGroup.has(key)) readyStudentsByGroup.set(key, new Set());

    const poolSet = poolStudentsByGroup.get(key)!;
    const readySet = readyStudentsByGroup.get(key)!;

    (t.manifest || []).forEach(m => {
      if (departedHomeStudentIds.has(m.studentId)) return;
      if (m.readyForReturn) {
        readySet.add(m.studentId);
        poolSet.add(m.studentId);
      }
      if (
        t.direction === 'from_university' &&
        (m.boardedStatus === 'boarded' || m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported')
      ) {
        poolSet.add(m.studentId);
      }
    });
  });

  const waitingBuses: WaitingBusInfo[] = [];
  const divisionGroups: ReturnDivisionGroupSummary[] = [];
  const totalReturnPoolSet = new Set<string>();
  poolStudentsByGroup.forEach(s => s.forEach(id => totalReturnPoolSet.add(id)));

  tripsByGroup.forEach((groupTrips, key) => {
    const carsCount = groupTrips.length;
    const totalFleetCapacity = groupTrips.reduce((sum, t) => sum + (t.capacity || 14), 0);
    const poolSize = poolStudentsByGroup.get(key)?.size || 0;
    const readyCount = readyStudentsByGroup.get(key)?.size || 0;
    const boardedNowCount = groupTrips.reduce(
      (sum, t) => sum + (t.manifest || []).filter(m => m.boardedStatus === 'boarded').length,
      0
    );

    const effectivePool = Math.max(poolSize, boardedNowCount, readyCount);
    const averagePerCar = carsCount > 0 ? Math.ceil(effectivePool / carsCount) : 0;

    // Minimum number of cars strictly needed if consolidated (greedy fill largest capacities first)
    const sortedCaps = [...groupTrips].map(t => t.capacity || 14).sort((a, b) => b - a);
    let remainingToFit = effectivePool;
    let recommendedCarsNeeded = 0;
    for (const cap of sortedCaps) {
      if (remainingToFit <= 0) break;
      remainingToFit -= cap;
      recommendedCarsNeeded++;
    }
    if (effectivePool === 0 && carsCount > 0) recommendedCarsNeeded = 0;
    const canSaveCar = carsCount > 1 && effectivePool > 0 && recommendedCarsNeeded < carsCount;

    const groupBusInfos: WaitingBusInfo[] = groupTrips.map(trip => {
      const manifest = trip.manifest || [];
      const boardedCount = manifest.filter(m => m.boardedStatus === 'boarded').length;
      const confirmedCount = manifest.filter(
        m => m.rsvpStatus === 'confirmed' || m.rsvpStatus === 'whatsapp_reported' || m.boardedStatus === 'boarded'
      ).length;
      const capacity = trip.capacity || 14;
      const fillPercent = Math.min(100, Math.round((boardedCount / capacity) * 100));

      // Balanced division target:
      // Proportional to bus capacity across all waiting buses on this university/line,
      // so buses do NOT need to be 100% full when total student count ÷ cars allows lower balanced departure!
      const proportionalShare =
        effectivePool > 0 && totalFleetCapacity > 0
          ? Math.ceil(effectivePool * (capacity / totalFleetCapacity))
          : Math.min(14, capacity);

      const recommendedDepartureTarget = Math.min(
        capacity,
        Math.max(1, effectivePool > 0 ? proportionalShare : Math.min(14, capacity))
      );

      const divisionPercent =
        recommendedDepartureTarget > 0
          ? Math.min(100, Math.round((boardedCount / recommendedDepartureTarget) * 100))
          : 0;

      const minCapacityReadyThreshold = Math.min(14, Math.max(10, Math.ceil(capacity * 0.75)));
      const isBalancedTargetReached = effectivePool > 0 && boardedCount >= recommendedDepartureTarget;
      const isCapacityReady = boardedCount >= minCapacityReadyThreshold;
      const isReadyForDispatch = boardedCount > 0 && (isBalancedTargetReached || isCapacityReady);

      const dispatchReasonLabel = isBalancedTargetReached
        ? `مكتمل بالعدد المناسب بالقسمة (${boardedCount} من ${recommendedDepartureTarget})`
        : isCapacityReady
        ? `حمولة السيارة مكتملة (${boardedCount} من ${capacity})`
        : `متبقي ${Math.max(0, recommendedDepartureTarget - boardedCount)} للعدد المناسب (${recommendedDepartureTarget})`;

      const info: WaitingBusInfo = {
        trip,
        boardedCount,
        confirmedCount,
        capacity,
        fillPercent,
        recommendedDepartureTarget,
        divisionPercent,
        groupStudentsPoolCount: effectivePool,
        groupCarsCount: carsCount,
        isBalancedTargetReached,
        isReadyForDispatch,
        dispatchReasonLabel
      };
      waitingBuses.push(info);
      return info;
    });

    const firstTrip = groupTrips[0];
    divisionGroups.push({
      key,
      universityId: firstTrip.universityId,
      universityNameAr: firstTrip.universityNameAr,
      lineId: firstTrip.lineId,
      lineNameAr: firstTrip.lineNameAr,
      totalPoolStudents: effectivePool,
      readyFinishedCount: readyCount,
      boardedNowCount,
      carsCount,
      totalFleetCapacity,
      averagePerCar,
      recommendedCarsNeeded,
      canSaveCar,
      buses: groupBusInfos
    });
  });

  // Compute smart dispatch alerts:
  // 1) Balanced target reached or single waiting bus ready for departure
  // 2) Pooled waiting students across multiple waiting buses at same university+line >= balanced target or >= 14
  const dispatchAlerts: DispatchAlert[] = [];
  const alertedTripIds = new Set<string>();

  waitingBuses.forEach(wb => {
    if (wb.isReadyForDispatch) {
      alertedTripIds.add(wb.trip.id);
      const vehicleRec = getSuitableVehicleRecommendation(wb.boardedCount);
      const isPartialBalanced = wb.isBalancedTargetReached && wb.boardedCount < wb.capacity;
      dispatchAlerts.push({
        id: `alert-bus-${wb.trip.id}`,
        type: isPartialBalanced ? 'balanced_split_ready' : 'single_bus_ready',
        universityId: wb.trip.universityId,
        universityNameAr: wb.trip.universityNameAr,
        lineId: wb.trip.lineId,
        lineNameAr: wb.trip.lineNameAr,
        waitingStudentsCount: wb.boardedCount,
        recommendedTargetCount: wb.recommendedDepartureTarget,
        recommendedVehicleLabel: `${vehicleRec.label} (${wb.trip.busPlate})`,
        recommendedVehicleCapacity: wb.capacity,
        recommendedTripId: wb.trip.id,
        recommendedBusPlate: wb.trip.busPlate,
        recommendedDriverNameAr: wb.trip.driverNameAr,
        consolidateTripIds: [],
        message: isPartialBalanced
          ? `بلغت سيارة الانتظار (${wb.trip.busPlate}) العدد المناسب بالقسمة (${wb.boardedCount} من ${wb.recommendedDepartureTarget} طالب من أصل ${wb.groupStudentsPoolCount} طالب على ${wb.groupCarsCount} سيارة) — جاهزة للانطلاق الآن دون انتظار اكتمال الـ ${wb.capacity} مقعد!`
          : `يوجد ${wb.boardedCount} طالب داخل سيارة الانتظار (${wb.trip.busPlate} · سعة ${wb.capacity}) بـ${wb.trip.universityNameAr} — الحمولة مناسبة للانطلاق والعودة بالطلاب الآن.`
      });
    }
  });

  divisionGroups.forEach(group => {
    const hasUnalertedBuses = group.buses.some(b => !alertedTripIds.has(b.trip.id) && b.boardedCount > 0);
    // If pooled boarded count fits cleanly into 1 car (or reaches >= 14 or >= all remaining students in the pool)
    const allRemainingBoarded = group.totalPoolStudents > 0 && group.boardedNowCount >= group.totalPoolStudents;
    if (group.carsCount > 1 && hasUnalertedBuses && (group.boardedNowCount >= 14 || allRemainingBoarded)) {
      const sorted = [...group.buses].sort((a, b) => {
        if (b.capacity !== a.capacity) return b.capacity - a.capacity;
        return b.boardedCount - a.boardedCount;
      });
      const primary = sorted[0];
      const donors = sorted.slice(1).filter(b => b.boardedCount > 0).map(b => b.trip.id);
      const vehicleRec = getSuitableVehicleRecommendation(group.boardedNowCount);

      dispatchAlerts.push({
        id: `alert-pool-${group.key}`,
        type: 'pooled_load_ready',
        universityId: group.universityId,
        universityNameAr: group.universityNameAr,
        lineId: group.lineId,
        lineNameAr: group.lineNameAr,
        waitingStudentsCount: group.boardedNowCount,
        recommendedTargetCount: primary.recommendedDepartureTarget,
        recommendedVehicleLabel: vehicleRec.label,
        recommendedVehicleCapacity: primary.capacity,
        recommendedTripId: primary.trip.id,
        recommendedBusPlate: primary.trip.busPlate,
        recommendedDriverNameAr: primary.trip.driverNameAr,
        consolidateTripIds: donors,
        message: allRemainingBoarded
          ? `صعد جميع طلاب العودة المتاحين (${group.boardedNowCount} طالب) في سيارات الانتظار على (${group.lineNameAr}) — يمكن تجميعهم وانطلاق سيارة (${primary.trip.busPlate}) بهم الآن وتوفير باقي السيارات.`
          : `إجمالي المنتظرين داخل ${group.carsCount} سيارات انتظار على (${group.lineNameAr}) وصل إلى ${group.boardedNowCount} طالب — مناسب لتجميعهم وانطلاق سيارة (${primary.trip.busPlate}) بهم الآن.`
      });
    }
  });

  // Compute 1-click waiting-bus consolidation opportunities when 2+ waiting buses are under 50% capacity
  // and their combined passengers fit comfortably into a single waiting bus
  const consolidationOpportunities: WaitingBusConsolidationOpportunity[] = [];
  divisionGroups.forEach(group => {
    if (group.carsCount < 2) return;
    const underHalfBuses = group.buses.filter(b => b.fillPercent < 55);
    if (underHalfBuses.length < 2) return;

    const sorted = [...underHalfBuses].sort((a, b) => {
      if (b.capacity !== a.capacity) return b.capacity - a.capacity;
      return b.boardedCount - a.boardedCount;
    });
    const target = sorted[0];
    const donors: WaitingBusInfo[] = [];
    let runningBoarded = target.boardedCount;
    let runningConfirmed = target.confirmedCount;

    for (let i = 1; i < sorted.length; i++) {
      const candidate = sorted[i];
      if (runningBoarded + candidate.boardedCount <= target.capacity) {
        donors.push(candidate);
        runningBoarded += candidate.boardedCount;
        runningConfirmed += candidate.confirmedCount;
      }
    }

    if (donors.length > 0) {
      const donorPlates = donors.map(d => d.trip.busPlate);
      consolidationOpportunities.push({
        id: `consolidate-wait-${group.key}`,
        universityId: group.universityId,
        universityNameAr: group.universityNameAr,
        lineId: group.lineId,
        lineNameAr: group.lineNameAr,
        targetTripId: target.trip.id,
        targetBusPlate: target.trip.busPlate,
        targetDriverNameAr: target.trip.driverNameAr,
        targetCapacity: target.capacity,
        donorTripIds: donors.map(d => d.trip.id),
        donorBusPlates: donorPlates,
        combinedBoardedCount: runningBoarded,
        combinedConfirmedCount: runningConfirmed,
        savedCarsCount: donors.length,
        message: `توجد ${donors.length + 1} سيارات بأقل من نصف السعة على (${group.lineNameAr}) — يمكن تجميع الركاب (${runningBoarded} طالب بالسيارات حالياً) في باص (${target.trip.busPlate} سعة ${target.capacity}) وتوفير ${donors.length} سيارة فوراً.`
      });
    }
  });

  const waitingInBusesCount = studentsInsideWaitingBuses.length;
  const finishedUniStudents = Array.from(finishedMap.values());
  const finishedUniCount = finishedUniStudents.length;

  // Dynamic global nearest target using balanced division if available
  const firstPendingBus = waitingBuses.find(b => !b.isReadyForDispatch) || waitingBuses[0];
  const dynamicGlobalTarget = waitingBuses.length > 0
    ? waitingBuses.reduce((sum, b) => sum + b.recommendedDepartureTarget, 0) / waitingBuses.length
    : 14;
  const nearestVehicleTarget = firstPendingBus
    ? firstPendingBus.recommendedDepartureTarget
    : Math.max(1, Math.round(dynamicGlobalTarget));
  const nearestVehicleProgressPercent = nearestVehicleTarget > 0
    ? Math.min(100, Math.round((waitingInBusesCount / nearestVehicleTarget) * 100))
    : 0;

  return {
    waitingBuses,
    divisionGroups,
    consolidationOpportunities,
    studentsInsideWaitingBuses,
    finishedUniStudents,
    departedHomeStudentIds: Array.from(departedHomeStudentIds),
    crossUniversityMismatches,
    dispatchAlerts,
    waitingInBusesCount,
    finishedUniCount,
    totalReturnPoolCount: totalReturnPoolSet.size,
    nearestVehicleTarget,
    nearestVehicleProgressPercent
  };
};
