// UI hints mirror server author checks; they never grant access themselves.
export function ownsRecord(userId: string, record: { created_by: string }): boolean {
  return !!userId && userId === record.created_by;
}
export function canDeleteExpense(userId: string, expense: { created_by?: string; archived?: boolean }): boolean {
  return !!userId && expense.created_by === userId && expense.archived === false;
}
