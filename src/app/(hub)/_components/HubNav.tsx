'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useToken } from '../_lib/useAuth';

const ITEMS = [
  { href: '/',            label: 'Mês' },
  { href: '/lancamentos', label: 'Lançamentos' },
  { href: '/pendentes',   label: 'Pendentes' },
  { href: '/conta',       label: 'Conta' },
];

export function HubNav() {
  const pathname = usePathname();
  // O token vive no localStorage, que não existe no servidor: useToken devolve
  // null na renderização de servidor e o valor real depois da hidratação, sem
  // efeito nem setState no meio.
  const token = useToken();

  if (!token || pathname === '/login') return null;

  return (
    <nav className="hub-nav" aria-label="Seções do MonneyHub">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
