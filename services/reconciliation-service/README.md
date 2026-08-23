# Reconciliation Service

Reconciles payment, vending, provider transaction, refund, and settlement records.

Detect at minimum:

- paid but not fulfilled;
- fulfilled but unpaid;
- duplicate vending;
- provider/internal missing transactions;
- missing or duplicate callbacks;
- refund mismatches;
- settlement missing or mismatched;
- incorrect fees or commissions.

Every exception carries financial value where available, severity, age, owner, evidence, and resolution state.
