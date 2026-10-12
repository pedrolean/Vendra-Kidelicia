import { isAuthenticated } from '@/lib/auth';
import WhatsAppLab from '@/components/WhatsAppLab';
import PinGate from '@/components/PinGate';
export const dynamic='force-dynamic';
export default async function Home() {
  return (await isAuthenticated())?<WhatsAppLab/>:<PinGate/>;
}
