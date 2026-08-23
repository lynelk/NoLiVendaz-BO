# Native Vending Adapter

Adapter for the existing NOLI vending solution.

Implementation must map native:

- merchant identifiers;
- site identifiers;
- device identifiers;
- service/product identifiers;
- transaction states;
- errors;
- callbacks/events;
- transaction lookup and permitted actions;

to canonical NOLI Back Office contracts.

Do not expose native provider peculiarities to shared services.
