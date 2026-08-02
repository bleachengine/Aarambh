import { ImageResponse } from 'next/og';

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
          backgroundColor: '#0B1220',
        }}
      >
        <svg width="104" height="104" viewBox="0 0 24 24" fill="#38BDF8">
          <path d="M12 2 14.3 9.7 22 12 14.3 14.3 12 22 9.7 14.3 2 12 9.7 9.7 12 2Z" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
