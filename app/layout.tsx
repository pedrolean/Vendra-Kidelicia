import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={
  title:'Ki Delícia · Laboratório de atendimento',
  description:'Ambiente de simulação de conversas da Ki Delícia com a Vendra',
  robots:{index:false,follow:false}
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
