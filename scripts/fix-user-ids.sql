-- =============================================================================
-- DIAGNOSE: Check for users whose id != employee_number (created by old nanoid code)
-- =============================================================================
select '--- USERS WITH RANDOM IDS (id != employee_number) ---';
select id,
       name,
       employee_number,
       email,
       role
  from users
 where id != employee_number;

-- =============================================================================
-- DIAGNOSE: Check for duplicate emails (shouldn't exist, but verify)
-- =============================================================================
select '--- DUPLICATE EMAILS ---';
select email,
       count(*) as cnt
  from users
 group by email
having cnt > 1;

-- =============================================================================
-- DIAGNOSE: Check for duplicate employee_numbers (shouldn't exist, but verify)
-- =============================================================================
select '--- DUPLICATE EMPLOYEE NUMBERS ---';
select employee_number,
       count(*) as cnt
  from users
 group by employee_number
having cnt > 1;

-- =============================================================================
-- FIX: Generate the migration SQL for users whose id != employee_number
-- This generates UPDATE statements that you can review and then execute.
-- =============================================================================
select '--- GENERATED MIGRATION SQL ---';
select 'PRAGMA foreign_keys = OFF;' as sql_stmt
union all
select 'BEGIN TRANSACTION;'
union all
select 'UPDATE user_projects SET user_id = '''
       || u.employee_number
       || ''' WHERE user_id = '''
       || u.id
       || ''';'
  from users u
 where u.id != u.employee_number
union all
select 'UPDATE timesheets SET user_id = '''
       || u.employee_number
       || ''' WHERE user_id = '''
       || u.id
       || ''';'
  from users u
 where u.id != u.employee_number
union all
select 'UPDATE timesheet_entries SET user_id = '''
       || u.employee_number
       || ''' WHERE user_id = '''
       || u.id
       || ''';'
  from users u
 where u.id != u.employee_number
union all
select 'UPDATE users SET id = '''
       || u.employee_number
       || ''' WHERE id = '''
       || u.id
       || ''';'
  from users u
 where u.id != u.employee_number
union all
select 'COMMIT;'
union all
select 'PRAGMA foreign_keys = ON;';

-- =============================================================================
-- NOTE: If duplicates exist (same email or employee_number with different ids),
-- the above migration will fail on the UPDATE users SET id step because the
-- target id (employee_number) may already exist in the table.
-- In that case, you need a separate approach: merge the two rows manually.
-- =============================================================================