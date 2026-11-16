export type UserRole = 'super_admin' | 'admin' | 'supervisor' | 'driver' | 'student';

export interface Company {
  id: string;
  nameAr: string;
  code: string;
  ownerAdminUserId?: string;
  ownerAdminName: string;
  ownerAdminEmail: string;
  contactPhone: string;
  planName: 'starter' | 'growth' | 'enterprise';
  monthlyPriceEgp: number;
  durationMonths: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  paymentStatus: 'paid' | 'pending' | 'overdue';
  status: 'active' | 'suspended';
  suspendedReason?: string;
  maxBuses?: number;
  maxStudents?: number;
  createdAt: string;
}

export interface User {
  id: string;
  companyId?: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  isGeneralSupervisor?: boolean;
  avatar?: string;
  universityId?: string;
  lineId?: string;
  stationId?: string;
  assignedBusId?: string;
  licenseNumber?: string;
  status: 'active' | 'pending_approval' | 'suspended';
}

export interface University {
  id: string;
  companyId?: string;
  nameAr: string;
  city: string;
  campusLocation: string;
  activeStatus: boolean;
  totalStudents: number;
}

export interface Station {
  id: string;
  lineId: string;
  nameAr: string;
  orderIndex: number;
  scheduledMinutesFromStart: number;
  latitude?: number;
  longitude?: number;
}

export interface Line {
  id: string;
  companyId?: string;
  universityId: string;
  nameAr: string;
  code: string;
  direction: 'to_university' | 'from_university' | 'both';
  activeStatus: boolean;
  stations: Station[];
}

export interface Bus {
  id: string;
  companyId?: string;
  code: string; // Bus unique code (e.g. B-101)
  plateNumber: string;
  capacity: number; // e.g. 14, 28, 33
  model: string;
  status: 'available' | 'in_trip' | 'maintenance';
  activeStatus: boolean;
  notes?: string;
  currentAssignedPassengers?: number;
}

export interface TripTemplate {
  id: string;
  companyId?: string;
  time: string; // e.g. '07:00 ص'
  direction: 'to_university' | 'from_university';
  type: 'morning' | 'return';
  universityId?: string; // Optional: all or specific
  lineId?: string; // Optional: all or specific
  daysOfWeek: number[]; // [0, 1, 2, 3, 4] Sunday to Thursday
  activeStatus: boolean;
  isDefault: boolean;
}

export interface Driver {
  id: string;
  companyId?: string;
  userId: string;
  nameAr: string;
  phone: string;
  licenseNumber: string;
  status: 'active' | 'on_leave';
  assignedBusId?: string;
}

export interface Subscription {
  id: string;
  companyId?: string;
  studentId: string;
  studentName: string;
  universityId: string;
  lineId: string;
  stationId: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'pending';
  type: 'monthly' | 'term';
}

export type TripStatus = 'scheduled' | 'in_progress' | 'completed' | 'delayed' | 'merged' | 'cancelled';

export interface TripStopStatus {
  stopId: string;
  stationId: string;
  stationNameAr: string;
  orderIndex: number;
  scheduledArrivalTime: string;
  actualArrivalTime?: string;
  actualDepartureTime?: string;
  status: 'pending' | 'arrived' | 'departed';
}

export interface ManifestStudent {
  studentId: string;
  studentName: string;
  phone: string;
  stationId: string;
  stationNameAr: string;
  // RSVP: unconfirmed, confirmed by student, excused by student, reported by whatsapp
  rsvpStatus: 'unconfirmed' | 'confirmed' | 'excused' | 'whatsapp_reported';
  rsvpConfirmedAt?: string;
  // Boarding status recorded by driver
  boardedStatus: 'waiting' | 'boarded' | 'no_show';
  boardedAt?: string;
  actualBoardingStationId?: string;
  actualBoardingStationNameAr?: string;
  // Student return readiness ("خلص الجامعة وجاهز وينتظر رحلة العودة")
  readyForReturn?: boolean;
  readyForReturnAt?: string;
  // Cross-university mismatch & external office handoff tracking
  studentUniversityId?: string;
  studentUniversityNameAr?: string;
  externalHandoffStatus?: 'handed_off';
  externalHandoffNote?: string;
  externalHandoffAt?: string;
}

