export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#e6f7ff]">
      {/* eslint-disable-next-line @next/next/no-img-element -- animated gif, unoptimized passthrough */}
      <img src="/loader.gif" alt="Loading" width={320} height={240} className="h-auto w-full max-w-80" />
    </div>
  );
}
