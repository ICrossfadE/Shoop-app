"use client";
import type { MutationData } from "@/lib/list-model";
import {
  useState,
  useTransition,
  useOptimistic,
  useRef,
  type FormEvent,
} from "react";
import { saveCategory, deleteCategory } from "@/app/categories/actions";
import { listCache, discardDeniedAccess } from "@/lib/use-list";
import type { Category } from "@/lib/categories";

// Inline create/rename controls preserve input on error; FK protects nonempty deletion.
export default function CategoryManager({
  workspaceId,
  userId,
  categories,
  onChange,
}: {
  workspaceId: string;
  userId: string;
  categories: Category[];
  onChange?: (change: MutationData) => void;
}) {
  const [visible, updateVisible] = useOptimistic(
    categories,
    (previous: Category[], change: { id: string; category?: Category }) =>
      change.category
        ? [...previous.filter((item) => item.id !== change.id), change.category]
        : previous.filter((item) => item.id !== change.id),
  );
  const [busy, setBusy] = useState<string[]>([]);
  const formKey = useRef(crypto.randomUUID());
  const [ambiguous, setAmbiguous] = useState(false);
  const deleteKeys = useRef(new Map<string, string>());
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  // Save names only; database owns identity and Workspace restrictions.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.includes(editing ?? "new")) return;
    setError("");
    setNotice("");
    const id = editing ?? formKey.current;
    setBusy((ids) => [...ids, editing ?? "new", id]);
    startTransition(async () => {
      const existing = categories.find((category) => category.id === editing);
      updateVisible({
        id,
        category: {
          ...(existing ?? {
            id,
            workspace_id: workspaceId,
            created_by: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          name: name.trim(),
        },
      });
      try {
        const result = await saveCategory(
          workspaceId,
          editing,
          name,
          formKey.current,
        );
        if (discardDeniedAccess(result)) return;
        if (!result.ok) {
          setError(result.error);
          setAmbiguous(!!result.ambiguous);
          if (!result.ambiguous) formKey.current = crypto.randomUUID();
        } else {
          onChange?.(result.data);
          listCache.invalidate();
          formKey.current = crypto.randomUUID();
          setAmbiguous(false);
          setName("");
          setEditing(null);
          setNotice("Категорію збережено.");
        }
      } catch {
        setAmbiguous(true);
        setError("Немає відповіді. Повторіть із тими самими даними.");
      } finally {
        setBusy((ids) =>
          ids.filter((value) => value !== (editing ?? "new") && value !== id),
        );
      }
    });
  }

  // Direct deletion is safe even if a product was concurrently added.
  function remove(category: Category) {
    if (
      busy.includes(category.id) ||
      !window.confirm(`Видалити категорію «${category.name}»?`)
    )
      return;
    setError("");
    setNotice("");
    const key = deleteKeys.current.get(category.id) ?? crypto.randomUUID();
    deleteKeys.current.set(category.id, key);
    setBusy((ids) => [...ids, category.id]);
    startTransition(async () => {
      updateVisible({ id: category.id });
      try {
        const result = await deleteCategory(workspaceId, category.id, key);
        if (discardDeniedAccess(result)) return;
        if (!result.ok) {
          setError(result.error);
          if (!result.ambiguous) deleteKeys.current.delete(category.id);
        } else {
          onChange?.(result.data);
          listCache.invalidate();
          deleteKeys.current.delete(category.id);
          if (editing === category.id) {
            setName("");
            setEditing(null);
          }
          setNotice("Категорію видалено.");
        }
      } catch {
        setError("Немає відповіді. Повторіть видалення.");
      } finally {
        setBusy((ids) => ids.filter((id) => id !== category.id));
      }
    });
  }

  return (
    <div className="category-manager">
      {/* Category creation and rename form. */}
      <form onSubmit={submit} className="my-4 space-y-2">
        <label htmlFor="category-name" className="block">
          {editing ? "Нова назва категорії" : "Назва нової категорії"}
        </label>
        <input
          id="category-name"
          required
          maxLength={120}
          value={name}
          disabled={busy.includes(editing ?? "new") || ambiguous}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border border-line px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy.includes(editing ?? "new")}
            className="rounded button-primary px-3 py-2 disabled:opacity-50"
          >
            {pending
              ? "Збереження…"
              : editing
                ? "Перейменувати"
                : "Створити категорію"}
          </button>
          {editing && (
            <button
              type="button"
              disabled={pending || ambiguous}
              onClick={() => {
                setEditing(null);
                setName("");
              }}
              className="rounded border px-3 py-2"
            >
              Скасувати
            </button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="my-2 text-danger">
          {error}
        </p>
      )}
      <p role="status" className="text-sm text-muted">
        {pending ? "Зберігається…" : notice}
      </p>
      {/* Workspace category actions. */}
      <ul className="space-y-3">
        {visible.map((category) => (
          <li
            key={category.id}
            className="flex flex-wrap items-center gap-2 border-t pt-3"
          >
            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
              {category.name}
            </span>
            {category.created_by === userId && <button
              disabled={
                busy.includes(category.id) ||
                ambiguous ||
                busy.includes(editing ?? "new")
              }
              onClick={() => {
                formKey.current = crypto.randomUUID();
                setEditing(category.id);
                setName(category.name);
                setError("");
                setNotice("");
              }}
              className="rounded border px-2 py-1"
            >
              Редагувати
            </button>}
            {category.created_by === userId && <button
              disabled={busy.includes(category.id)}
              onClick={() => remove(category)}
              className="rounded border border-danger px-2 py-1 text-danger"
            >
              Видалити
            </button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
