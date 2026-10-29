import { redirect } from 'next/navigation';

// Keep existing bookmarks while the full tag interface lives in account settings.
export default function TagsPage() {
  redirect('/settings#tags');
}
