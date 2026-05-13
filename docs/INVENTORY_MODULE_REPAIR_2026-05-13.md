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
