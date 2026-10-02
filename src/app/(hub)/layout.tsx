import './hub.css';
import { HubNav } from './_components/HubNav';

export const metadata = {
  title: 'MonneyHub',
  description: 'Seu controle financeiro — o mesmo dado que você conversa no WhatsApp.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hub">
      <main className="hub-main">{children}</main>
      <HubNav />
    </div>
  );
}
