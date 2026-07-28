/*
 * Neon Auth's UI stylesheet is loaded here, not in the root layout.
 *
 * It ships a Tailwind Preflight reset whose universal rules (`* { border: 0
 * solid }`, `button { background-color: #0000; border-radius: 0 }`) are
 * unlayered, while Navi UI puts everything in `@layer navi.*`. Unlayered CSS
 * beats layered CSS at any specificity, so loading this globally stripped the
 * border, background, and radius off every Navi component in the product — most
 * visibly a SegmentedControl whose selected option looked identical to its
 * unselected one.
 *
 * Neon's own components need that reset, and `AuthView` is only rendered under
 * /auth, so scoping the import to this segment gives both libraries the cascade
 * they were built for. If a Neon Auth UI component is ever rendered outside
 * /auth, it needs this stylesheet on its own route segment too — not in the
 * root layout.
 */
import "@neondatabase/auth/ui/css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
