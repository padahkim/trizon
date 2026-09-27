"use client";

/** 확인 창을 띄운 뒤에만 제출되는 버튼 (삭제용) */
export function ConfirmSubmit(props: { message: string; children: React.ReactNode; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="submit"
      className={props.className ?? "btn-danger-quiet btn"}
      disabled={props.disabled}
      title={props.title}
      onClick={(e) => {
        if (!window.confirm(props.message)) e.preventDefault();
      }}
    >
      {props.children}
    </button>
  );
}
