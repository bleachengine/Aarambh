import { ImageResponse } from 'next/og';
import { AppIcon } from '@/components/app-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        }}
      >
        <AppIcon width={130} height={130} />
      </div>
    ),
    { ...size },
  );
}
