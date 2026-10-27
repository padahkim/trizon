"use client";

export default function Error() {
  return (
    <main className="mx-auto max-w-(--container-max) px-6 py-12">
      <div role="alert" className="grid gap-4 rounded-xl bg-surface-raised p-6">
        <h1 className="text-title-lg">문제가 생겼습니다</h1>
        <p className="text-body-md text-ink-2">
          브라우저의 새로고침 버튼을 눌러 다시 불러옵니다.
        </p>
      </div>
    </main>
  );
}
