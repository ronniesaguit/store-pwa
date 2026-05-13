# Inventory Module Repair Note

Date: 2026-05-13

Module: inventory
Worker source folder used: D:\Documents\Playground\businesshub-api-extracted
Worker file patched: index.js
Worker deployed version: 52e3e259-a590-4a42-a84f-8c2654f8d614

Bug found:
The legacy addProductStock route updated product stock first, then failed while inserting inventory_movements because the old _addMovement insert did not include required fields such as tenant_id, direction, status, created_by_user_id, and updated_at.

Proof:
- Before old addProductStock test: Current_Stock = 2
- addProductStock returned failure:
  D1_ERROR: NOT NULL constraint failed: inventory_movements.tenant_id
- After failed API response: Current_Stock became 3
- This proved a partial-write bug.

Patch:
Changed Worker case "addProductStock" to route through createRestock:

case "addProductStock":
  result = await createRestock(sdb, caller.store_id || "", caller, {
    productId: data.productId,
    quantity: data.qty,
    reasonCode: data.reason || "legacy_restock",
    note: data.notes || data.note || ""
  });
  break;

Validation after deploy:
- Restored test product stock to 2.
- Retested addProductStock.
- Result success true.
- Returned movementId MOVmp3v611tuatx and newStock 3.
- Product Current_Stock became 3.
- Movement record was valid:
  tenant_id = STRmo8mtzrtczd2
  movement_type = restock
  direction = in
  status = effective
  previous_stock = 2
  new_stock = 3
  created_by_user_id = USRmo8wmd27oewn
  updated_at present.

Status:
Inventory legacy Add Stock path repaired and verified.

## Additional Repair: Approval Movement History Stock Values

Worker deployed version: e75e33d6-ae9e-4872-807e-f0b1c1b3a28e

Bug found:
When a pending stock adjustment was approved, the product stock changed correctly, but the inventory movement history did not update new_stock. Example:
- Product stock changed from 4 to 3 after approval.
- Source movement still showed previous_stock = 4 and new_stock = 4.

Patch:
Updated _applyInventoryMovement so approval updates movement history with:
- previous_stock = Number(product.current_stock) before approval effect
- new_stock = calculated stock after approval effect

Patched SQL:
UPDATE inventory_movements
SET status='effective',
    approved_by_user_id=?,
    approved_at=?,
    previous_stock=?,
    new_stock=?,
    updated_at=?
WHERE movement_id=?

Validation:
- Created pending out adjustment:
  movementId = ADJmp3vgi9w7efk
  approvalId = APRmp3vgib91279
- Approved as second owner.
- Source movement after approval:
  previous_stock = 3
  new_stock = 2
  status = effective
- Product Current_Stock became 2.

Status:
Inventory approval movement history repair verified.
