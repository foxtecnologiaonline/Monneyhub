export const metadata = {
  title: "MonneyHub",
  description: "Camadas compartilhadas e produtos MonneyHub — FOX TecnologIA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
