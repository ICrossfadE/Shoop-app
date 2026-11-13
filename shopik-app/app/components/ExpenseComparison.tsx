import { expenseTone, formatMoney, savings } from "@/lib/money";

type Amounts = { amount: number; planned_amount?: number | null };

// The same labeled metrics serve each purchase and the comparable monthly subset.
export default function ExpenseComparison({
  item,
  compact = false,
}: {
  item: Amounts;
  compact?: boolean;
}) {
  if (item.planned_amount == null)
    return (
      <p
        className={`expense-comparison-empty text-sm text-muted${compact ? " expense-comparison--compact" : ""}`}
      >
        Немає даних для порівняння
      </p>
    );
  const difference = savings([item]).amount;
  return (
    <dl
      className={`expense-comparison${compact ? " expense-comparison--compact" : ""}`}
      data-tone={expenseTone(item)}
    >
      <div className="expense-plan">
        <dt>План</dt>
        <dd>{formatMoney(item.planned_amount)}</dd>
      </div>
      <div className="expense-actual">
        <dt>Факт</dt>
        <dd>{formatMoney(item.amount)}</dd>
      </div>
      <div className="expense-difference">
        <dt>
          {difference < 0
            ? "Перевитрата"
            : difference > 0
              ? "Економія"
              : "Різниця"}
        </dt>
        <dd>{formatMoney(Math.abs(difference))}</dd>
      </div>
    </dl>
  );
}
