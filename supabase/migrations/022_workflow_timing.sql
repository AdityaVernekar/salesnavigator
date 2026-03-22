-- Email Workflows: timing-based sequences with send windows and timezone support

-- Send window configuration on campaigns
alter table campaigns add column if not exists send_window_start time default '09:00';
alter table campaigns add column if not exists send_window_end time default '17:00';
alter table campaigns add column if not exists send_window_timezone text default 'America/New_York';
alter table campaigns add column if not exists send_window_days int[] default '{1,2,3,4,5}';

-- Contact timezone for tz-aware sending
alter table contacts add column if not exists timezone text;

-- Scheduled send time (timezone-adjusted) on enrollments
alter table enrollments add column if not exists scheduled_send_at timestamptz;

-- Index for the cron query: find due enrollments efficiently
create index if not exists idx_enrollments_scheduled_send
  on enrollments(scheduled_send_at) where status = 'active';
