import type { Timestamp } from 'firebase/firestore';
import type { AppSettings, TaskCategory } from '../types';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Verification',
  'Reading',
  'Correction',
  'Inverter Telemetry',
  'Customer Billing',
  'Panel Inspection',
  'Grid Feed-In',
  'Subsidy Record',
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  companyName: 'Solar Power Pvt. Ltd.',
  dailyPageLimit: 200,
  perPageReward: 5,
  referralReward: 250,
  referralEligibilityPages: 5,
  minWithdrawal: 100,
  withdrawalProcessingHours: '24–48 Business Hours',
  taskTimerSeconds: 180,
};

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: safe % 1 === 0 ? 0 : 2,
  }).format(safe);
}

export function getTodayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateUserCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = clean.slice(0, 6).padEnd(6, '0');
  return `SOL-${suffix}`;
}

export function generateReferralCode(name: string, uid: string): string {
  const prefix = name
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'S');
  const tail = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-4).padStart(4, '7');
  return `SOLAR-${prefix}${tail}`;
}

export function sanitizeMobileDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

export function maskAccountNumber(accountNumber: string): string {
  const trimmed = accountNumber.replace(/\s+/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `${'•'.repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

export interface SeedTaskInput {
  title: string;
  category: TaskCategory;
  pageNumber: number;
  sourceRecordId: string;
  sourceCustomerName: string;
  sourceSiteLocation: string;
  sourceMeterNumber: string;
  sourceKwhReading: string;
  sourceBillingDate: string;
  sourceNotes: string;
}

export const SAMPLE_SOLAR_TASKS: SeedTaskInput[] = [
  {
    title: 'Jaipur Rooftop Inverter Telemetry Log #001',
    category: 'Reading',
    pageNumber: 1,
    sourceRecordId: 'INV-JPR-1041',
    sourceCustomerName: 'Arvind Deshmukh',
    sourceSiteLocation: 'Mansarovar Sector 4, Jaipur',
    sourceMeterNumber: 'MTR-RJ-88421',
    sourceKwhReading: '412.8 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: '5kW grid-tied rooftop array operating at 96.4% inverter efficiency.',
  },
  {
    title: 'Ahmedabad Net-Metering Billing Sheet #002',
    category: 'Customer Billing',
    pageNumber: 2,
    sourceRecordId: 'BIL-AMD-2092',
    sourceCustomerName: 'Meera Patel',
    sourceSiteLocation: 'Navrangpura, Ahmedabad',
    sourceMeterNumber: 'MTR-GJ-55190',
    sourceKwhReading: '628.5 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: 'Bi-directional export cycle verified against DISCOM ledger.',
  },
  {
    title: 'Nagpur Commercial Array Inspection #003',
    category: 'Panel Inspection',
    pageNumber: 3,
    sourceRecordId: 'INSP-NGP-3118',
    sourceCustomerName: 'Vidarbha Cold Storage',
    sourceSiteLocation: 'Hingna MIDC, Nagpur',
    sourceMeterNumber: 'MTR-MH-71034',
    sourceKwhReading: '1,840.2 kWh',
    sourceBillingDate: '2026-11-14',
    sourceNotes: '24 monocrystalline strings cleaned; zero hotspot anomalies.',
  },
  {
    title: 'Kutch Solar Park Grid Feed-In Log #004',
    category: 'Grid Feed-In',
    pageNumber: 4,
    sourceRecordId: 'GRD-KTC-4405',
    sourceCustomerName: 'Rann Green Power Co-op',
    sourceSiteLocation: 'Bhuj Sub-Station Zone B',
    sourceMeterNumber: 'MTR-GJ-90312',
    sourceKwhReading: '3,490.0 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: 'Peak solar irradiance feed-in logged between 11:00 and 15:30 IST.',
  },
  {
    title: 'Pune Residential Subsidy Verification #005',
    category: 'Verification',
    pageNumber: 5,
    sourceRecordId: 'SUB-PUN-5019',
    sourceCustomerName: 'Sandeep Kulkarni',
    sourceSiteLocation: 'Kothrud, Pune',
    sourceMeterNumber: 'MTR-MH-44810',
    sourceKwhReading: '295.4 kWh',
    sourceBillingDate: '2026-11-13',
    sourceNotes: 'PM Surya Ghar 3kW installation commissioned and tagged.',
  },
  {
    title: 'Indore Warehouse Inverter Output #006',
    category: 'Inverter Telemetry',
    pageNumber: 6,
    sourceRecordId: 'INV-IDR-6024',
    sourceCustomerName: 'Malwa Agro Logistics',
    sourceSiteLocation: 'Sanwer Road, Indore',
    sourceMeterNumber: 'MTR-MP-22391',
    sourceKwhReading: '1,125.6 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: 'Dual MPPT string voltage balanced across phases R, Y, B.',
  },
  {
    title: 'Surat Textile Mill Solar Billing #007',
    category: 'Customer Billing',
    pageNumber: 7,
    sourceRecordId: 'BIL-SRT-7180',
    sourceCustomerName: 'Narmada Weaves Pvt. Ltd.',
    sourceSiteLocation: 'Sachin GIDC, Surat',
    sourceMeterNumber: 'MTR-GJ-66208',
    sourceKwhReading: '2,210.4 kWh',
    sourceBillingDate: '2026-11-14',
    sourceNotes: 'Daytime captive consumption offset 68% of peak tariff load.',
  },
  {
    title: 'Bhopal Clinic Panel Maintenance #008',
    category: 'Correction',
    pageNumber: 8,
    sourceRecordId: 'INSP-BPL-8301',
    sourceCustomerName: 'Arogya Care Diagnostic',
    sourceSiteLocation: 'Arera Colony, Bhopal',
    sourceMeterNumber: 'MTR-MP-31940',
    sourceKwhReading: '518.9 kWh',
    sourceBillingDate: '2026-11-12',
    sourceNotes: 'Junction box seals and DC earthing resistance checked at 0.8 ohm.',
  },
  {
    title: 'Udaipur Resort Microgrid Feed-In #009',
    category: 'Grid Feed-In',
    pageNumber: 9,
    sourceRecordId: 'GRD-UDP-9112',
    sourceCustomerName: 'Mewar Heritage Retreat',
    sourceSiteLocation: 'Fateh Sagar Ring Rd, Udaipur',
    sourceMeterNumber: 'MTR-RJ-19504',
    sourceKwhReading: '940.7 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: 'Hybrid lithium bank at 94% SOC; surplus exported to state grid.',
  },
  {
    title: 'Coimbatore Farm Pump Subsidy File #010',
    category: 'Subsidy Record',
    pageNumber: 10,
    sourceRecordId: 'SUB-CBE-1048',
    sourceCustomerName: 'Karthikeya Farms',
    sourceSiteLocation: 'Pollachi Road, Coimbatore',
    sourceMeterNumber: 'MTR-TN-77412',
    sourceKwhReading: '380.1 kWh',
    sourceBillingDate: '2026-11-14',
    sourceNotes: '5HP solar water pumping unit KUSUM telemetry verified.',
  },
  {
    title: 'Lucknow School Roof Telemetry #011',
    category: 'Inverter Telemetry',
    pageNumber: 11,
    sourceRecordId: 'INV-LKO-1193',
    sourceCustomerName: 'Gomti Public Academy',
    sourceSiteLocation: 'Gomti Nagar Ext, Lucknow',
    sourceMeterNumber: 'MTR-UP-50188',
    sourceKwhReading: '764.3 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: '10kW institutional array; AC breaker temperature nominal at 34C.',
  },
  {
    title: 'Vadodara Residence Net Bill #012',
    category: 'Customer Billing',
    pageNumber: 12,
    sourceRecordId: 'BIL-BDQ-1244',
    sourceCustomerName: 'Rohan Joshi',
    sourceSiteLocation: 'Alkapuri, Vadodara',
    sourceMeterNumber: 'MTR-GJ-38294',
    sourceKwhReading: '332.0 kWh',
    sourceBillingDate: '2026-11-15',
    sourceNotes: 'Carry-forward credit units 114 kWh adjusted in monthly bill.',
  },
];
