# Staff Management Module Repair Note

Date: 2026-05-13

Module: staff_management
Worker source folder used: D:\Documents\Playground\businesshub-api-extracted
Worker file patched: index.js

Schema verified:
user_role_assignments columns:
- assignment_id
- tenant_id
- user_id
- role_code
- assigned_by
- assigned_at

Bug 1: createStaff partial-write failure
Problem:
createStaff inserted into users successfully, then failed when inserting user_role_assignments because it used invalid columns:
- id
- assigned_by_id
- is_active

Observed result:
- API returned success false
- Error: table user_role_assignments has no column named id
- But the staff user was still created

Patch:
Changed createStaff role assignment insert to use:
- assignment_id
- tenant_id
- user_id
- role_code
- assigned_by
- assigned_at

Validation:
Created new staff:
- username = cashier_fixed_1778666594
- userId = USRmp3w6486o9q7
- role = CASHIER
- role_code = CASHIER
- is_active = true
- API returned success true

Bug 2: getStaffById failed due to nonexistent is_active column
Problem:
getStaffById joined user_role_assignments with:
ON ura.user_id = u.user_id AND ura.is_active = 1

But user_role_assignments has no is_active column.

Patch:
Removed AND ura.is_active = 1 from the join.

Validation:
getStaffById returned success true for USRmp3w6486o9q7.

Bug 3: assignStaffRole partial-write failure
Problem:
assignStaffRole updated users.role successfully, then failed while updating user_role_assignments because it used invalid columns:
- assigned_by_id
- is_active

Observed result:
- API returned success false
- Error: no such column: assigned_by_id
- users.role changed to INVENTORY_STAFF
- role_code remained CASHIER
- This caused inconsistent role data

Patch:
Changed assignment update SQL to:
UPDATE user_role_assignments
SET role_code=?, assigned_by=?, assigned_at=?
WHERE user_id=? AND tenant_id=?

Validation:
assignStaffRole returned success true.
Staff detail showed:
- role = CASHIER
- role_code = CASHIER
- assigned_at updated

Other tested paths:
- getStoreUsers success
- getStaff success
- setStaffPassword success
- Staff login after password reset success
- setStaffStatus inactive success
- Inactive staff login blocked
- setStaffStatus active success
- Reactivated staff login success

Cleanup:
The failed partial-write test staff cashier_1778666433 was deactivated.
Active staff after cleanup:
- pilot_210106 OWNER
- owner OWNER
- cashier_fixed_1778666594 CASHIER

Status:
staff_management module repaired and verified.
Classification:
staff_management = USABLE / PASSED PHASE 1 CHECK
