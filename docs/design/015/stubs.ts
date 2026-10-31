// Browser-only actions cannot persist data; theme failure exercises exact rollback.
export const listCache = { begin: () => false, finish: () => {}, clear: () => {} };
export const discardDeniedAccess = () => false;
export const navigateList = () => {};
export const useRouter = () => ({ refresh: () => {} });
export async function saveTheme() { await new Promise((resolve) => setTimeout(resolve, 100)); return { ok: false, error: 'Тестова відмова збереження' }; }
export async function saveProduct() { throw new Error('Fixture cannot save'); }
export const saveCategory = saveProduct;
export const deleteCategory = saveProduct;
export const createTag = saveProduct;
export const signOut = saveProduct;
