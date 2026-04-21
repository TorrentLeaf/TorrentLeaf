import { redirect } from 'next/navigation'

// The root of the authenticated app sends the user straight to their library.
// A dedicated "home" page served up a hardcoded empty-state and was easy to
// mistake for "no library items" when the real /library endpoint was working.
export default function HomePage() {
  redirect('/library' as never)
}
