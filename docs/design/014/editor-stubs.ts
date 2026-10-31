// Browser-only fixture prevents any network mutations.
export const listCache = { begin: () => false, finish: () => {} };
export const discardDeniedAccess = () => false;
export async function saveProduct() { throw new Error("Fixture cannot save"); }