export interface Trip {
  id: string;
  companyId?: string;
  code: string;
  date: string; // YYYY-MM-DD
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  direction: 'to_university' | 'from_university';
  scheduledTime: string; // e.g. 07:00, 09:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00
  busId: string;
  busPlate: string;
  capacity: number; // The capacity pool, seats are not individually numbered
  driverId: string;
  driverNameAr: string;
  driverPhone: string;
  isUnregisteredEmergencyDriver?: boolean;
  status: TripStatus;
  currentStopIndex: number;
  delayMinutes: number;
  delayReason?: string;
  stops: TripStopStatus[];
  manifest: ManifestStudent[];
  mergedIntoTripId?: string;
  notes?: string;
  lastConfirmedStopName?: string;
  lastConfirmedTime?: string;
}

export interface Incident {
  id: string;
  companyId?: string;
  tripId: string;
  tripCode: string;
  driverId?: string;
  reportedById?: string;
  type: 'breakdown' | 'delay' | 'driver_absence' | 'route_change' | 'bus_swap';
  description: string;
  reportedByRole: UserRole;
  reportedByName: string;
  originalBusId?: string;
  replacementBusId?: string;
  originalDriverId?: string;
  replacementDriverId?: string;
  delayMinutes?: number;
  createdAt: string;
  status: 'pending' | 'resolved';
  replacementDriverName?: string;
  replacementDriverPhone?: string;
  replacementBusPlate?: string;
  isUnregisteredEmergency?: boolean;
}

export interface ConsolidationProposal {
  id: string;
  companyId?: string;
  sourceTripId: string;
  targetTripId: string;
  sourceTripCode: string;
  targetTripCode: string;
  lineNameAr: string;
  timeGapMinutes: number;
  totalPassengersCombined: number;
  targetBusCapacity: number;
  spareSeats: number;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  createdAtMs?: number;
  companyId?: string;
  companyNameAr?: string;
  actorId?: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  details: string;
  targetEntity: string;
  targetCollection?: string;
  targetDocId?: string;
  interventionReason?: string;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
  reversible?: boolean;
  rolledBackAt?: string;
  rolledBackBy?: string;
}

export interface SaveDiagnosticError {
  id: string;
  timestamp: string;
  companyId: string;
  operation: string;
  target: string;
  message: string;
}

export interface ExceptionalBookingRequest {
  id: string;
  companyId?: string;
  studentId: string;
  studentName: string;
  phone: string;
  universityId: string;
  universityNameAr: string;
  lineId: string;
  lineNameAr: string;
  stationId: string;
  stationNameAr: string;
  tripId?: string;
  date: string; // YYYY-MM-DD
  direction: 'to_university' | 'from_university';
  scheduledTime: string;
  reason?: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface DailySlotDemand {
  slotKey: string;
  date: string;
  lineId: string;
  lineNameAr: string;
  universityId: string;
  universityNameAr: string;
  direction: 'to_university' | 'from_university';
  scheduledTime: string;
  registeredStudentsCount: number;
  allocatedStudentsCount: number;
  assignedBusesCount: number;
  assignedCapacity: number;
  seatShortage: number;
  busesNeeded: number;
  busesShortage: number;
  status: 'balanced' | 'surplus' | 'shortage' | 'unassigned';
  assignedBusIds: string[];
}

export interface SystemSettings {
  companyId?: string;
  rsvpDeadlineHours: number; // e.g. 2 hours before trip
  maxWaitMinutesForMerge: number; // e.g. 45 minutes
  lowOccupancyThresholdPercent: number; // e.g. 40%
  allowStudentSelfExcuse: boolean;
  contactSupportPhone: string;
  cutoffTimeTomorrow: string; // e.g. '22:00' (10:00 PM)
  simulateCutoffPassed: boolean; // allow testing toggle
  studentAssignmentMode: 'auto_assigned' | 'open_boarding'; // Auto-assigned to specific bus vs Open flexible boarding at station
}

export interface StaffInvite {
  id: string; // sanitized lowercase email
  email: string;
  emailLower: string;
  companyId: string;
  companyNameAr?: string;
  name: string;
  phone: string;
  role: Exclude<UserRole, 'super_admin'>;
  isGeneralSupervisor?: boolean;
  assignedBusId?: string;
  licenseNumber?: string;
  universityId?: string;
  lineId?: string;
  stationId?: string;
  preProvisionedUserId?: string;
  preProvisionedDriverId?: string;
  status: 'pending' | 'claimed';
  invitedByName: string;
  createdAt: string;
  claimedAt?: string;
  claimedByUid?: string;
}

export interface PublicCompanyDirectoryEntry {
  id: string;
  nameAr: string;
  code: string;
  status: 'active' | 'suspended';
}

