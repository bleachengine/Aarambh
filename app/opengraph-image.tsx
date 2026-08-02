import { ImageResponse } from 'next/og';
import { AppIcon } from '@/components/app-icon';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B1220',
          backgroundImage: 'linear-gradient(135deg, #0B1220 0%, #0F2438 100%)',
        }}
      >
        <AppIcon width={104} height={104} />
        <div
          style={{
            marginTop: 28,
            fontSize: 72,
            fontWeight: 700,
            color: '#F8FAFC',
            letterSpacing: -1,
          }}
        >
          Aarambh
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 30,
            color: '#94A3B8',
          }}
        >
          AI Exam Generator &amp; Evaluator
        </div>
      </div>
    ),
    { ...size },
  );
}
