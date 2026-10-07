# loans

Loans I implementa el préstamo y la devolución temporales de herramientas reutilizables de Inventory (SRS §14.5, RF20, RB4) mediante dominio puro, LoanService, adaptadores PostgreSQL y web. Pertenece conceptualmente a Inventory y reutiliza su aritmética exacta y sus tablas sin redefinir sus funciones.

Ver [arquitectura](../../../docs/architecture/loans.md), [validación](../../../docs/architecture/loans-validation.md) y [ADR 0017 — Aceptada](../../../docs/decisions/0017-tool-loans.md). El préstamo no modifica la existencia; la disponibilidad es existencia − unidades pendientes. No incluye activos individualizados, notificaciones, prórrogas ni reportes.
