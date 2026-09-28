"use client";

type Props = {
  children: React.ReactNode;
  message: string;
  className?: string;
};

export function ConfirmSubmitButton({ children, message, className = "btn btn-danger" }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
