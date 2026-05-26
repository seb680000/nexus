export type ViewKey = 'dashboard' | 'monthly' | 'clients' | 'operators' | 'abandoned' | 'settings';
export type PeriodMode = 'custom' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type Service = 'premium' | 'forfait' | 'autre';
export type DurationFilter = 'all' | 'gt5' | 'gt10' | 'gt30' | 'gt60';
export type ChartMetric =
  | 'invoiceTotal'
  | 'treated'
  | 'abandoned'
  | 'total'
  | 'outbound'
  | 'callbacksDone'
  | 'callbacksRemaining'
  | 'internal'
  | 'maxWait'
  | 'avgAbandonedWait'
  | 'avgTalk';

export type Row = {
  id: string;
  callId: string;
  time: Date | null;
  day: string;
  month: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  ringing: number;
  talking: number;
  client: string;
  phone: string;
  operator: string;
  activity: string;
};

export type CallPath = {
  callId: string;
  day: string;
  month: string;
  date: Date | null;
  client: string;
  phone: string;
  service: Service;
  operator: string;
  treated: boolean;
  abandoned: boolean;
  wait: number;
  talk: number;
  rows: Row[];
};

export type DetailItem = {
  id: string;
  date: string;
  client: string;
  operator: string;
  phone: string;
  step: string;
  status: string;
  wait: number;
  talk: number;
};

export type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  status: string;
  dashboard: boolean;
  monthly: boolean;
  clients: boolean;
  operators: boolean;
  abandoned: boolean;
  settings: boolean;
};

export type CallbackSettings = {
  families: Service[];
  minAbandon: number;
  minCallback: number;
  minUserCallback: number;
};

export type CallbackInfo = {
  operator: string;
  time: Date | null;
  duration: number;
} | null;

export type AbandonedReportRow = {
  date: string;
  status: string;
  label: string;
  phone: string;
  service: Service;
  wait: string;
  waitSec: number;
  operatorCallback: string;
  userCallback: string;
  details: DetailItem[];
};
