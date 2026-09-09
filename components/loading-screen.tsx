interface LoadingScreenProps {
  /** Optional - shown below the loader. Omit for the plain loader (e.g. the
   * exam-generation loading state, which stays unchanged on purpose). */
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps = {}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#e6f7ff] px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- animated gif, unoptimized passthrough */}
      <img src="/loader.gif" alt="Loading" width={320} height={240} className="h-auto w-full max-w-80" />
      {message && <p className="text-sm font-medium text-foreground/80">{message}</p>}
    </div>
  );
}
