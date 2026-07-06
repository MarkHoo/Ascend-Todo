import { invoke } from '@tauri-apps/api/core';
import type {
  CalendarEmailAccount,
  CalendarEmailSyncResult,
  CalendarEntry,
  CalendarHolidaySource,
  CalendarSyncStatus,
  CreateCalendarEmailAccountRequest,
  CreateManualCalendarEventRequest,
  UpdateManualCalendarEventRequest,
  CalendarEmailCredentialStatus,
  SaveCalendarEmailCredentialRequest,
  AuthorizeCalendarEmailOAuthRequest,
  ImportHolidayJsonSourceRequest,
  ImportCalendarIcsSourceRequest,
  SyncHolidayCountryRequest,
} from '@/types';

export const calendarApi = {
  range: (start: string, end: string) =>
    invoke<CalendarEntry[]>('calendar_range', { start, end }),
  syncStatus: () => invoke<CalendarSyncStatus>('calendar_sync_status'),
  holidaySources: () => invoke<CalendarHolidaySource[]>('calendar_holiday_sources'),
  syncHolidayCountry: (input: SyncHolidayCountryRequest) =>
    invoke<CalendarSyncStatus>('sync_holiday_country', { input }),
  importHolidayJsonSource: (input: ImportHolidayJsonSourceRequest) =>
    invoke<CalendarSyncStatus>('import_holiday_json_source', { input }),
  importIcsSource: (input: ImportCalendarIcsSourceRequest) =>
    invoke<CalendarSyncStatus>('import_calendar_ics_source', { input }),
  syncIcsUrlSource: (name: string, url: string) =>
    invoke<CalendarSyncStatus>('sync_calendar_ics_url_source', { name, url }),
  deleteHolidaySource: (id: string) =>
    invoke<CalendarSyncStatus>('delete_calendar_holiday_source', { id }),
  createManualEvent: (input: CreateManualCalendarEventRequest) =>
    invoke<CalendarEntry>('create_manual_calendar_event', { input }),
  updateManualEvent: (input: UpdateManualCalendarEventRequest) =>
    invoke<void>('update_manual_calendar_event', { input }),
  updateEntryTime: (params: { entryId: string; sourceType: string; startAt: string; endAt?: string | null }) =>
    invoke<void>('update_calendar_entry_time', params),
  exportRange: (start: string, end: string) =>
    invoke<string>('export_calendar_range', { start, end }),
  exportRangeIcs: (start: string, end: string) =>
    invoke<string>('export_calendar_range_ics', { start, end }),
  createPomodoroFromEntry: (entryId: string) =>
    invoke<void>('create_pomodoro_from_calendar_entry', { entryId }),
  listEmailAccounts: () => invoke<CalendarEmailAccount[]>('list_calendar_email_accounts'),
  exportSyncConfig: () => invoke<string>('export_calendar_sync_config'),
  importSyncConfig: (content: string) =>
    invoke<CalendarSyncStatus>('import_calendar_sync_config', { content }),
  createEmailAccount: (input: CreateCalendarEmailAccountRequest) =>
    invoke<CalendarEmailAccount>('create_calendar_email_account', { input }),
  setEmailAccountEnabled: (id: string, enabled: boolean) =>
    invoke<void>('set_calendar_email_account_enabled', { id, enabled }),
  deleteEmailAccount: (id: string) =>
    invoke<void>('delete_calendar_email_account', { id }),
  saveEmailCredential: (input: SaveCalendarEmailCredentialRequest) =>
    invoke<CalendarEmailCredentialStatus>('save_calendar_email_credential', { input }),
  authorizeEmailOAuth: (input: AuthorizeCalendarEmailOAuthRequest) =>
    invoke<CalendarEmailCredentialStatus>('authorize_calendar_email_oauth', { input }),
  emailCredentialStatus: (accountId: string) =>
    invoke<CalendarEmailCredentialStatus>('calendar_email_credential_status', { accountId }),
  deleteEmailCredential: (accountId: string) =>
    invoke<void>('delete_calendar_email_credential', { accountId }),
  syncEmailAccount: (accountId: string) =>
    invoke<CalendarEmailSyncResult>('sync_calendar_email_account', { accountId }),
  syncEmailAccounts: () =>
    invoke<CalendarEmailSyncResult[]>('sync_calendar_email_accounts'),
};
