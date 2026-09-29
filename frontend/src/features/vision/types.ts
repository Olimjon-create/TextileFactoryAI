import type { MachineStatus, ProductionStage } from '@/features/resources/types';

export type DeviceKind = 'CAMERA' | 'EDGE' | 'SCANNER' | 'SENSOR';
export type EventType = 'COUNT' | 'DEFECT' | 'MACHINE_STATE' | 'CUSTOM';
export type EventStatus = 'PENDING' | 'APPLIED' | 'REJECTED' | 'STORED';
export type RuleAction = 'AUTO_APPLY' | 'REVIEW' | 'STORE_ONLY';

export interface Ref {
  id: number;
  code: string | null;
  name: string;
}

export interface Device {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  kind: DeviceKind;
  stage: ProductionStage | null;
  line: Ref | null;
  machine: Ref | null;
  work_order: Ref | null;
  key_prefix: string;
  is_active: boolean;
  online: boolean;
  last_seen_at: string | null;
  last_ip: string | null;
  notes: string | null;
  events_today: number;
  pending: number;
}

export interface DeviceWithKey extends Device {
  api_key: string;
}

export interface DevicePayload {
  code?: string;
  name?: string;
  kind?: DeviceKind;
  stage?: ProductionStage | null;
  line_id?: number | null;
  machine_id?: number | null;
  work_order_id?: number | null;
  is_active?: boolean;
  notes?: string | null;
  factory_id?: number;
}

export interface VisionEvent {
  id: number;
  device: Ref;
  external_id: string | null;
  event_type: EventType;
  occurred_at: string;
  received_at: string;
  stage: ProductionStage | null;
  quantity: number | null;
  defect_reason: string | null;
  machine_state: MachineStatus | null;
  confidence: number | null;
  work_order: Ref | null;
  unit_code: string | null;
  employee_code: string | null;
  image_url: string | null;
  payload: Record<string, unknown> | null;
  status: EventStatus;
  status_message: string | null;
  production_log_id: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
}

export interface EventPage {
  items: VisionEvent[];
  total: number;
}

export interface Rule {
  id: number;
  factory_id: number;
  event_type: EventType;
  device: Ref | null;
  action: RuleAction;
  min_confidence: number;
  alert_threshold: number | null;
  alert_window_minutes: number | null;
  is_active: boolean;
  notes: string | null;
}

export interface RulePayload {
  event_type?: EventType;
  device_id?: number | null;
  action?: RuleAction;
  min_confidence?: number;
  alert_threshold?: number | null;
  alert_window_minutes?: number | null;
  is_active?: boolean;
  notes?: string | null;
}

export interface VisionSummary {
  devices: number;
  online: number;
  events_today: number;
  pending: number;
  applied_today: number;
  rejected_today: number;
  counted_today: number;
  defects_today: number;
}
