import { ImageResponse } from 'next/og';

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
        <svg width="88" height="88" viewBox="0 0 24 24" fill="#38BDF8">
          <path d="M12 2 14.3 9.7 22 12 14.3 14.3 12 22 9.7 14.3 2 12 9.7 9.7 12 2Z" />
        </svg>
        <div
          style={{
            marginTop: 28,
            fontSize: 72,
            fontWeight: 700,
            color: '#F8FAFC',
            letterSpacing: -1,
          }}
        >
          ExamForge
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
