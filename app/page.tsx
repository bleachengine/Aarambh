import { HomeClient } from '@/components/home-client';

export default function Page() {
  return <HomeClient username={process.env.app_username ?? null} />;
}
